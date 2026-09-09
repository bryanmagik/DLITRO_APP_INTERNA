-- Authorization + RLS coverage for 20260818125656_authorization_rls_matrix_v2_business_hierarchy_fix.sql.
--
-- Source of truth: supabase/migrations/20260818125656_authorization_rls_matrix_v2_business_hierarchy_fix.sql
-- Covers exactly the four business-rule gaps closed there (jefe_bodega/logistica
-- branch+driver read, preparador shift read, tomador_pedidos closure annotation)
-- plus the superadmin >= admin hierarchy invariant and the is_admin() semantics change.
--
-- Everything in this file is synthetic and fully transactional: BEGIN ... ROLLBACK.
-- No statement here is ever committed. Safe to run against STAGING as many times as
-- needed. Do not run against PRODUCTION. Independent of and does not rely on fixtures
-- from any other file under supabase/tests/ — self-contained, own actor/id namespace
-- ('fbeef...') chosen to avoid any resemblance to the existing matrix suite's ids.

begin;

create temp table rls_hier_results (
  seq bigserial,
  actor text not null,
  resource text not null,
  action text not null,
  scope text not null,
  actual text not null,
  expected text not null,
  result text not null,
  detail text not null
) on commit drop;
grant all on rls_hier_results to authenticated;
grant usage on rls_hier_results_seq_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures.
-- ---------------------------------------------------------------------------

