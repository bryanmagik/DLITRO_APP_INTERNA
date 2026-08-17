-- Anonymous-access tests for authorization_rls_matrix_v2.
--
-- v2 revokes ALL table privileges on every public-schema table from `anon`
-- (see line "revoke all on all tables in schema public from anon;" in
-- 20260816014215_authorization_rls_matrix_v2.sql). The one documented,
-- intentional exception is public read of the `productos` storage bucket
-- (product images), granted to both anon and authenticated.
--
-- Self-contained, fully transactional: BEGIN ... ROLLBACK. Safe to re-run on STAGING.

begin;

create temp table rls_v2_anon_results (
  seq bigserial,
  resource text not null,
  action text not null,
  actual text not null,
  expected text not null,
  result text not null,
  detail text not null
) on commit drop;
grant all on rls_v2_anon_results to anon;
grant usage on rls_v2_anon_results_seq_seq to anon;

insert into public.sucursales (id, nombre, direccion, activo) values
  ('caaaaaaa-0000-4000-8000-00000000000a', 'Anon V2 Sucursal', 'Direccion sintetica', true);
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000', 'cbbbbbbb-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'anon-v2-victim@test.local', crypt(gen_random_uuid()::text, gen_salt('bf')),
  now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
);
insert into public.usuarios (id, nombre, rol, sucursal_id, activo) values
  ('cbbbbbbb-0000-4000-8000-000000000001', 'Anon Victim', 'tomador_pedidos', 'caaaaaaa-0000-4000-8000-00000000000a', true);
insert into public.categorias (id, nombre) values ('cccccccc-0000-4000-8000-000000000001', 'Anon V2 Cat');
insert into public.productos (id, nombre, precio, categoria_id) values
  ('cccccccc-0000-4000-8000-000000000002', 'Anon V2 Prod', 1000, 'cccccccc-0000-4000-8000-000000000001');
insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('cddddddd-0000-4000-8000-000000000001', 'caaaaaaa-0000-4000-8000-00000000000a', 'cbbbbbbb-0000-4000-8000-000000000001', 'abierto', 0);
insert into public.stock_sucursal (id, insumo_id, sucursal_id, cantidad)
select 'cddddddd-0000-4000-8000-000000000002', id, 'caaaaaaa-0000-4000-8000-00000000000a', 10
from public.insumos limit 1;

create procedure pg_temp.record(p_table text, p_action text, p_actual text, p_expected text, p_detail text)
language sql as $$
  insert into rls_v2_anon_results (resource, action, actual, expected, result, detail)
  values (p_table, p_action, p_actual, p_expected,
    case when p_actual = p_expected then 'PASS' else 'FAIL' end, p_detail);
$$;

-- No JWT claims are set for these checks: this is a true anonymous session,
-- not an authenticated one with a low-privilege role.
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

do $$
declare v_count bigint;
begin
  begin
    select count(*) into v_count from public.usuarios where id = 'cbbbbbbb-0000-4000-8000-000000000001';
    call pg_temp.record('usuarios', 'SELECT', 'ALLOW', 'DENY', format('anon read %s row(s) from usuarios', v_count));
  exception when insufficient_privilege then
    call pg_temp.record('usuarios', 'SELECT', 'DENY', 'DENY', 'blocked: no table grant on public.usuarios for anon');
  end;
end $$;

do $$
declare v_count bigint;
begin
  begin
    select count(*) into v_count from public.turnos where id = 'cddddddd-0000-4000-8000-000000000001';
    call pg_temp.record('turnos', 'SELECT', 'ALLOW', 'DENY', format('anon read %s row(s) from turnos', v_count));
  exception when insufficient_privilege then
    call pg_temp.record('turnos', 'SELECT', 'DENY', 'DENY', 'blocked: no table grant on public.turnos for anon');
  end;
end $$;

