-- RPC / SECURITY DEFINER function boundary tests for authorization_rls_matrix_v2.
--
-- Goal: confirm that private.* helpers and public.is_admin() cannot be used by an
-- authenticated-but-unprivileged caller to (a) learn another user's role/branch/
-- admin-status, (b) get a truthful answer inflated beyond their real permissions,
-- or (c) reach private.role_permissions directly and bypass has_permission().
--
-- Self-contained, fully transactional: BEGIN ... ROLLBACK. Safe to re-run on STAGING.

begin;

create temp table rls_v2_rpc_results (
  seq bigserial,
  actor text not null,
  case_name text not null,
  actual text not null,
  expected text not null,
  result text not null,
  detail text not null
) on commit drop;
grant all on rls_v2_rpc_results to authenticated;
grant usage on rls_v2_rpc_results_seq_seq to authenticated;

insert into public.sucursales (id, nombre, direccion, activo) values
  ('eaaaaaaa-0000-4000-8000-00000000000a', 'RPC V2 Sucursal A', 'Direccion sintetica A', true),
  ('eaaaaaaa-0000-4000-8000-00000000000b', 'RPC V2 Sucursal B', 'Direccion sintetica B', true);

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
  ('ebbbbbbb-0000-4000-8000-000000000001'::uuid, 'rpc-v2-admin@test.local'),
  ('ebbbbbbb-0000-4000-8000-000000000002'::uuid, 'rpc-v2-despachador@test.local')
) as x(id, email);

insert into public.usuarios (id, nombre, rol, sucursal_id, activo) values
  ('ebbbbbbb-0000-4000-8000-000000000001', 'RPC Admin',       'admin',       'eaaaaaaa-0000-4000-8000-00000000000a', true),
  ('ebbbbbbb-0000-4000-8000-000000000002', 'RPC Despachador', 'despachador', 'eaaaaaaa-0000-4000-8000-00000000000a', true);

