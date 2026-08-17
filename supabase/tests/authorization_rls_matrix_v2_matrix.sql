-- Authorization + RLS matrix for authorization_rls_matrix_v2.
--
-- Source of truth: supabase/migrations/20260816014215_authorization_rls_matrix_v2.sql
-- (private.role_permissions, private.has_permission(), private.can_access_sucursal(),
-- private.turno_in_scope(), private.pedido_in_scope(), and the "_v2" policies built on them).
--
-- Everything in this file is synthetic and fully transactional: BEGIN ... ROLLBACK.
-- No statement here is ever committed. Safe to run against STAGING as many times as needed.
-- Do not run against PRODUCTION.
--
-- Actor simulation follows the same technique as authorization_rls_hardening_v1_matrix.sql:
-- `set local role authenticated` + `set_config('request.jwt.claims', ...)` to make
-- `auth.uid()` resolve to a synthetic public.usuarios row, without any real Auth login.

begin;

create temp table rls_v2_results (
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
grant all on rls_v2_results to authenticated;
grant usage on rls_v2_results_seq_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures (created as the connecting role, before any impersonation).
-- ---------------------------------------------------------------------------

insert into public.sucursales (id, nombre, direccion, activo) values
  ('faaaaaaa-0000-4000-8000-00000000000a', 'RLS V2 Sucursal A', 'Dirección sintética A', true),
  ('faaaaaaa-0000-4000-8000-00000000000b', 'RLS V2 Sucursal B', 'Dirección sintética B', true);

-- Synthetic Auth identities. public.usuarios.id has a FK to auth.users(id), so a matching
-- row is required, but no real login/identity is needed since auth.uid() is simulated below.
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
  ('fbbbbbbb-0000-4000-8000-000000000001'::uuid, 'rls-v2-admin-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000002'::uuid, 'rls-v2-superadmin-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000003'::uuid, 'rls-v2-encargado-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000004'::uuid, 'rls-v2-tomador-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000005'::uuid, 'rls-v2-preparador-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000006'::uuid, 'rls-v2-despachador-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000007'::uuid, 'rls-v2-jefebodega-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000008'::uuid, 'rls-v2-logistica-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-000000000009'::uuid, 'rls-v2-contador-a@test.local'),
  ('fbbbbbbb-0000-4000-8000-00000000000b'::uuid, 'rls-v2-tomador-b@test.local'),
  ('fbbbbbbb-0000-4000-8000-00000000000c'::uuid, 'rls-v2-despachador-b@test.local'),
  -- Candidate ids for INSERT-into-usuarios attempts below. A matching auth.users
  -- row must pre-exist to satisfy usuarios_id_fkey regardless of what RLS decides;
  -- in production this row would come from auth.admin.createUser() inside the
  -- crear-usuario Edge Function before the public.usuarios insert is attempted.
  ('f0000000-0000-4000-8000-0000000000f1'::uuid, 'rls-v2-candidate-f1@test.local'),
  ('f0000000-0000-4000-8000-0000000000f2'::uuid, 'rls-v2-candidate-f2@test.local'),
  ('f0000000-0000-4000-8000-0000000000f3'::uuid, 'rls-v2-candidate-f3@test.local'),
  ('f0000000-0000-4000-8000-0000000000f4'::uuid, 'rls-v2-candidate-f4@test.local')
) as x(id, email);

insert into public.usuarios (id, nombre, apellido, rol, sucursal_id, activo) values
  ('fbbbbbbb-0000-4000-8000-000000000001', 'RLS V2', 'Admin A',        'admin',           'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000002', 'RLS V2', 'Superadmin A',   'superadmin',      'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000003', 'RLS V2', 'Encargado A',    'encargado',       'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000004', 'RLS V2', 'Tomador A',      'tomador_pedidos', 'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000005', 'RLS V2', 'Preparador A',   'preparador',      'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000006', 'RLS V2', 'Despachador A',  'despachador',     'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000007', 'RLS V2', 'Jefe Bodega A',  'jefe_bodega',     'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000008', 'RLS V2', 'Logistica A',    'logistica',       'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-000000000009', 'RLS V2', 'Contador A',     'contador_rrhh',   'faaaaaaa-0000-4000-8000-00000000000a', true),
  ('fbbbbbbb-0000-4000-8000-00000000000b', 'RLS V2', 'Tomador B',      'tomador_pedidos', 'faaaaaaa-0000-4000-8000-00000000000b', true),
  ('fbbbbbbb-0000-4000-8000-00000000000c', 'RLS V2', 'Despachador B',  'despachador',     'faaaaaaa-0000-4000-8000-00000000000b', true);

insert into public.categorias (id, nombre) values
  ('fcccccc0-0000-4000-8000-000000000001', 'RLS V2 Categoria');