insert into public.sucursales (id, nombre, direccion, activo) values
  ('fbeef000-0000-4000-8000-00000000a001', 'Hierarchy Fix Sucursal A', 'Direccion sintetica A', true),
  ('fbeef000-0000-4000-8000-00000000b001', 'Hierarchy Fix Sucursal B', 'Direccion sintetica B', true);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, crypt(gen_random_uuid()::text, gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       now(), now(), '', '', '', ''
from (values
  ('fbeef001-0000-4000-8000-000000000001'::uuid, 'hier-jefebodega-a@test.local'),
  ('fbeef001-0000-4000-8000-000000000002'::uuid, 'hier-logistica-a@test.local'),
  ('fbeef001-0000-4000-8000-000000000003'::uuid, 'hier-preparador-a@test.local'),
  ('fbeef001-0000-4000-8000-000000000004'::uuid, 'hier-tomador-a@test.local'),
  ('fbeef001-0000-4000-8000-000000000005'::uuid, 'hier-admin-a@test.local'),
  ('fbeef001-0000-4000-8000-000000000006'::uuid, 'hier-superadmin-a@test.local'),
  ('fbeef001-0000-4000-8000-000000000008'::uuid, 'hier-driver-b@test.local'),
  ('fbeef001-0000-4000-8000-000000000009'::uuid, 'hier-tomador-b@test.local')
) as x(id, email);

insert into public.usuarios (id, nombre, apellido, rol, sucursal_id, activo) values
  ('fbeef001-0000-4000-8000-000000000001', 'Hier', 'Jefe Bodega A', 'jefe_bodega',     'fbeef000-0000-4000-8000-00000000a001', true),
  ('fbeef001-0000-4000-8000-000000000002', 'Hier', 'Logistica A',   'logistica',       'fbeef000-0000-4000-8000-00000000a001', true),
  ('fbeef001-0000-4000-8000-000000000003', 'Hier', 'Preparador A',  'preparador',      'fbeef000-0000-4000-8000-00000000a001', true),
  ('fbeef001-0000-4000-8000-000000000004', 'Hier', 'Tomador A',     'tomador_pedidos', 'fbeef000-0000-4000-8000-00000000a001', true),
  ('fbeef001-0000-4000-8000-000000000005', 'Hier', 'Admin A',       'admin',           'fbeef000-0000-4000-8000-00000000a001', true),
  ('fbeef001-0000-4000-8000-000000000006', 'Hier', 'Superadmin A',  'superadmin',      'fbeef000-0000-4000-8000-00000000a001', true),
  -- rol = 'logistica' driver/tracking record in a DIFFERENT branch: the only way
  -- jefe_bodega/logistica can see it is the new rol-based clause, not the pre-existing
  -- own-branch clause. This is what actually proves the fix, not just the permission grant.
  ('fbeef001-0000-4000-8000-000000000008', 'Hier', 'Driver B',      'logistica',       'fbeef000-0000-4000-8000-00000000b001', true),
  -- an unrelated role in the OTHER branch: must stay invisible to jefe_bodega/logistica.
  ('fbeef001-0000-4000-8000-000000000009', 'Hier', 'Tomador B',     'tomador_pedidos', 'fbeef000-0000-4000-8000-00000000b001', true);

insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('fbeef002-0000-4000-8000-00000000a001', 'fbeef000-0000-4000-8000-00000000a001', 'fbeef001-0000-4000-8000-000000000004', 'abierto', 0),
  ('fbeef002-0000-4000-8000-00000000b001', 'fbeef000-0000-4000-8000-00000000b001', 'fbeef001-0000-4000-8000-000000000009', 'abierto', 0);

-- private.role_permissions is revoked from authenticated (by design, it's only
-- readable through the SECURITY DEFINER helpers). SECTION 4 below needs the list
-- of admin's permissions to drive its loop, so it is captured here, as the
-- connecting/owner role, before the switch to `authenticated` further down.
create temp table admin_permissions_snapshot on commit drop as
select permission from private.role_permissions where role = 'admin';
grant select on admin_permissions_snapshot to authenticated;

-- ---------------------------------------------------------------------------
-- Helpers (identical technique to authorization_rls_matrix_v2_matrix.sql).
-- ---------------------------------------------------------------------------

create function pg_temp.as_actor(p_user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
$$;

create function pg_temp.chk_select(p_actor text, p_table text, p_scope text, p_id uuid, p_expected text)
returns void language plpgsql as $$
declare v_count bigint; v_actual text;
begin
  begin
    execute format('select count(*) from public.%I where id = $1', p_table) into v_count using p_id;
    v_actual := case when v_count > 0 then 'ALLOW' else 'DENY' end;
  exception when insufficient_privilege then
    v_actual := 'DENY';
  when others then
    v_actual := 'ERROR: ' || sqlerrm;
  end;
  insert into rls_hier_results (actor, resource, action, scope, actual, expected, result, detail)
  values (p_actor, p_table, 'SELECT', p_scope, v_actual, p_expected,
    case when v_actual = p_expected then 'PASS' else 'FAIL' end,
    format('rows_visible=%s', coalesce(v_count::text, 'n/a')));
end $$;

create function pg_temp.chk_update_noop(p_actor text, p_table text, p_scope text, p_id uuid, p_expected text)
returns void language plpgsql as $$
declare v_count bigint; v_actual text;
begin
  begin
    execute format('with x as (update public.%I set id = id where id = $1 returning 1) select count(*) from x', p_table)
      into v_count using p_id;
    v_actual := case when v_count = 1 then 'ALLOW' else 'DENY' end;
  exception when insufficient_privilege then
    v_actual := 'DENY';
  when others then
    v_actual := 'ERROR: ' || sqlerrm;
  end;
  insert into rls_hier_results (actor, resource, action, scope, actual, expected, result, detail)
  values (p_actor, p_table, 'UPDATE', p_scope, v_actual, p_expected,
    case when v_actual = p_expected then 'PASS' else 'FAIL' end, 'no-op update set id=id');
end $$;

create procedure pg_temp.record(p_actor text, p_table text, p_action text, p_scope text, p_actual text, p_expected text, p_detail text)
language sql as $$
  insert into rls_hier_results (actor, resource, action, scope, actual, expected, result, detail)
  values (p_actor, p_table, p_action, p_scope, p_actual, p_expected,
    case when p_actual = p_expected then 'PASS' else 'FAIL' end, p_detail);
$$;

create function pg_temp.chk_permission(p_actor text, p_permission text, p_expected boolean)
returns void language plpgsql as $$
declare v_actual boolean;
begin
  select private.has_permission(p_permission) into v_actual;
  insert into rls_hier_results (actor, resource, action, scope, actual, expected, result, detail)
  values (p_actor, 'private.has_permission', p_permission, 'n/a', v_actual::text, p_expected::text,
    case when v_actual = p_expected then 'PASS' else 'FAIL' end, 'direct has_permission() call');
end $$;

-- Actor id constants for readability below.
-- jefe_bodega_a=...0001 logistica_a=...0002 preparador_a=...0003 tomador_a=...0004
-- admin_a=...0005 superadmin_a=...0006 driver_b=...0008 (rol=logistica, branch B) tomador_b=...0009 (branch B)

set local role authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 1 — Regla 1/2: jefe_bodega / logistica.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbeef001-0000-4000-8000-000000000001'); -- jefe_bodega_a
select pg_temp.chk_permission('jefe_bodega_a', 'branches.read', true);
select pg_temp.chk_permission('jefe_bodega_a', 'users.read', true);
select pg_temp.chk_permission('jefe_bodega_a', 'users.create', false);
select pg_temp.chk_permission('jefe_bodega_a', 'users.manage', false);
-- can read its OWN branch and the OTHER branch (branches.read is global, not own-branch-limited)
select pg_temp.chk_select('jefe_bodega_a', 'sucursales', 'own_branch', 'fbeef000-0000-4000-8000-00000000a001', 'ALLOW');
select pg_temp.chk_select('jefe_bodega_a', 'sucursales', 'other_branch', 'fbeef000-0000-4000-8000-00000000b001', 'ALLOW');
-- can read a rol=logistica record in a DIFFERENT branch (the actual fix)
select pg_temp.chk_select('jefe_bodega_a', 'usuarios', 'cross_branch_driver_pool', 'fbeef001-0000-4000-8000-000000000008', 'ALLOW');
-- cannot read an unrelated role in a different branch (no cross-branch, no blanket read)
select pg_temp.chk_select('jefe_bodega_a', 'usuarios', 'cross_branch_unrelated_role', 'fbeef001-0000-4000-8000-000000000009', 'DENY');
-- no administrative capability over usuarios was granted: insert/update/delete must all fail
do $$
begin
  begin
    insert into public.usuarios (id, nombre, rol, sucursal_id)
    values ('fbeef003-0000-4000-8000-000000000001', 'Intento', 'logistica', 'fbeef000-0000-4000-8000-00000000a001');
    call pg_temp.record('jefe_bodega_a', 'usuarios', 'INSERT', 'no_users_create', 'ALLOW', 'DENY', 'jefe_bodega inserted a usuarios row without users.create -- unexpected');
  exception when insufficient_privilege then
    call pg_temp.record('jefe_bodega_a', 'usuarios', 'INSERT', 'no_users_create', 'DENY', 'DENY', 'blocked: jefe_bodega lacks users.create');
  end;
end $$;
select pg_temp.chk_update_noop('jefe_bodega_a', 'usuarios', 'no_users_manage', 'fbeef001-0000-4000-8000-000000000008', 'DENY');
-- NOTE: a bare DELETE never raises insufficient_privilege when RLS's USING clause
-- filters the row out -- it just deletes 0 rows and returns normally. The row
-- count (via GET DIAGNOSTICS), not the absence of an exception, is what proves
-- whether RLS actually blocked this.
do $$
declare v_count bigint;
begin
  delete from public.usuarios where id = 'fbeef001-0000-4000-8000-000000000008';
  get diagnostics v_count = row_count;
  call pg_temp.record('jefe_bodega_a', 'usuarios', 'DELETE', 'no_users_manage',
    case when v_count > 0 then 'ALLOW' else 'DENY' end, 'DENY',
    format('rows_deleted=%s (RLS-filtered deletes affect 0 rows without raising an exception)', v_count));
exception when insufficient_privilege then
  call pg_temp.record('jefe_bodega_a', 'usuarios', 'DELETE', 'no_users_manage', 'DENY', 'DENY', 'blocked: jefe_bodega lacks users.manage (table-grant level)');
end $$;
-- no visibility into unrelated administrative data was granted by this fix
select pg_temp.chk_select('jefe_bodega_a', 'clientes', 'no_clients_permission', 'fbeef001-0000-4000-8000-000000000001', 'DENY');

select pg_temp.as_actor('fbeef001-0000-4000-8000-000000000002'); -- logistica_a (same checks, distinct role)
select pg_temp.chk_permission('logistica_a', 'branches.read', true);
select pg_temp.chk_permission('logistica_a', 'users.read', true);
select pg_temp.chk_permission('logistica_a', 'users.create', false);
select pg_temp.chk_permission('logistica_a', 'users.manage', false);
select pg_temp.chk_select('logistica_a', 'sucursales', 'other_branch', 'fbeef000-0000-4000-8000-00000000b001', 'ALLOW');
select pg_temp.chk_select('logistica_a', 'usuarios', 'cross_branch_driver_pool', 'fbeef001-0000-4000-8000-000000000008', 'ALLOW');
select pg_temp.chk_select('logistica_a', 'usuarios', 'cross_branch_unrelated_role', 'fbeef001-0000-4000-8000-000000000009', 'DENY');
select pg_temp.chk_update_noop('logistica_a', 'usuarios', 'no_users_manage', 'fbeef001-0000-4000-8000-000000000008', 'DENY');

-- ---------------------------------------------------------------------------
-- SECTION 2 — Regla 3: preparador reads the turno CocinaPage needs, own branch only.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbeef001-0000-4000-8000-000000000003'); -- preparador_a
select pg_temp.chk_permission('preparador_a', 'shifts.read', true);
select pg_temp.chk_permission('preparador_a', 'shifts.open', false);
select pg_temp.chk_permission('preparador_a', 'shifts.close', false);
select pg_temp.chk_select('preparador_a', 'turnos', 'own_branch_open', 'fbeef002-0000-4000-8000-00000000a001', 'ALLOW');
select pg_temp.chk_select('preparador_a', 'turnos', 'other_branch', 'fbeef002-0000-4000-8000-00000000b001', 'DENY');
-- read-only: shifts.read alone must not let preparador modify the turno
select pg_temp.chk_update_noop('preparador_a', 'turnos', 'read_only_shifts_read', 'fbeef002-0000-4000-8000-00000000a001', 'DENY');

-- ---------------------------------------------------------------------------
-- SECTION 3 — Regla 4: tomador_pedidos can annotate a shift handover, not correct closures.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbeef001-0000-4000-8000-000000000004'); -- tomador_a
select pg_temp.chk_permission('tomador_a', 'closures.annotate', true);
select pg_temp.chk_permission('tomador_a', 'closures.correct', false);
do $$
begin
  begin
    insert into public.cambios_turno
      (id, turno_id, tomador_saliente_id, tomador_entrante_id, efectivo_sistema, efectivo_declarado, observacion)
    values
      ('fbeef004-0000-4000-8000-00000000a001', 'fbeef002-0000-4000-8000-00000000a001',
       'fbeef001-0000-4000-8000-000000000004', 'fbeef001-0000-4000-8000-000000000004', 0, 0, 'Cambio de turno sintetico');
    call pg_temp.record('tomador_a', 'cambios_turno', 'INSERT', 'own_turno', 'ALLOW', 'ALLOW', 'tomador_pedidos can now register the handover it performs');
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'cambios_turno', 'INSERT', 'own_turno', 'DENY', 'ALLOW', 'unexpectedly blocked: closures.annotate should permit this');
  end;
end $$;
-- cross-branch: turno_in_scope() must still deny a turno outside tomador_a's branch
do $$
begin
  begin
    insert into public.cambios_turno
      (id, turno_id, tomador_saliente_id, tomador_entrante_id, efectivo_sistema, efectivo_declarado, observacion)
    values
      ('fbeef004-0000-4000-8000-00000000b001', 'fbeef002-0000-4000-8000-00000000b001',
       'fbeef001-0000-4000-8000-000000000009', 'fbeef001-0000-4000-8000-000000000009', 0, 0, 'Cambio de turno ajeno');
    call pg_temp.record('tomador_a', 'cambios_turno', 'INSERT', 'other_branch', 'ALLOW', 'DENY', 'tomador_a annotated a change on branch B''s turno -- cross-branch leak');
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'cambios_turno', 'INSERT', 'other_branch', 'DENY', 'DENY', 'blocked: turno_in_scope() denies the other branch');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- SECTION 4 — Regla 5: superadmin >= admin, exhaustively, plus a real row-level check.
-- ---------------------------------------------------------------------------

