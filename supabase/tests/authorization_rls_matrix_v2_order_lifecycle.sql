-- Order-modification lifecycle rule coverage: migration
-- 20260817164101_order_modification_lifecycle_rule.sql.
--
-- Covers: private.guard_pedido_update_v2() terminal-lock extension (entregado/
-- cancelado, admin-exempt) and the new private.guard_pedido_items_lifecycle_v2()
-- trigger on pedido_items (en_despacho/entregado/cancelado lock, admin-exempt,
-- and the listo -> en_preparacion auto-revert + requiere_revision_cocina flag +
-- log_cambios_pedido audit row).
--
-- Uses GET DIAGNOSTICS ROW_COUNT (not exception-catching alone) wherever a
-- denial could plausibly come from a silent RLS filter rather than a raised
-- exception -- see authorization_rls_matrix_v2_guards.sql's ISOLATION NOTE for
-- why exception-only detection produced a false positive there.
--
-- Self-contained, fully transactional: BEGIN ... ROLLBACK. Safe to re-run on STAGING.

begin;

create temp table rls_v2_lifecycle_results (
  seq bigserial,
  actor text not null,
  case_name text not null,
  actual text not null,
  expected text not null,
  result text not null,
  detail text not null
) on commit drop;
grant all on rls_v2_lifecycle_results to authenticated;
grant usage on rls_v2_lifecycle_results_seq_seq to authenticated;

insert into public.sucursales (id, nombre, direccion, activo) values
  ('9aaaaaaa-0000-4000-8000-00000000000a', 'Lifecycle Sucursal A', 'x', true),
  ('9aaaaaaa-0000-4000-8000-00000000000b', 'Lifecycle Sucursal B', 'x', true);

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
  ('9bbbbbbb-0000-4000-8000-000000000001'::uuid, 'lifecycle-admin@test.local'),
  ('9bbbbbbb-0000-4000-8000-000000000002'::uuid, 'lifecycle-encargado@test.local'),
  ('9bbbbbbb-0000-4000-8000-000000000003'::uuid, 'lifecycle-tomador-a@test.local'),
  ('9bbbbbbb-0000-4000-8000-000000000004'::uuid, 'lifecycle-preparador-a@test.local'),
  ('9bbbbbbb-0000-4000-8000-000000000005'::uuid, 'lifecycle-tomador-b@test.local')
) as x(id, email);

insert into public.usuarios (id, nombre, rol, sucursal_id, activo) values
  ('9bbbbbbb-0000-4000-8000-000000000001', 'Lifecycle Admin',       'admin',           '9aaaaaaa-0000-4000-8000-00000000000a', true),
  ('9bbbbbbb-0000-4000-8000-000000000002', 'Lifecycle Encargado',   'encargado',       '9aaaaaaa-0000-4000-8000-00000000000a', true),
  ('9bbbbbbb-0000-4000-8000-000000000003', 'Lifecycle Tomador A',   'tomador_pedidos', '9aaaaaaa-0000-4000-8000-00000000000a', true),
  ('9bbbbbbb-0000-4000-8000-000000000004', 'Lifecycle Preparador A','preparador',      '9aaaaaaa-0000-4000-8000-00000000000a', true),
  ('9bbbbbbb-0000-4000-8000-000000000005', 'Lifecycle Tomador B',   'tomador_pedidos', '9aaaaaaa-0000-4000-8000-00000000000b', true);

insert into public.categorias (id, nombre) values ('9ccccccc-0000-4000-8000-000000000001', 'Lifecycle Cat');
insert into public.productos (id, nombre, precio, categoria_id) values
  ('9ccccccc-0000-4000-8000-000000000002', 'Lifecycle Prod', 1000, '9ccccccc-0000-4000-8000-000000000001');

insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'abierto', 0),
  ('9ddddddd-0000-4000-8000-00000000b001', '9aaaaaaa-0000-4000-8000-00000000000b', '9bbbbbbb-0000-4000-8000-000000000005', 'abierto', 0);