insert into public.productos (id, nombre, precio, categoria_id) values
  ('fcccccc0-0000-4000-8000-000000000002', 'RLS V2 Producto', 1000, 'fcccccc0-0000-4000-8000-000000000001');
insert into public.insumos (id, nombre, tipo, costo_unitario) values
  ('fcccccc0-0000-4000-8000-000000000003', 'RLS V2 Insumo', 'materia_prima', 100);
insert into public.clientes (id, nombre) values
  ('fcccccc1-0000-4000-8000-000000000001', 'RLS V2 Cliente');
insert into public.direcciones_cliente (id, cliente_id, direccion) values
  ('fcccccc1-0000-4000-8000-000000000002', 'fcccccc1-0000-4000-8000-000000000001', 'Direccion sintetica');

-- Branch A business rows, owned by Tomador A / Despachador A.
insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('fddddddd-0000-4000-8000-00000000a001', 'faaaaaaa-0000-4000-8000-00000000000a', 'fbbbbbbb-0000-4000-8000-000000000004', 'abierto', 0);
insert into public.turno_despachadores (id, turno_id, despachador_id, activo) values
  ('fddddddd-0000-4000-8000-00000000a003', 'fddddddd-0000-4000-8000-00000000a001', 'fbbbbbbb-0000-4000-8000-000000000006', true);
insert into public.pedidos (id, turno_id, sucursal_id, tomador_id, cliente_nombre, tipo, subtotal, descuento, costo_despacho, total) values
  ('fddddddd-0000-4000-8000-00000000a004', 'fddddddd-0000-4000-8000-00000000a001', 'faaaaaaa-0000-4000-8000-00000000000a', 'fbbbbbbb-0000-4000-8000-000000000004', 'RLS V2 A', 'retiro', 1000, 0, 0, 1000);
insert into public.pedido_items (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal) values
  ('fddddddd-0000-4000-8000-00000000a005', 'fddddddd-0000-4000-8000-00000000a004', 'fcccccc0-0000-4000-8000-000000000002', 1, 1000, 1000);
insert into public.pagos_turno (id, turno_id, metodo, monto) values
  ('fddddddd-0000-4000-8000-00000000a006', 'fddddddd-0000-4000-8000-00000000a001', 'efectivo', 1000);
insert into public.gastos_turno (id, turno_id, concepto, monto) values
  ('fddddddd-0000-4000-8000-00000000a007', 'fddddddd-0000-4000-8000-00000000a001', 'RLS V2 gasto', 500);
insert into public.stock_sucursal (id, insumo_id, sucursal_id, cantidad) values
  ('fddddddd-0000-4000-8000-00000000a008', 'fcccccc0-0000-4000-8000-000000000003', 'faaaaaaa-0000-4000-8000-00000000000a', 10);
insert into public.asistencia (id, usuario_id, turno_id, sucursal_id) values
  ('fddddddd-0000-4000-8000-00000000a009', 'fbbbbbbb-0000-4000-8000-000000000004', 'fddddddd-0000-4000-8000-00000000a001', 'faaaaaaa-0000-4000-8000-00000000000a');
insert into public.inventarios_parciales (id, turno_id, sucursal_id, usuario_id) values
  ('fddddddd-0000-4000-8000-00000000a00a', 'fddddddd-0000-4000-8000-00000000a001', 'faaaaaaa-0000-4000-8000-00000000000a', 'fbbbbbbb-0000-4000-8000-000000000004');
insert into public.inventarios_parciales_items (id, inventario_id, insumo_id, cantidad_real) values
  ('fddddddd-0000-4000-8000-00000000a00b', 'fddddddd-0000-4000-8000-00000000a00a', 'fcccccc0-0000-4000-8000-000000000003', 5);
insert into public.pedidos_logistica (id, sucursal_id, estado) values
  ('fddddddd-0000-4000-8000-00000000a00c', 'faaaaaaa-0000-4000-8000-00000000000a', 'borrador');
insert into public.pedidos_logistica_items (id, pedido_id, insumo_id, cantidad_solicitada) values
  ('fddddddd-0000-4000-8000-00000000a00d', 'fddddddd-0000-4000-8000-00000000a00c', 'fcccccc0-0000-4000-8000-000000000003', 5);
insert into public.configuracion_sucursal (id, sucursal_id) values
  ('fddddddd-0000-4000-8000-00000000a00e', 'faaaaaaa-0000-4000-8000-00000000000a');