create function pg_temp.as_actor(p_user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
$$;

create procedure pg_temp.record(p_actor text, p_case text, p_actual text, p_expected text, p_detail text)
language sql as $$
  insert into rls_v2_rpc_results (actor, case_name, actual, expected, result, detail)
  values (p_actor, p_case, p_actual, p_expected,
    case when p_actual = p_expected then 'PASS' else 'FAIL' end, p_detail);
$$;

-- ---------------------------------------------------------------------------
-- EXECUTE grants (checked directly against pg_proc / role privileges, no
-- impersonation needed for this section).
-- ---------------------------------------------------------------------------

do $$
declare
  f record;
  v_anon boolean;
  v_auth boolean;
begin
  for f in
    select * from (values
      ('private','current_app_role',      array[]::text[]),
      ('private','current_sucursal_id',   array[]::text[]),
      ('private','has_permission',        array['text']),
      ('private','has_global_scope',      array[]::text[]),
      ('private','can_access_sucursal',   array['uuid']),
      ('private','turno_in_scope',        array['uuid']),
      ('private','turno_is_open',         array['uuid']),
      ('private','pedido_in_scope',       array['uuid']),
      ('public', 'is_admin',              array['uuid'])
    ) as x(schema_name, func_name, arg_types)
  loop
    execute format('select has_function_privilege(''anon'', ''%I.%I(%s)'', ''EXECUTE'')',
      f.schema_name, f.func_name, array_to_string(f.arg_types, ',')) into v_anon;
    execute format('select has_function_privilege(''authenticated'', ''%I.%I(%s)'', ''EXECUTE'')',
      f.schema_name, f.func_name, array_to_string(f.arg_types, ',')) into v_auth;

    call pg_temp.record('anon', format('EXECUTE grant on %I.%I', f.schema_name, f.func_name),
      case when v_anon then 'GRANTED' else 'NOT_GRANTED' end, 'NOT_GRANTED',
      'anon must never execute authorization helpers');
    call pg_temp.record('authenticated', format('EXECUTE grant on %I.%I', f.schema_name, f.func_name),
      case when v_auth then 'GRANTED' else 'NOT_GRANTED' end, 'GRANTED',
      'authenticated is expected to execute this helper (used inside v2 policies)');
  end loop;
end $$;

-- Legacy helpers superseded by the private.* model. harden_function_security.sql
-- (2026-08-14 04:28) revoked EXECUTE on these from authenticated, but the LATER
-- authorization_rls_v1_safe_identity_helpers.sql (2026-08-14 16:28) re-created
-- both functions with an explicit self-check (`_user_id = auth.uid() AND
-- u.id = auth.uid()`) and re-granted EXECUTE to authenticated. So being callable
-- is the current, intended state -- the earlier "should stay revoked" read was
-- based on only the first of two migrations that touched these functions. What
-- actually matters is whether the self-check holds, verified directly below.
do $$
declare v_auth boolean;
begin
  select has_function_privilege('authenticated', 'public.get_user_rol(uuid)', 'EXECUTE') into v_auth;
  call pg_temp.record('authenticated', 'EXECUTE grant on public.get_user_rol(uuid) [legacy, self-check guarded]',
    case when v_auth then 'GRANTED' else 'NOT_GRANTED' end, 'GRANTED',
    're-granted by authorization_rls_v1_safe_identity_helpers.sql after adding the self-check guard');

  select has_function_privilege('authenticated', 'public.get_user_sucursal(uuid)', 'EXECUTE') into v_auth;
  call pg_temp.record('authenticated', 'EXECUTE grant on public.get_user_sucursal(uuid) [legacy, self-check guarded]',
    case when v_auth then 'GRANTED' else 'NOT_GRANTED' end, 'GRANTED',
    're-granted by authorization_rls_v1_safe_identity_helpers.sql after adding the self-check guard');
end $$;

-- ---------------------------------------------------------------------------
-- Direct calls: do the helpers return truthful, non-escalating answers?
-- ---------------------------------------------------------------------------

-- Everything from here on runs AS 'authenticated', not as the superuser/owner
-- connection used for fixture setup above (which would bypass RLS/grants entirely).
set local role authenticated;

select pg_temp.as_actor('ebbbbbbb-0000-4000-8000-000000000002'); -- despachador (near-zero perms)

do $$
declare v boolean;
begin
  select private.has_permission('users.manage') into v;
  call pg_temp.record('despachador', 'has_permission(users.manage) as low-priv role', case when v then 'true' else 'false' end, 'false', 'must not report a permission despachador does not hold');

  select private.has_permission('catalog.read') into v;
  call pg_temp.record('despachador', 'has_permission(catalog.read) as low-priv role', case when v then 'true' else 'false' end, 'true', 'despachador does hold this one -- sanity check the function is not just always-false');

  select private.can_access_sucursal('eaaaaaaa-0000-4000-8000-00000000000b') into v;
  call pg_temp.record('despachador', 'can_access_sucursal(other branch) as branch-scoped role', case when v then 'true' else 'false' end, 'false', 'despachador is not global scope; must not reach Branch B');

  select private.can_access_sucursal('eaaaaaaa-0000-4000-8000-00000000000a') into v;
  call pg_temp.record('despachador', 'can_access_sucursal(own branch)', case when v then 'true' else 'false' end, 'true', 'sanity check');
end $$;

do $$
declare v_rol text; v_sucursal uuid;
begin
  -- Enumeration probe against the legacy self-check-guarded helpers: ask about
  -- the admin actor's role/branch while logged in as despachador. Must return
  -- NULL (the WHERE _user_id = auth.uid() clause excludes every row) purely
  -- because the argument isn't the caller's own id.
  select public.get_user_rol('ebbbbbbb-0000-4000-8000-000000000001') into v_rol; -- arg = admin's id
  call pg_temp.record('despachador', 'get_user_rol(<other real admin id>) -- enumeration probe',
    coalesce(v_rol, 'NULL'), 'NULL', 'must return NULL: the function only ever resolves the callers own row');

  select public.get_user_sucursal('ebbbbbbb-0000-4000-8000-000000000001') into v_sucursal; -- arg = admin's id
  call pg_temp.record('despachador', 'get_user_sucursal(<other real admin id>) -- enumeration probe',
    coalesce(v_sucursal::text, 'NULL'), 'NULL', 'must return NULL: the function only ever resolves the callers own row');

  select public.get_user_rol('ebbbbbbb-0000-4000-8000-000000000002') into v_rol; -- arg = self
  call pg_temp.record('despachador', 'get_user_rol(self)', coalesce(v_rol, 'NULL'), 'despachador', 'sanity check: self-check passes and reports the true role');
end $$;

do $$
declare v boolean;
begin
  -- Enumeration probe: ask is_admin() about a DIFFERENT user (the admin actor),
  -- not the caller. Must be false purely because the argument != auth.uid(),
  -- regardless of whether that other user really is an admin.
  select public.is_admin('ebbbbbbb-0000-4000-8000-000000000001') into v; -- arg = admin's id, caller = despachador
  call pg_temp.record('despachador', 'is_admin(<other real admin id>) -- enumeration probe', case when v then 'true' else 'false' end, 'false', 'is_admin must only ever answer about the caller, never about an arbitrary uuid argument');

  select public.is_admin('ebbbbbbb-0000-4000-8000-000000000002') into v; -- arg = self, caller = despachador (not admin)
  call pg_temp.record('despachador', 'is_admin(self) while not admin', case when v then 'true' else 'false' end, 'false', 'sanity check: self-check passes but role is not admin');
end $$;

select pg_temp.as_actor('ebbbbbbb-0000-4000-8000-000000000001'); -- admin
do $$
declare v boolean;
begin
  select public.is_admin('ebbbbbbb-0000-4000-8000-000000000001') into v; -- arg = self
  call pg_temp.record('admin', 'is_admin(self) while admin', case when v then 'true' else 'false' end, 'true', 'sanity check: real admin, self-check passes');

  select public.is_admin('ebbbbbbb-0000-4000-8000-000000000002') into v; -- arg = despachador's id, caller = admin
  call pg_temp.record('admin', 'is_admin(<other users id>) called by a real admin -- enumeration probe', case when v then 'true' else 'false' end, 'false', 'even a real admin cannot use is_admin() to ask about someone else -- function design is self-check only, by argument, not by caller role');

  select private.has_permission('users.manage') into v;
  call pg_temp.record('admin', 'has_permission(users.manage) as admin', case when v then 'true' else 'false' end, 'true', 'sanity check');

  select private.can_access_sucursal('eaaaaaaa-0000-4000-8000-00000000000b') into v;
  call pg_temp.record('admin', 'can_access_sucursal(other branch) as global-scope role', case when v then 'true' else 'false' end, 'true', 'admin is global scope by has_global_scope()');
end $$;

-- ---------------------------------------------------------------------------
-- Direct table access to private.role_permissions must stay closed: the only
-- sanctioned path is through private.has_permission(), not a raw table read.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('ebbbbbbb-0000-4000-8000-000000000002'); -- despachador
do $$
declare v_count bigint;
begin
  begin
    select count(*) into v_count from private.role_permissions;
    call pg_temp.record('despachador', 'direct SELECT on private.role_permissions', 'ALLOW', 'DENY', format('unexpectedly read %s rows directly, bypassing has_permission()', v_count));
  exception when insufficient_privilege then
    call pg_temp.record('despachador', 'direct SELECT on private.role_permissions', 'DENY', 'DENY', 'blocked: no table grant on private.role_permissions for authenticated');
  end;
end $$;

select jsonb_build_object(
  'total', (select count(*) from rls_v2_rpc_results),
  'pass', (select count(*) from rls_v2_rpc_results where result = 'PASS'),
  'fail', (select count(*) from rls_v2_rpc_results where result = 'FAIL'),
  'failures', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_rpc_results r where result = 'FAIL'),
  'all_results', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_rpc_results r)
) as report;

rollback;