do $$
declare perm record; v_admin boolean; v_superadmin boolean;
begin
  for perm in select distinct permission from admin_permissions_snapshot order by 1 loop
    perform pg_temp.as_actor('fbeef001-0000-4000-8000-000000000005'); -- admin_a
    select private.has_permission(perm.permission) into v_admin;
    call pg_temp.record('admin_a', 'private.has_permission', perm.permission, 'hierarchy_invariant',
      v_admin::text, 'true', 'baseline: admin must have every permission its own role_permissions row grants it');

    perform pg_temp.as_actor('fbeef001-0000-4000-8000-000000000006'); -- superadmin_a
    select private.has_permission(perm.permission) into v_superadmin;
    call pg_temp.record('superadmin_a', 'private.has_permission', perm.permission, 'hierarchy_invariant',
      v_superadmin::text, 'true', 'superadmin >= admin: since admin has this permission, superadmin must have it too');
  end loop;
end $$;

select pg_temp.as_actor('fbeef001-0000-4000-8000-000000000006'); -- superadmin_a
select pg_temp.chk_permission('superadmin_a', 'clients.read', true);
select pg_temp.chk_permission('superadmin_a', 'clients.manage', true);
select pg_temp.chk_permission('superadmin_a', 'client_addresses.read', true);
select pg_temp.chk_permission('superadmin_a', 'client_addresses.manage', true);

