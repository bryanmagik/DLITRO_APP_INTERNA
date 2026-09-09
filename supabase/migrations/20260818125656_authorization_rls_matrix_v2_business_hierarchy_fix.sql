-- RLS v2 business hierarchy fix.
--
-- Follow-up to 20260816014215_authorization_rls_matrix_v2.sql. Does NOT edit that
-- migration (already applied on staging-security). Resolves the business-rule
-- conflicts documented in the P1 production audit by making the minimum data and
-- policy changes needed — it does not rewrite the v2 model.
--
-- Official hierarchy (business decision): superadmin > admin > encargado > roles
-- operativos. superadmin must hold every operational/administrative permission
-- that admin holds, unless an exception is explicitly documented. No such
-- exception was documented for the customer directory, so it is closed as a
-- hierarchy bug rather than kept as a special case.
--
-- Scope of this migration:
--   1. jefe_bodega / logistica: grant branches.read (sucursales_read_v2 already
--      supports this permission generically) and a narrowly-scoped read of the
--      driver pool (usuarios.rol = 'logistica') they manage via ChoferesPage.
--      Neither role receives users.create or users.manage.
--   2. preparador: grant shifts.read. turnos_read_v2 already scopes this to the
--      caller's own branch via can_access_sucursal(); no policy change needed.
--   3. tomador_pedidos: grant closures.annotate. cambios_turno_write_v2 already
--      requires exactly this permission, scoped to the caller's own turno via
--      turno_in_scope(); no policy change needed. tomador_pedidos does not
--      receive closures.correct.
--   4. superadmin: grant clients.read, clients.manage, client_addresses.read,
--      client_addresses.manage, closing the only admin=true/superadmin=false gap
--      that exists in private.role_permissions today.
--   5. public.is_admin(uuid): redefined to mean admin OR superadmin (restoring
--      the historical semantics), consistent with the corrected hierarchy. No
--      current policy or function depends on the old (admin-only) meaning —
--      confirmed by inspecting pg_policies and pg_proc.prosrc for every
--      'is_admin(' reference in the public/private schemas before this change.
--
-- Not in scope: no real user rows are reassigned; no other permission is added
-- "just in case"; no table/policy outside usuarios_read_v2 is touched; storage
-- policies are untouched.

-- ---------------------------------------------------------------------------
-- 1. jefe_bodega / logistica — branch read (sucursales_read_v2 already checks
--    has_permission('branches.read') for any role, no policy change needed).
-- ---------------------------------------------------------------------------
insert into private.role_permissions (role, permission)
values
  ('jefe_bodega', 'branches.read'),
  ('logistica', 'branches.read')
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------------------
-- 2. preparador — shifts.read (turnos_read_v2 already scopes this to the
--    caller's own branch via can_access_sucursal(), no policy change needed).
-- ---------------------------------------------------------------------------
insert into private.role_permissions (role, permission)
values
  ('preparador', 'shifts.read')
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------------------
-- 3. tomador_pedidos — closures.annotate (cambios_turno_write_v2 already
--    requires exactly this permission, scoped via turno_in_scope(), no policy
--    change needed). closures.correct is deliberately NOT granted.
-- ---------------------------------------------------------------------------
insert into private.role_permissions (role, permission)
values
  ('tomador_pedidos', 'closures.annotate')
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------------------
-- 4. superadmin >= admin — close the customer-directory gap. This is the only
--    admin=true/superadmin=false pair in the matrix today.
-- ---------------------------------------------------------------------------
insert into private.role_permissions (role, permission)
values
  ('superadmin', 'clients.read'),
  ('superadmin', 'clients.manage'),
  ('superadmin', 'client_addresses.read'),
  ('superadmin', 'client_addresses.manage')
on conflict (role, permission) do nothing;

-- ---------------------------------------------------------------------------
-- 5. usuarios_read_v2 — narrow addition: jefe_bodega/logistica may read basic
--    fields of the driver pool (rol = 'logistica') they manage, in addition to
--    their own row. Does not grant visibility into any other role's row, and
--    does not grant users.create/users.manage. Same has_permission('users.read')
--    gate as before; only the scoping clause is extended.
-- ---------------------------------------------------------------------------
insert into private.role_permissions (role, permission)
values
  ('jefe_bodega', 'users.read'),
  ('logistica', 'users.read')
on conflict (role, permission) do nothing;

drop policy if exists usuarios_read_v2 on public.usuarios;
create policy usuarios_read_v2 on public.usuarios for select to authenticated
using (
  id = (select auth.uid())
  or (private.has_permission('users.read') and (
    private.current_app_role() in ('admin', 'superadmin')
    or sucursal_id = private.current_sucursal_id()
    or (private.current_app_role() in ('jefe_bodega', 'logistica') and rol = 'logistica')
  ))
);

-- ---------------------------------------------------------------------------
-- 6. is_admin(uuid): restore historical semantics (admin OR superadmin),
--    consistent with the corrected hierarchy. No policy or function currently
--    depends on the admin-only meaning (verified before this migration).
-- ---------------------------------------------------------------------------
create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select _user_id = (select auth.uid())
    and private.current_app_role() in ('admin', 'superadmin')
$$;
revoke all on function public.is_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Fail the migration atomically if the hierarchy invariant does not hold:
--    every permission admin has, superadmin must also have. No exception is
--    currently documented, so none is coded here.
-- ---------------------------------------------------------------------------
do $$
declare missing record;
begin
  for missing in
    select rp.permission
    from private.role_permissions rp
    where rp.role = 'admin'
      and not exists (
        select 1 from private.role_permissions rp2
        where rp2.role = 'superadmin' and rp2.permission = rp.permission
      )
  loop
    raise exception 'RLS v2 hierarchy invariant failed: admin has permission % that superadmin lacks', missing.permission;
  end loop;
end $$;