-- Branch B business rows, owned by Tomador B / Despachador B. These are the "victim" rows
-- Branch A actors must never be able to see, modify, or delete.
insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('feeeeeee-0000-4000-8000-00000000b001', 'faaaaaaa-0000-4000-8000-00000000000b', 'fbbbbbbb-0000-4000-8000-00000000000b', 'abierto', 0);
insert into public.turno_despachadores (id, turno_id, despachador_id, activo) values
  ('feeeeeee-0000-4000-8000-00000000b002', 'feeeeeee-0000-4000-8000-00000000b001', 'fbbbbbbb-0000-4000-8000-00000000000c', true);
insert into public.pedidos (id, turno_id, sucursal_id, tomador_id, cliente_nombre, tipo, subtotal, descuento, costo_despacho, total) values
  ('feeeeeee-0000-4000-8000-00000000b003', 'feeeeeee-0000-4000-8000-00000000b001', 'faaaaaaa-0000-4000-8000-00000000000b', 'fbbbbbbb-0000-4000-8000-00000000000b', 'RLS V2 B', 'retiro', 1000, 0, 0, 1000);
insert into public.pedido_items (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal) values
  ('feeeeeee-0000-4000-8000-00000000b004', 'feeeeeee-0000-4000-8000-00000000b003', 'fcccccc0-0000-4000-8000-000000000002', 1, 1000, 1000);
insert into public.pagos_turno (id, turno_id, metodo, monto) values
  ('feeeeeee-0000-4000-8000-00000000b005', 'feeeeeee-0000-4000-8000-00000000b001', 'efectivo', 1000);
insert into public.gastos_turno (id, turno_id, concepto, monto) values
  ('feeeeeee-0000-4000-8000-00000000b006', 'feeeeeee-0000-4000-8000-00000000b001', 'RLS V2 gasto B', 500);
insert into public.stock_sucursal (id, insumo_id, sucursal_id, cantidad) values
  ('feeeeeee-0000-4000-8000-00000000b007', 'fcccccc0-0000-4000-8000-000000000003', 'faaaaaaa-0000-4000-8000-00000000000b', 10);
insert into public.asistencia (id, usuario_id, turno_id, sucursal_id) values
  ('feeeeeee-0000-4000-8000-00000000b008', 'fbbbbbbb-0000-4000-8000-00000000000b', 'feeeeeee-0000-4000-8000-00000000b001', 'faaaaaaa-0000-4000-8000-00000000000b');
insert into public.inventarios_parciales (id, turno_id, sucursal_id, usuario_id) values
  ('feeeeeee-0000-4000-8000-00000000b009', 'feeeeeee-0000-4000-8000-00000000b001', 'faaaaaaa-0000-4000-8000-00000000000b', 'fbbbbbbb-0000-4000-8000-00000000000b');
insert into public.inventarios_parciales_items (id, inventario_id, insumo_id, cantidad_real) values
  ('feeeeeee-0000-4000-8000-00000000b00a', 'feeeeeee-0000-4000-8000-00000000b009', 'fcccccc0-0000-4000-8000-000000000003', 5);
insert into public.pedidos_logistica (id, sucursal_id, estado) values
  ('feeeeeee-0000-4000-8000-00000000b00b', 'faaaaaaa-0000-4000-8000-00000000000b', 'borrador');
insert into public.pedidos_logistica_items (id, pedido_id, insumo_id, cantidad_solicitada) values
  ('feeeeeee-0000-4000-8000-00000000b00c', 'feeeeeee-0000-4000-8000-00000000b00b', 'fcccccc0-0000-4000-8000-000000000003', 5);
insert into public.configuracion_sucursal (id, sucursal_id) values
  ('feeeeeee-0000-4000-8000-00000000b00d', 'faaaaaaa-0000-4000-8000-00000000000b');

-- ---------------------------------------------------------------------------
-- Helpers (pg_temp so they never touch a real schema; dropped by ROLLBACK).
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
  insert into rls_v2_results (actor, resource, action, scope, actual, expected, result, detail)
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
  insert into rls_v2_results (actor, resource, action, scope, actual, expected, result, detail)
  values (p_actor, p_table, 'UPDATE', p_scope, v_actual, p_expected,
    case when v_actual = p_expected then 'PASS' else 'FAIL' end, 'no-op update set id=id');
end $$;

create function pg_temp.chk_delete(p_actor text, p_table text, p_scope text, p_id uuid, p_expected text)
returns void language plpgsql as $$
declare v_count bigint; v_actual text;
begin
  begin
    execute format('with x as (delete from public.%I where id = $1 returning 1) select count(*) from x', p_table)
      into v_count using p_id;
    v_actual := case when v_count = 1 then 'ALLOW' else 'DENY' end;
  exception when insufficient_privilege then
    v_actual := 'DENY';
  when foreign_key_violation then
    -- RLS matched and would have allowed the delete; a downstream FK stopped it
    -- for referential-integrity reasons, unrelated to authorization. Surfaced
    -- distinctly because it proves USING() returned true for this actor/row.
    v_actual := 'ALLOW (blocked by FK, not by RLS)';
  when others then
    v_actual := 'ERROR: ' || sqlerrm;
  end;
  insert into rls_v2_results (actor, resource, action, scope, actual, expected, result, detail)
  values (p_actor, p_table, 'DELETE', p_scope, v_actual, p_expected,
    case when v_actual = p_expected then 'PASS' else 'FAIL' end,
    case when v_actual like 'ALLOW%' then 'row matched inside rolled-back transaction' else 'blocked by RLS' end);