do $$
declare v_count bigint;
begin
  begin
    select count(*) into v_count from public.stock_sucursal where id = 'cddddddd-0000-4000-8000-000000000002';
    call pg_temp.record('stock_sucursal', 'SELECT', 'ALLOW', 'DENY', format('anon read %s row(s) from stock_sucursal', v_count));
  exception when insufficient_privilege then
    call pg_temp.record('stock_sucursal', 'SELECT', 'DENY', 'DENY', 'blocked: no table grant on public.stock_sucursal for anon');
  end;
end $$;

-- Business catalog is closed to anon too (no anonymous storefront wired up yet at
-- the table level). Flagged here as an observation, not assumed to be a bug: if a
-- customer-facing catalog browse feature ships, it will need an explicit decision
-- (a scoped anon SELECT policy, or routing reads through an authenticated/service path).
do $$
declare v_count bigint;
begin
  begin
    select count(*) into v_count from public.productos where id = 'cccccccc-0000-4000-8000-000000000002';
    call pg_temp.record('productos', 'SELECT', 'ALLOW', 'DENY', format('anon read %s row(s) from productos', v_count));
  exception when insufficient_privilege then
    call pg_temp.record('productos', 'SELECT', 'DENY', 'DENY', 'blocked: no table grant on public.productos for anon (no public catalog browse today)');
  end;
end $$;

do $$
declare v_count bigint;
begin
  begin
    select count(*) into v_count from private.role_permissions;
    call pg_temp.record('private.role_permissions', 'SELECT', 'ALLOW', 'DENY', format('anon read %s row(s)', v_count));
  exception when insufficient_privilege then
    call pg_temp.record('private.role_permissions', 'SELECT', 'DENY', 'DENY', 'blocked: schema private has no usage grant for anon');
  end;
end $$;

do $$
begin
  begin
    perform private.has_permission('catalog.read');
    call pg_temp.record('private.has_permission', 'EXECUTE', 'ALLOW', 'DENY', 'anon could execute an authorization helper function directly');
  exception when insufficient_privilege then
    call pg_temp.record('private.has_permission', 'EXECUTE', 'DENY', 'DENY', 'blocked: no EXECUTE grant for anon');
  end;
end $$;

-- Documented intentional exception: public read of product images.
do $$
declare v_has_select boolean;
begin
  select has_table_privilege('anon', 'storage.objects', 'SELECT') into v_has_select;
  call pg_temp.record('storage.objects', 'SELECT (table grant)', case when v_has_select then 'ALLOW' else 'DENY' end, 'ALLOW',
    'documented exception: product_images_public_read_v2 grants anon read of the productos bucket');
end $$;

do $$
declare v_count bigint;
begin
  begin
    select count(*) into v_count from storage.objects where bucket_id = 'productos';
    call pg_temp.record('storage.objects', 'SELECT bucket=productos', 'ALLOW', 'ALLOW', format('anon can query the productos bucket (rows visible=%s)', v_count));
  exception when insufficient_privilege then
    call pg_temp.record('storage.objects', 'SELECT bucket=productos', 'DENY', 'ALLOW', 'unexpectedly blocked -- product_images_public_read_v2 should allow this');
  end;
end $$;

do $$
begin
  begin
    insert into storage.objects (bucket_id, name) values ('productos', 'anon-v2-probe.png');
    call pg_temp.record('storage.objects', 'INSERT bucket=productos', 'ALLOW', 'DENY', 'anon uploaded into the productos bucket -- write access must require product_images.manage and authenticated role');
  exception when insufficient_privilege then
    call pg_temp.record('storage.objects', 'INSERT bucket=productos', 'DENY', 'DENY', 'blocked: insert/update/delete policies are scoped "to authenticated" only');
  end;
end $$;

reset role;

select jsonb_build_object(
  'total', (select count(*) from rls_v2_anon_results),
  'pass', (select count(*) from rls_v2_anon_results where result = 'PASS'),
  'fail', (select count(*) from rls_v2_anon_results where result = 'FAIL'),
  'failures', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_anon_results r where result = 'FAIL'),
  'all_results', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_anon_results r)
) as report;

rollback;