insert into public.clientes (id, nombre) values ('fbeef005-0000-4000-8000-000000000001', 'Hier Cliente');
select pg_temp.chk_select('superadmin_a', 'clientes', 'hierarchy_fix_real_row', 'fbeef005-0000-4000-8000-000000000001', 'ALLOW');
select pg_temp.chk_update_noop('superadmin_a', 'clientes', 'hierarchy_fix_manage', 'fbeef005-0000-4000-8000-000000000001', 'ALLOW');

-- ---------------------------------------------------------------------------
-- SECTION 5 — is_admin() semantics (Fase 4).
-- ---------------------------------------------------------------------------

do $$
declare v_result boolean;
begin
  perform pg_temp.as_actor('fbeef001-0000-4000-8000-000000000005'); -- admin_a
  select public.is_admin('fbeef001-0000-4000-8000-000000000005'::uuid) into v_result;
  call pg_temp.record('admin_a', 'public.is_admin', 'FUNCTION', 'own_id', v_result::text, 'true', 'admin must still satisfy is_admin()');

  perform pg_temp.as_actor('fbeef001-0000-4000-8000-000000000006'); -- superadmin_a
  select public.is_admin('fbeef001-0000-4000-8000-000000000006'::uuid) into v_result;
  call pg_temp.record('superadmin_a', 'public.is_admin', 'FUNCTION', 'own_id', v_result::text, 'true', 'superadmin must now satisfy is_admin() (historical semantics restored)');

  perform pg_temp.as_actor('fbeef001-0000-4000-8000-000000000004'); -- tomador_a
  select public.is_admin('fbeef001-0000-4000-8000-000000000004'::uuid) into v_result;
  call pg_temp.record('tomador_a', 'public.is_admin', 'FUNCTION', 'own_id', v_result::text, 'false', 'operational role must not satisfy is_admin()');