end $$;

create procedure pg_temp.record(p_actor text, p_table text, p_action text, p_scope text, p_actual text, p_expected text, p_detail text)
language sql as $$
  insert into rls_v2_results (actor, resource, action, scope, actual, expected, result, detail)
  values (p_actor, p_table, p_action, p_scope, p_actual, p_expected,
    case when p_actual = p_expected then 'PASS' else 'FAIL' end, p_detail);
$$;

-- Actor id constants for readability below.
-- admin_a=...0001 superadmin_a=...0002 encargado_a=...0003 tomador_a=...0004
-- preparador_a=...0005 despachador_a=...0006 jefe_bodega_a=...0007 logistica_a=...0008
-- contador_a=...0009 tomador_b=...000b despachador_b=...000c

-- Everything from here on runs AS the 'authenticated' Postgres role, not as the
-- superuser/owner connection used for fixture setup above. Table owners and
-- superusers bypass RLS entirely, so this switch is what makes every check below
-- actually exercise the v2 policies instead of silently seeing everything.
set local role authenticated;

-- ---------------------------------------------------------------------------
-- SECTION 1 — Core identity/branch tables: usuarios, sucursales, turnos.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000004'); -- tomador_a
select pg_temp.chk_select('tomador_a', 'usuarios', 'own_branch', 'fbbbbbbb-0000-4000-8000-000000000004', 'ALLOW'); -- self
select pg_temp.chk_select('tomador_a', 'usuarios', 'other_branch', 'fbbbbbbb-0000-4000-8000-00000000000b', 'DENY'); -- tomador_b
select pg_temp.chk_select('tomador_a', 'sucursales', 'other_branch', 'faaaaaaa-0000-4000-8000-00000000000b', 'DENY');
select pg_temp.chk_select('tomador_a', 'turnos', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b001', 'DENY');
select pg_temp.chk_update_noop('tomador_a', 'usuarios', 'other_branch', 'fbbbbbbb-0000-4000-8000-00000000000b', 'DENY');
select pg_temp.chk_update_noop('tomador_a', 'turnos', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b001', 'DENY');
select pg_temp.chk_delete('tomador_a', 'usuarios', 'other_branch', 'fbbbbbbb-0000-4000-8000-00000000000b', 'DENY');
-- tomador_pedidos has no 'users.manage'/'users.create' permission at all -> insert must be denied regardless of branch
do $$
begin
  begin
    insert into public.usuarios (id, nombre, rol, sucursal_id)
    values ('f0000000-0000-4000-8000-0000000000f1', 'Intento', 'tomador_pedidos', 'faaaaaaa-0000-4000-8000-00000000000a');
    call pg_temp.record('tomador_a', 'usuarios', 'INSERT', 'own_branch', 'ALLOW', 'DENY', 'tomador_pedidos lacks users.create; insert unexpectedly succeeded');
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'usuarios', 'INSERT', 'own_branch', 'DENY', 'DENY', 'blocked: tomador_pedidos has no users.create permission');
  end;
end $$;

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000003'); -- encargado_a
select pg_temp.chk_select('encargado_a', 'usuarios', 'own_branch', 'fbbbbbbb-0000-4000-8000-000000000004', 'ALLOW'); -- tomador_a, same branch
select pg_temp.chk_select('encargado_a', 'usuarios', 'other_branch', 'fbbbbbbb-0000-4000-8000-00000000000b', 'DENY'); -- tomador_b
select pg_temp.chk_update_noop('encargado_a', 'usuarios', 'other_branch', 'fbbbbbbb-0000-4000-8000-00000000000b', 'DENY');
-- encargado can create tomador_pedidos/preparador/despachador in own branch only.
do $$
begin
  begin
    insert into public.usuarios (id, nombre, rol, sucursal_id)
    values ('f0000000-0000-4000-8000-0000000000f2', 'Intento', 'despachador', 'faaaaaaa-0000-4000-8000-00000000000a');
    call pg_temp.record('encargado_a', 'usuarios', 'INSERT', 'own_branch_allowed_role', 'ALLOW', 'ALLOW', 'encargado created despachador in own branch');
  exception when insufficient_privilege then
    call pg_temp.record('encargado_a', 'usuarios', 'INSERT', 'own_branch_allowed_role', 'DENY', 'ALLOW', 'unexpectedly blocked');
  end;
end $$;
do $$
begin
  begin
    insert into public.usuarios (id, nombre, rol, sucursal_id)
    values ('f0000000-0000-4000-8000-0000000000f3', 'Intento', 'despachador', 'faaaaaaa-0000-4000-8000-00000000000b');
    call pg_temp.record('encargado_a', 'usuarios', 'INSERT', 'other_branch', 'ALLOW', 'DENY', 'encargado inserted a user into another branch');
  exception when insufficient_privilege then
    call pg_temp.record('encargado_a', 'usuarios', 'INSERT', 'other_branch', 'DENY', 'DENY', 'blocked: sucursal_id must equal own sucursal');
  end;
end $$;
do $$
begin
  begin
    insert into public.usuarios (id, nombre, rol, sucursal_id)
    values ('f0000000-0000-4000-8000-0000000000f4', 'Intento', 'admin', 'faaaaaaa-0000-4000-8000-00000000000a');
    call pg_temp.record('encargado_a', 'usuarios', 'INSERT', 'privilege_escalation_role', 'ALLOW', 'DENY', 'encargado created an admin user -- privilege escalation');
  exception when insufficient_privilege then
    call pg_temp.record('encargado_a', 'usuarios', 'INSERT', 'privilege_escalation_role', 'DENY', 'DENY', 'blocked: encargado insert is limited to operational roles');
  end;
end $$;

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000006'); -- despachador_a (near-zero perms)
select pg_temp.chk_select('despachador_a', 'sucursales', 'other_branch', 'faaaaaaa-0000-4000-8000-00000000000b', 'DENY');
select pg_temp.chk_select('despachador_a', 'turnos', 'own_branch', 'fddddddd-0000-4000-8000-00000000a001', 'DENY'); -- no shifts.* permission at all
select pg_temp.chk_select('despachador_a', 'usuarios', 'own_branch_other_user', 'fbbbbbbb-0000-4000-8000-000000000004', 'DENY'); -- no users.read

-- ---------------------------------------------------------------------------
-- SECTION 2 — IDOR regression: turno_despachadores and pedido_items.
-- v1 bug: SELECT policies only checked "parent row exists", not branch scope.
-- v2 must use private.turno_in_scope() / private.pedido_in_scope() correctly.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000004'); -- tomador_a
select pg_temp.chk_select('tomador_a', 'turno_despachadores', 'own_branch', 'fddddddd-0000-4000-8000-00000000a003', 'ALLOW');
select pg_temp.chk_select('tomador_a', 'turno_despachadores', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b002', 'DENY');
select pg_temp.chk_select('tomador_a', 'pedido_items', 'own_branch', 'fddddddd-0000-4000-8000-00000000a005', 'ALLOW');
select pg_temp.chk_select('tomador_a', 'pedido_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b004', 'DENY');
select pg_temp.chk_update_noop('tomador_a', 'turno_despachadores', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b002', 'DENY');
select pg_temp.chk_update_noop('tomador_a', 'pedido_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b004', 'DENY');
select pg_temp.chk_delete('tomador_a', 'turno_despachadores', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b002', 'DENY');
select pg_temp.chk_delete('tomador_a', 'pedido_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b004', 'DENY');
do $$
begin
  begin
    insert into public.turno_despachadores (id, turno_id, despachador_id)
    values ('f0000000-0000-4000-8000-0000000000f5', 'feeeeeee-0000-4000-8000-00000000b001', 'fbbbbbbb-0000-4000-8000-00000000000c');
    call pg_temp.record('tomador_a', 'turno_despachadores', 'INSERT', 'other_branch', 'ALLOW', 'DENY', 'inserted a dispatcher assignment into Branch B turno');
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'turno_despachadores', 'INSERT', 'other_branch', 'DENY', 'DENY', 'blocked by turno_in_scope');
  end;
end $$;
do $$
begin
  begin
    insert into public.pedido_items (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal)
    values ('f0000000-0000-4000-8000-0000000000f6', 'feeeeeee-0000-4000-8000-00000000b003', 'fcccccc0-0000-4000-8000-000000000002', 1, 1000, 1000);
    call pg_temp.record('tomador_a', 'pedido_items', 'INSERT', 'other_branch', 'ALLOW', 'DENY', 'inserted an item into Branch B pedido');
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'pedido_items', 'INSERT', 'other_branch', 'DENY', 'DENY', 'blocked by pedido_in_scope');
  end;
end $$;

-- Cross-check with a global-scope actor: admin must see/modify Branch B rows too.
select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000001'); -- admin_a
select pg_temp.chk_select('admin_a', 'turno_despachadores', 'global', 'feeeeeee-0000-4000-8000-00000000b002', 'ALLOW');
select pg_temp.chk_select('admin_a', 'pedido_items', 'global', 'feeeeeee-0000-4000-8000-00000000b004', 'ALLOW');
select pg_temp.chk_update_noop('admin_a', 'turno_despachadores', 'global', 'feeeeeee-0000-4000-8000-00000000b002', 'ALLOW');
select pg_temp.chk_update_noop('admin_a', 'pedido_items', 'global', 'feeeeeee-0000-4000-8000-00000000b004', 'ALLOW');

-- ---------------------------------------------------------------------------
-- SECTION 3 — Extension tables (per task spec): stock_sucursal, pagos_turno,
-- gastos_turno, asistencia, inventarios_parciales, pedidos_logistica,
-- configuracion_sucursal. encargado_a holds every relevant permission, so a
-- DENY here can only be explained by branch scoping, not missing permission.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000003'); -- encargado_a
select pg_temp.chk_select('encargado_a', 'stock_sucursal', 'own_branch', 'fddddddd-0000-4000-8000-00000000a008', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'stock_sucursal', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b007', 'DENY');
select pg_temp.chk_select('encargado_a', 'pagos_turno', 'own_branch', 'fddddddd-0000-4000-8000-00000000a006', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'pagos_turno', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b005', 'DENY');
select pg_temp.chk_select('encargado_a', 'gastos_turno', 'own_branch', 'fddddddd-0000-4000-8000-00000000a007', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'gastos_turno', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b006', 'DENY');
select pg_temp.chk_select('encargado_a', 'asistencia', 'own_branch', 'fddddddd-0000-4000-8000-00000000a009', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'asistencia', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b008', 'DENY');
select pg_temp.chk_select('encargado_a', 'inventarios_parciales', 'own_branch', 'fddddddd-0000-4000-8000-00000000a00a', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'inventarios_parciales', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b009', 'DENY');
select pg_temp.chk_select('encargado_a', 'pedidos_logistica', 'own_branch', 'fddddddd-0000-4000-8000-00000000a00c', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'pedidos_logistica', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00b', 'DENY');
select pg_temp.chk_select('encargado_a', 'configuracion_sucursal', 'own_branch', 'fddddddd-0000-4000-8000-00000000a00e', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'configuracion_sucursal', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00d', 'DENY');

select pg_temp.chk_update_noop('encargado_a', 'stock_sucursal', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b007', 'DENY');
select pg_temp.chk_update_noop('encargado_a', 'pagos_turno', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b005', 'DENY');
select pg_temp.chk_update_noop('encargado_a', 'gastos_turno', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b006', 'DENY');
select pg_temp.chk_update_noop('encargado_a', 'asistencia', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b008', 'DENY');
select pg_temp.chk_update_noop('encargado_a', 'inventarios_parciales', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b009', 'DENY');
select pg_temp.chk_update_noop('encargado_a', 'pedidos_logistica', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00b', 'DENY');
-- configuracion_sucursal: encargado has NO global_config.manage, so even the OWN branch row
-- is read-only for this role (only SELECT has the own-sucursal fallback).
select pg_temp.chk_update_noop('encargado_a', 'configuracion_sucursal', 'own_branch_insufficient_permission', 'fddddddd-0000-4000-8000-00000000a00e', 'DENY');

-- Positive same-branch write for a representative subset.
select pg_temp.chk_update_noop('encargado_a', 'stock_sucursal', 'own_branch', 'fddddddd-0000-4000-8000-00000000a008', 'ALLOW');
select pg_temp.chk_update_noop('encargado_a', 'gastos_turno', 'own_branch', 'fddddddd-0000-4000-8000-00000000a007', 'ALLOW');

-- Global-scope cross-check: admin must reach Branch B on every extension table.
select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000001'); -- admin_a
select pg_temp.chk_select('admin_a', 'stock_sucursal', 'global', 'feeeeeee-0000-4000-8000-00000000b007', 'ALLOW');
select pg_temp.chk_select('admin_a', 'pagos_turno', 'global', 'feeeeeee-0000-4000-8000-00000000b005', 'ALLOW');
select pg_temp.chk_select('admin_a', 'gastos_turno', 'global', 'feeeeeee-0000-4000-8000-00000000b006', 'ALLOW');
select pg_temp.chk_select('admin_a', 'asistencia', 'global', 'feeeeeee-0000-4000-8000-00000000b008', 'ALLOW');
select pg_temp.chk_select('admin_a', 'inventarios_parciales', 'global', 'feeeeeee-0000-4000-8000-00000000b009', 'ALLOW');
select pg_temp.chk_select('admin_a', 'pedidos_logistica', 'global', 'feeeeeee-0000-4000-8000-00000000b00b', 'ALLOW');
select pg_temp.chk_update_noop('admin_a', 'configuracion_sucursal', 'global_config_manage', 'feeeeeee-0000-4000-8000-00000000b00d', 'ALLOW');

-- ---------------------------------------------------------------------------
-- SECTION 4 — Child tables with NO explicit permission()/can_access_sucursal()
-- call in their own policy text: inventarios_parciales_items, pedidos_logistica_items.
-- These only check "exists(parent)". Because that exists() subquery runs under the
-- caller's own role, it is itself filtered by the parent table's RLS -- so it MAY be
-- transitively safe. This section empirically settles that, on two axes:
--   (a) branch scoping, using tomador_a/tomador_b (who DO hold the relevant permission)
--   (b) permission scoping, using despachador_a (who holds NEITHER inventory.* NOR
--       logistics_orders.* permission) against a SAME-branch parent.
-- A FAIL here is a live authorization bypass, not a style nit: it means either branch
-- or role membership stopped mattering for these two tables.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000004'); -- tomador_a (has inventory.read/manage)
select pg_temp.chk_select('tomador_a', 'inventarios_parciales_items', 'own_branch', 'fddddddd-0000-4000-8000-00000000a00b', 'ALLOW');
select pg_temp.chk_select('tomador_a', 'inventarios_parciales_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00a', 'DENY');
select pg_temp.chk_update_noop('tomador_a', 'inventarios_parciales_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00a', 'DENY');
select pg_temp.chk_delete('tomador_a', 'inventarios_parciales_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00a', 'DENY');

-- tomador_pedidos has no logistics_orders.* permission at all -> use encargado_a (has it) instead.
select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000003'); -- encargado_a
select pg_temp.chk_select('encargado_a', 'pedidos_logistica_items', 'own_branch', 'fddddddd-0000-4000-8000-00000000a00d', 'ALLOW');
select pg_temp.chk_select('encargado_a', 'pedidos_logistica_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00c', 'DENY');
select pg_temp.chk_update_noop('encargado_a', 'pedidos_logistica_items', 'other_branch', 'feeeeeee-0000-4000-8000-00000000b00c', 'DENY');

-- despachador_a: catalog.read + orders.read ONLY. No inventory.*, no logistics_orders.*.
-- Parent rows exist and are in despachador_a's OWN branch. If the child policy were a
-- real bypass, this must ALLOW despite despachador_a having zero relevant permission.
select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000006'); -- despachador_a
select pg_temp.chk_select('despachador_a', 'inventarios_parciales_items', 'own_branch_no_permission', 'fddddddd-0000-4000-8000-00000000a00b', 'DENY');
select pg_temp.chk_select('despachador_a', 'pedidos_logistica_items', 'own_branch_no_permission', 'fddddddd-0000-4000-8000-00000000a00d', 'DENY');
do $$
begin
  begin
    insert into public.inventarios_parciales_items (id, inventario_id, insumo_id, cantidad_real)
    values ('f0000000-0000-4000-8000-0000000000f7', 'fddddddd-0000-4000-8000-00000000a00a', 'fcccccc0-0000-4000-8000-000000000003', 99);
    call pg_temp.record('despachador_a', 'inventarios_parciales_items', 'INSERT', 'own_branch_no_permission', 'ALLOW', 'DENY', 'despachador (no inventory permission) inserted an inventory count item');
  exception when insufficient_privilege then
    call pg_temp.record('despachador_a', 'inventarios_parciales_items', 'INSERT', 'own_branch_no_permission', 'DENY', 'DENY', 'blocked despite missing explicit permission() call in the policy');
  end;
end $$;
do $$
begin
  begin
    insert into public.pedidos_logistica_items (id, pedido_id, insumo_id, cantidad_solicitada)
    values ('f0000000-0000-4000-8000-0000000000f8', 'fddddddd-0000-4000-8000-00000000a00c', 'fcccccc0-0000-4000-8000-000000000003', 99);
    call pg_temp.record('despachador_a', 'pedidos_logistica_items', 'INSERT', 'own_branch_no_permission', 'ALLOW', 'DENY', 'despachador (no logistics permission) inserted a logistics order item');
  exception when insufficient_privilege then
    call pg_temp.record('despachador_a', 'pedidos_logistica_items', 'INSERT', 'own_branch_no_permission', 'DENY', 'DENY', 'blocked despite missing explicit permission() call in the policy');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- SECTION 5 — Admin vs superadmin. Business rule under test: superadmin must
-- NOT have clients.read/clients.manage (v2 migration's own invariant check).
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000001'); -- admin_a
select pg_temp.chk_select('admin_a', 'clientes', 'admin_only', 'fcccccc1-0000-4000-8000-000000000001', 'ALLOW');
select pg_temp.chk_select('admin_a', 'direcciones_cliente', 'admin_only', 'fcccccc1-0000-4000-8000-000000000002', 'ALLOW');

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000002'); -- superadmin_a
select pg_temp.chk_select('superadmin_a', 'clientes', 'admin_only_excluded_role', 'fcccccc1-0000-4000-8000-000000000001', 'DENY');
select pg_temp.chk_select('superadmin_a', 'direcciones_cliente', 'admin_only_excluded_role', 'fcccccc1-0000-4000-8000-000000000002', 'DENY');
-- Sanity: superadmin IS still global-scope for ordinary branch data.
select pg_temp.chk_select('superadmin_a', 'turnos', 'global', 'feeeeeee-0000-4000-8000-00000000b001', 'ALLOW');
select pg_temp.chk_select('superadmin_a', 'usuarios', 'global', 'fbbbbbbb-0000-4000-8000-00000000000b', 'ALLOW');

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000003'); -- encargado_a
select pg_temp.chk_select('encargado_a', 'clientes', 'admin_only_excluded_role', 'fcccccc1-0000-4000-8000-000000000001', 'DENY');

-- ---------------------------------------------------------------------------
-- SECTION 6 — Global-scope roles reaching across branches on core tables
-- (jefe_bodega, logistica, contador_rrhh). Confirms has_global_scope() is
-- honored uniformly, not just for admin/superadmin.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000007'); -- jefe_bodega_a
select pg_temp.chk_select('jefe_bodega_a', 'stock_sucursal', 'global', 'feeeeeee-0000-4000-8000-00000000b007', 'ALLOW');
select pg_temp.chk_select('jefe_bodega_a', 'usuarios', 'no_users_permission', 'fbbbbbbb-0000-4000-8000-00000000000b', 'DENY'); -- jefe_bodega has no users.read

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000008'); -- logistica_a
select pg_temp.chk_select('logistica_a', 'pedidos_logistica', 'global', 'feeeeeee-0000-4000-8000-00000000b00b', 'ALLOW');

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000009'); -- contador_a
select pg_temp.chk_select('contador_a', 'gastos_turno', 'global', 'feeeeeee-0000-4000-8000-00000000b006', 'ALLOW');
select pg_temp.chk_select('contador_a', 'stock_sucursal', 'no_stock_permission', 'feeeeeee-0000-4000-8000-00000000b007', 'DENY'); -- contador has no branch_stock.*/inventory.*

-- ---------------------------------------------------------------------------
-- SECTION 7 — Catalog: every role in role_permissions has catalog.read;
-- only catalog.manage roles (admin/superadmin) can write.
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in select unnest(array[
    'fbbbbbbb-0000-4000-8000-000000000001','fbbbbbbb-0000-4000-8000-000000000002',
    'fbbbbbbb-0000-4000-8000-000000000003','fbbbbbbb-0000-4000-8000-000000000004',
    'fbbbbbbb-0000-4000-8000-000000000005','fbbbbbbb-0000-4000-8000-000000000006',
    'fbbbbbbb-0000-4000-8000-000000000007','fbbbbbbb-0000-4000-8000-000000000008',
    'fbbbbbbb-0000-4000-8000-000000000009'
  ]::uuid[]) as uid,
  unnest(array['admin_a','superadmin_a','encargado_a','tomador_a','preparador_a',
               'despachador_a','jefe_bodega_a','logistica_a','contador_a']) as label
  loop
    perform pg_temp.as_actor(r.uid);
    perform pg_temp.chk_select(r.label, 'productos', 'global_catalog', 'fcccccc0-0000-4000-8000-000000000002', 'ALLOW');
  end loop;
end $$;

select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000003'); -- encargado_a: catalog.read but no catalog.manage
select pg_temp.chk_update_noop('encargado_a', 'productos', 'no_catalog_manage', 'fcccccc0-0000-4000-8000-000000000002', 'DENY');
select pg_temp.as_actor('fbbbbbbb-0000-4000-8000-000000000001'); -- admin_a
select pg_temp.chk_update_noop('admin_a', 'productos', 'catalog_manage', 'fcccccc0-0000-4000-8000-000000000002', 'ALLOW');

-- ---------------------------------------------------------------------------
-- Report and rollback. Nothing above this line is ever persisted.
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'total', (select count(*) from rls_v2_results),
  'pass', (select count(*) from rls_v2_results where result = 'PASS'),
  'fail', (select count(*) from rls_v2_results where result = 'FAIL'),
  'failures', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_results r where result = 'FAIL'),
  'all_results', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_results r)
) as report;

rollback;