-- One independent pedido + item per case (lesson learned from the guards.sql
-- shared-fixture incident: never let one case's mutation change the starting
-- state another case depends on).
insert into public.pedidos (id, turno_id, sucursal_id, tomador_id, cliente_nombre, tipo, estado, subtotal, descuento, costo_despacho, total) values
  ('91111111-0000-4000-8000-000000000001', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case tomado',               'retiro', 'tomado',        1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000002', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case en_preparacion',       'retiro', 'en_preparacion',1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000003', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case listo revert',        'retiro', 'listo',         1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000004', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case despacho items deny', 'retiro', 'en_despacho',   1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000005', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case despacho pedido ok',  'retiro', 'en_despacho',   1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000006', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case entregado pedido deny','retiro','en_preparacion',1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000007', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case entregado items deny', 'retiro', 'en_preparacion',1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000008', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case entregado admin pedido','retiro','entregado',    1000, 0, 0, 1000),
  ('91111111-0000-4000-8000-000000000009', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case entregado admin items', 'retiro', 'en_preparacion',1000, 0, 0, 1000),
  ('9111111a-0000-4000-8000-00000000000a', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case cancelado deny',      'retiro', 'cancelado',     1000, 0, 0, 1000),
  ('9111111a-0000-4000-8000-00000000000b', '9ddddddd-0000-4000-8000-00000000a001', '9aaaaaaa-0000-4000-8000-00000000000a', '9bbbbbbb-0000-4000-8000-000000000003', 'Case financial deny',      'retiro', 'en_preparacion',1000, 0, 0, 1000),
  ('9111111a-0000-4000-8000-00000000000c', '9ddddddd-0000-4000-8000-00000000b001', '9aaaaaaa-0000-4000-8000-00000000000b', '9bbbbbbb-0000-4000-8000-000000000005', 'Case cross-branch deny',   'retiro', 'en_preparacion',1000, 0, 0, 1000);

insert into public.pedido_items (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal) values
  ('92222222-0000-4000-8000-000000000001', '91111111-0000-4000-8000-000000000001', '9ccccccc-0000-4000-8000-000000000002', 1, 1000, 1000),
  ('92222222-0000-4000-8000-000000000002', '91111111-0000-4000-8000-000000000002', '9ccccccc-0000-4000-8000-000000000002', 1, 1000, 1000),
  ('92222222-0000-4000-8000-000000000003', '91111111-0000-4000-8000-000000000003', '9ccccccc-0000-4000-8000-000000000002', 1, 1000, 1000),
  ('92222222-0000-4000-8000-000000000004', '91111111-0000-4000-8000-000000000004', '9ccccccc-0000-4000-8000-000000000002', 1, 1000, 1000),
  ('92222222-0000-4000-8000-000000000007', '91111111-0000-4000-8000-000000000007', '9ccccccc-0000-4000-8000-000000000002', 1, 1000, 1000),
  ('92222222-0000-4000-8000-000000000009', '91111111-0000-4000-8000-000000000009', '9ccccccc-0000-4000-8000-000000000002', 1, 1000, 1000),
  ('9222222a-0000-4000-8000-00000000000c', '9111111a-0000-4000-8000-00000000000c', '9ccccccc-0000-4000-8000-000000000002', 1, 1000, 1000);

update public.pedidos set metodo_pago = 'transferencia'
where id = '91111111-0000-4000-8000-000000000006';

insert into public.pagos_turno (id, turno_id, pedido_id, metodo, monto)
values ('93333333-0000-4000-8000-000000000006', '9ddddddd-0000-4000-8000-00000000a001',
        '91111111-0000-4000-8000-000000000006', 'transferencia', 1000);

update public.pedidos set estado = 'entregado'
where id in ('91111111-0000-4000-8000-000000000006', '91111111-0000-4000-8000-000000000007', '91111111-0000-4000-8000-000000000009');

create function pg_temp.as_actor(p_user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
$$;

create procedure pg_temp.record(p_actor text, p_case text, p_actual text, p_expected text, p_detail text)
language sql as $$
  insert into rls_v2_lifecycle_results (actor, case_name, actual, expected, result, detail)
  values (p_actor, p_case, p_actual, p_expected,
    case when p_actual = p_expected then 'PASS' else 'FAIL' end, p_detail);
$$;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- tomado / en_preparacion: operational modification permitted.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000003'); -- tomador_a

do $$
declare v_count int;
begin
  begin
    update public.pedido_items set cantidad = 2 where id = '92222222-0000-4000-8000-000000000001';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'tomado: modificacion de item', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
      case when v_count = 1 then 'item actualizado, pedido tomado editable' else 'bloqueado inesperadamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomado_a', 'tomado: modificacion de item', 'DENY', 'ALLOW', 'bloqueado por excepcion inesperadamente');
  end;
end $$;

-- Explicit correction RPC: reason required, state remains delivered, payment
-- ledger is synchronized, and each changed field gets an append-only event.
do $$
begin
  begin
    perform public.corregir_pedido_entregado(
      '91111111-0000-4000-8000-000000000006', 'efectivo', 'nota corregida', '');
    call pg_temp.record('tomador_a', 'entregado: correccion exige motivo', 'ALLOW', 'DENY', 'acepto motivo vacio -- BUG');
  exception when invalid_parameter_value then
    call pg_temp.record('tomador_a', 'entregado: correccion exige motivo', 'DENY', 'DENY', 'motivo vacio rechazado');
  end;
end $$;

select public.corregir_pedido_entregado(
  '91111111-0000-4000-8000-000000000006', 'efectivo', 'nota corregida', 'Forma de pago incorrecta');

reset role;
do $$
declare v_pedido public.pedidos; v_pago public.metodo_pago; v_logs int; v_user_logs int; v_branch_logs int;
begin
  select * into v_pedido from public.pedidos where id = '91111111-0000-4000-8000-000000000006';
  select metodo into v_pago from public.pagos_turno where pedido_id = v_pedido.id;
  select count(*) into v_logs from public.log_cambios_pedido
   where pedido_id = v_pedido.id and tipo_evento = 'pedido_corregido_post_cierre';
  select count(*) into v_user_logs from public.log_cambios_pedido
   where pedido_id = v_pedido.id and usuario_id = '9bbbbbbb-0000-4000-8000-000000000003';
  select count(*) into v_branch_logs from public.log_cambios_pedido
   where pedido_id = v_pedido.id and sucursal_id = '9aaaaaaa-0000-4000-8000-00000000000a';
  call pg_temp.record('tomador_a', 'entregado: mantiene estado', v_pedido.estado::text, 'entregado', 'no reabre flujo operacional');
  call pg_temp.record('tomador_a', 'entregado: corrige forma de pago', v_pedido.metodo_pago::text, 'efectivo', 'pedidos sincronizado');
  call pg_temp.record('tomador_a', 'entregado: sincroniza pagos sin cambiar monto', v_pago::text, 'efectivo', 'pagos_turno sincronizado');
  call pg_temp.record('tomador_a', 'entregado: un evento por campo', v_logs::text, '2', 'metodo_pago y notas auditados por separado');
  call pg_temp.record('tomador_a', 'auditoria: identifica usuario', v_user_logs::text, '3', 'metodo, notas y composicion identifican auth.uid');
  call pg_temp.record('tomador_a', 'auditoria: identifica sucursal', v_branch_logs::text, '3', 'metodo, notas y composicion identifican sucursal');
end $$;
set local role authenticated;
select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000003');

select public.corregir_pedido_entregado(
  '91111111-0000-4000-8000-000000000006', 'transferencia', 'nota corregida', 'Reversion de prueba');

reset role;
do $$
declare v_count int;
begin
  select count(*) into v_count from public.log_cambios_pedido
   where pedido_id = '91111111-0000-4000-8000-000000000006'
     and campo = 'metodo_pago' and tipo_evento = 'pedido_corregido_post_cierre';
  call pg_temp.record('tomador_a', 'auditoria: dos correcciones son eventos independientes', v_count::text, '2', 'historial append-only');
end $$;
set local role authenticated;

select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000005');
do $$
begin
  begin
    perform public.corregir_pedido_entregado(
      '91111111-0000-4000-8000-000000000006', 'efectivo', 'ataque cross branch', 'prueba');
    call pg_temp.record('tomador_b', 'entregado: otra sucursal no puede corregir', 'ALLOW', 'DENY', 'IDOR -- BUG');
  exception when insufficient_privilege then
    call pg_temp.record('tomador_b', 'entregado: otra sucursal no puede corregir', 'DENY', 'DENY', 'RLS/alcance de sucursal');
  end;
end $$;

select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000003');
do $$
begin
  begin
    update public.pedidos set total = 9999 where id = '91111111-0000-4000-8000-000000000006';
    call pg_temp.record('tomador_a', 'entregado: no modifica total', 'ALLOW', 'DENY', 'total modificado -- BUG');
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'entregado: no modifica total', 'DENY', 'DENY', 'guard de lista blanca');
  end;
end $$;

do $$
declare v_count int;
begin
  begin
    update public.pedido_items set cantidad = 2 where id = '92222222-0000-4000-8000-000000000002';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'en_preparacion: modificacion de item', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
      case when v_count = 1 then 'item actualizado, pedido en_preparacion editable' else 'bloqueado inesperadamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'en_preparacion: modificacion de item', 'DENY', 'ALLOW', 'bloqueado por excepcion inesperadamente');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- listo + modificacion operacional -> ALLOW + auto-revert a en_preparacion +
-- flag requiere_revision_cocina + fila de auditoria en log_cambios_pedido.
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  update public.pedido_items set cantidad = 3 where id = '92222222-0000-4000-8000-000000000003';
  get diagnostics v_count = row_count;
  call pg_temp.record('tomador_a', 'listo: modificacion operacional de item', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
    case when v_count = 1 then 'item actualizado sobre pedido listo' else 'bloqueado inesperadamente' end);
end $$;

reset role; -- verificacion privilegiada, no sujeta a RLS de audit.read
do $$
declare v_estado public.estado_pedido; v_flag boolean; v_log_count int;
begin
  select estado, requiere_revision_cocina into v_estado, v_flag from public.pedidos where id = '91111111-0000-4000-8000-000000000003';
  call pg_temp.record('tomador_a', 'listo -> en_preparacion: estado final', v_estado::text, 'en_preparacion',
    'estado del pedido tras la modificacion operacional');
  call pg_temp.record('tomador_a', 'listo -> en_preparacion: flag requiere_revision_cocina', case when v_flag then 'true' else 'false' end, 'true',
    'senal visible para cocina');
  select count(*) into v_log_count from public.log_cambios_pedido
    where pedido_id = '91111111-0000-4000-8000-000000000003' and campo = 'estado_auto_revision'
      and valor_anterior = 'listo' and valor_nuevo = 'en_preparacion';
  call pg_temp.record('tomador_a', 'listo -> en_preparacion: fila de auditoria en log_cambios_pedido', case when v_log_count = 1 then 'true' else 'false' end, 'true',
    format('%s fila(s) de auditoria encontradas', v_log_count));
end $$;
set local role authenticated;
select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000003'); -- tomador_a

-- ---------------------------------------------------------------------------
-- en_despacho: comanda (pedido_items) congelada; pedidos sigue editable.
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  begin
    update public.pedido_items set cantidad = 5 where id = '92222222-0000-4000-8000-000000000004';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'en_despacho: modificacion de item', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'comanda modificada estando en despacho -- SECURITY/FUNCTIONAL BUG' else 'bloqueado: comanda congelada en despacho' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'en_despacho: modificacion de item', 'DENY', 'DENY', 'bloqueado por guard_pedido_items_lifecycle_v2');
  end;
end $$;

do $$
declare v_count int;
begin
  begin
    update public.pedidos set notas = 'nota de despacho' where id = '91111111-0000-4000-8000-000000000005';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'en_despacho: modificacion de campo de pedidos (notas)', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
      case when v_count = 1 then 'pedidos sigue editable en despacho (reconciliacion de entrega)' else 'bloqueado inesperadamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'en_despacho: modificacion de campo de pedidos (notas)', 'DENY', 'ALLOW', 'bloqueado por excepcion inesperadamente');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- entregado / cancelado: bloqueado para no-admin, permitido para admin.
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  begin
    update public.pedidos set notas = 'intento post-entrega' where id = '91111111-0000-4000-8000-000000000006';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'entregado: modificacion de pedidos (no-admin)', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'pedido entregado modificado -- SECURITY BUG' else 'bloqueado inesperadamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'entregado: modificacion de pedidos (no-admin)', 'DENY', 'DENY', 'bloqueado: terminal lock en guard_pedido_update_v2');
  end;
end $$;

do $$
declare v_count int;
begin
  begin
    update public.pedido_items set cantidad = 9 where id = '92222222-0000-4000-8000-000000000007';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'entregado: modificacion de item (no-admin)', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'item de pedido entregado modificado -- SECURITY BUG' else 'bloqueado inesperadamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'entregado: modificacion de item (no-admin)', 'DENY', 'DENY', 'bloqueado: terminal lock en guard_pedido_items_lifecycle_v2');
  end;
end $$;

do $$
declare v_count int;
begin
  begin
    update public.pedidos set estado = 'cancelado', notas = 'cancelado por prueba' where id = '9111111a-0000-4000-8000-00000000000a';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'cancelado: modificacion de pedidos (no-admin)', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'pedido cancelado modificado -- SECURITY BUG' else 'bloqueado inesperadamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'cancelado: modificacion de pedidos (no-admin)', 'DENY', 'DENY', 'bloqueado: terminal lock en guard_pedido_update_v2');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Delivered orders are now corrected only through corregir_pedido_entregado;
-- direct writes (including admin) cannot bypass the allow-list or audit.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000001'); -- admin

do $$
declare v_count int;
begin
  begin
    update public.pedidos set notas = 'correccion admin post-entrega' where id = '91111111-0000-4000-8000-000000000008';
    get diagnostics v_count = row_count;
    call pg_temp.record('admin', 'entregado: modificacion directa de pedidos (admin)', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'admin omitio el flujo de correccion -- SECURITY BUG' else 'bloqueado correctamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('admin', 'entregado: modificacion directa de pedidos (admin)', 'DENY', 'DENY', 'debe usar la RPC auditada');
  end;
end $$;

do $$
declare v_count int;
begin
  begin
    update public.pedido_items set cantidad = 4 where id = '92222222-0000-4000-8000-000000000009';
    get diagnostics v_count = row_count;
    call pg_temp.record('admin', 'entregado: modificacion de item (admin)', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'admin modifico comanda entregada -- SECURITY BUG' else 'bloqueado correctamente' end);
  exception when insufficient_privilege then
    call pg_temp.record('admin', 'entregado: modificacion de item (admin)', 'DENY', 'DENY', 'comanda entregada inmutable');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Campo financiero: preparador no puede tocar total/descuento (cobertura ya
-- extensa en authorization_rls_matrix_v2_guards.sql; caso minimo aqui tambien
-- por pedido explicito de Fase 8).
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000004'); -- preparador_a
do $$
declare v_count int;
begin
  begin
    update public.pedidos set total = 999999, descuento = 500 where id = '9111111a-0000-4000-8000-00000000000b';
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador_a', 'campo financiero: preparador modifica total/descuento', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'preparador modifico campos financieros -- SECURITY BUG' else 'bloqueado: fuera del set de columnas permitido' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador_a', 'campo financiero: preparador modifica total/descuento', 'DENY', 'DENY', 'bloqueado por guard_pedido_update_v2 (diff de columnas)');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- Cross-branch: tomador_a (sucursal A) no puede tocar items de un pedido de
-- sucursal B. Bloqueado por pedido_items_manage_v2 (RLS), no por el guard nuevo.
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('9bbbbbbb-0000-4000-8000-000000000003'); -- tomador_a
do $$
declare v_count int;
begin
  begin
    update public.pedido_items set cantidad = 7 where id = '9222222a-0000-4000-8000-00000000000c';
    get diagnostics v_count = row_count;
    call pg_temp.record('tomador_a', 'cross-branch: modificacion de item de otra sucursal', case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'tomador_a modifico un item de la sucursal B -- SECURITY BUG (IDOR)' else 'bloqueado: 0 filas (RLS pedido_in_scope)' end);
  exception when insufficient_privilege then
    call pg_temp.record('tomador_a', 'cross-branch: modificacion de item de otra sucursal', 'DENY', 'DENY', 'bloqueado por excepcion');
  end;
end $$;

select jsonb_build_object(
  'total', (select count(*) from rls_v2_lifecycle_results),
  'pass', (select count(*) from rls_v2_lifecycle_results where result = 'PASS'),
  'fail', (select count(*) from rls_v2_lifecycle_results where result = 'FAIL'),
  'failures', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_lifecycle_results r where result = 'FAIL'),
  'all_results', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_lifecycle_results r)
) as report;

rollback;