end $$;

-- ---------------------------------------------------------------------------
-- SECTION 6 — Negative tests explicitly requested for this task (Fase 7),
-- re-verified here against the modified policy so a regression in this exact
-- migration would be caught immediately, not only by the pre-existing suite.
-- ---------------------------------------------------------------------------

-- self-escalation: a non-admin must never be able to grant themselves rol='admin'.
-- Same caveat as the DELETE check above: an RLS-filtered UPDATE affects 0 rows
-- without raising insufficient_privilege, so row_count is the real signal.
select pg_temp.as_actor('fbeef001-0000-4000-8000-000000000004'); -- tomador_a, own row
do $$
declare v_count bigint;
begin
  update public.usuarios set rol = 'admin' where id = 'fbeef001-0000-4000-8000-000000000004';
  get diagnostics v_count = row_count;
  call pg_temp.record('tomador_a', 'usuarios', 'UPDATE', 'self_privilege_escalation',
    case when v_count > 0 then 'ALLOW' else 'DENY' end, 'DENY',
    format('rows_updated=%s -- CRITICAL if ALLOW', v_count));
exception when insufficient_privilege then
  call pg_temp.record('tomador_a', 'usuarios', 'UPDATE', 'self_privilege_escalation', 'DENY', 'DENY', 'blocked: usuarios_update_v2 requires users.manage, which tomador_pedidos lacks (table-grant level)');
end $$;

-- ---------------------------------------------------------------------------
-- Report and rollback. Nothing above this line is ever persisted.
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'total', (select count(*) from rls_hier_results),
  'pass', (select count(*) from rls_hier_results where result = 'PASS'),
  'fail', (select count(*) from rls_hier_results where result = 'FAIL'),
  'failures', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_hier_results r where result = 'FAIL'),
  'all_results', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_hier_results r)
) as report;

rollback;
