-- Advanced delivered-order payment corrections.
-- Self-contained and transactional: safe to rerun on STAGING.

begin;

insert into public.sucursales (id, nombre, direccion, activo) values
  ('8aaaaaaa-0000-4000-8000-00000000000a', 'Payment correction A', 'x', true),
  ('8aaaaaaa-0000-4000-8000-00000000000b', 'Payment correction B', 'x', true);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, crypt(gen_random_uuid()::text, gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       now(), now(), '', '', '', ''
from (values
  ('8bbbbbbb-0000-4000-8000-000000000001'::uuid, 'payment-tomador-a@test.local'),
  ('8bbbbbbb-0000-4000-8000-000000000002'::uuid, 'payment-preparador-a@test.local'),
  ('8bbbbbbb-0000-4000-8000-000000000003'::uuid, 'payment-tomador-b@test.local')
) x(id, email);

insert into public.usuarios (id, nombre, rol, sucursal_id, activo) values
  ('8bbbbbbb-0000-4000-8000-000000000001', 'Payment Tomador A', 'tomador_pedidos', '8aaaaaaa-0000-4000-8000-00000000000a', true),
  ('8bbbbbbb-0000-4000-8000-000000000002', 'Payment Preparador A', 'preparador', '8aaaaaaa-0000-4000-8000-00000000000a', true),
  ('8bbbbbbb-0000-4000-8000-000000000003', 'Payment Tomador B', 'tomador_pedidos', '8aaaaaaa-0000-4000-8000-00000000000b', true);

insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('8ddddddd-0000-4000-8000-00000000a001', '8aaaaaaa-0000-4000-8000-00000000000a', '8bbbbbbb-0000-4000-8000-000000000001', 'abierto', 0),
  ('8ddddddd-0000-4000-8000-00000000b001', '8aaaaaaa-0000-4000-8000-00000000000b', '8bbbbbbb-0000-4000-8000-000000000003', 'abierto', 0);

insert into public.categorias (id, nombre) values
  ('8ccccccc-0000-4000-8000-000000000001', 'Payment correction category');
insert into public.productos (id, nombre, precio, categoria_id) values
  ('8ccccccc-0000-4000-8000-000000000002', 'Payment correction product', 30000, '8ccccccc-0000-4000-8000-000000000001');

insert into public.pedidos
  (id, turno_id, sucursal_id, tomador_id, cliente_nombre, tipo, estado,
   subtotal, descuento, costo_despacho, total, metodo_pago, notas)
values
  ('81111111-0000-4000-8000-000000000001', '8ddddddd-0000-4000-8000-00000000a001', '8aaaaaaa-0000-4000-8000-00000000000a', '8bbbbbbb-0000-4000-8000-000000000001', 'Simple cases', 'retiro', 'en_preparacion', 30000, 0, 0, 30000, 'transferencia', 'original'),
  ('81111111-0000-4000-8000-000000000002', '8ddddddd-0000-4000-8000-00000000a001', '8aaaaaaa-0000-4000-8000-00000000000a', '8bbbbbbb-0000-4000-8000-000000000001', 'Mixed cases', 'retiro', 'en_preparacion', 30000, 0, 0, 30000, 'mixto', 'mixed original'),
  ('81111111-0000-4000-8000-000000000003', '8ddddddd-0000-4000-8000-00000000a001', '8aaaaaaa-0000-4000-8000-00000000000a', '8bbbbbbb-0000-4000-8000-000000000001', 'Wrong state', 'retiro', 'en_preparacion', 30000, 0, 0, 30000, 'efectivo', null),
  ('81111111-0000-4000-8000-000000000004', '8ddddddd-0000-4000-8000-00000000b001', '8aaaaaaa-0000-4000-8000-00000000000b', '8bbbbbbb-0000-4000-8000-000000000003', 'Other branch', 'retiro', 'en_preparacion', 30000, 0, 0, 30000, 'efectivo', null),
  ('81111111-0000-4000-8000-000000000005', '8ddddddd-0000-4000-8000-00000000a001', '8aaaaaaa-0000-4000-8000-00000000000a', '8bbbbbbb-0000-4000-8000-000000000001', 'Rollback case', 'retiro', 'en_preparacion', 30000, 0, 0, 30000, 'efectivo', null);

insert into public.pedido_items (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal) values
  ('82222222-0000-4000-8000-000000000001', '81111111-0000-4000-8000-000000000001', '8ccccccc-0000-4000-8000-000000000002', 1, 30000, 30000),
  ('82222222-0000-4000-8000-000000000002', '81111111-0000-4000-8000-000000000002', '8ccccccc-0000-4000-8000-000000000002', 1, 30000, 30000),
  ('82222222-0000-4000-8000-000000000005', '81111111-0000-4000-8000-000000000005', '8ccccccc-0000-4000-8000-000000000002', 1, 30000, 30000);

insert into public.pagos_turno (turno_id, pedido_id, metodo, monto) values
  ('8ddddddd-0000-4000-8000-00000000a001', '81111111-0000-4000-8000-000000000001', 'transferencia', 30000),
  ('8ddddddd-0000-4000-8000-00000000a001', '81111111-0000-4000-8000-000000000002', 'efectivo', 10000),
  ('8ddddddd-0000-4000-8000-00000000a001', '81111111-0000-4000-8000-000000000002', 'transferencia', 20000),
  ('8ddddddd-0000-4000-8000-00000000a001', '81111111-0000-4000-8000-000000000005', 'efectivo', 30000);

update public.pedidos set estado = 'entregado'
where id in (
  '81111111-0000-4000-8000-000000000001',
  '81111111-0000-4000-8000-000000000002',
  '81111111-0000-4000-8000-000000000004',
  '81111111-0000-4000-8000-000000000005'
);

create function pg_temp.as_actor(p_user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;
select pg_temp.as_actor('8bbbbbbb-0000-4000-8000-000000000001');

-- 1 simple -> simple.
select public.corregir_pagos_pedido_entregado(
  '81111111-0000-4000-8000-000000000001',
  '[{"metodo":"tarjeta","monto":30000}]', 'simple', 'simple a simple');

-- 2 simple -> mixed.
select public.corregir_pagos_pedido_entregado(
  '81111111-0000-4000-8000-000000000001',
  '[{"metodo":"efectivo","monto":10000},{"metodo":"tarjeta","monto":20000}]',
  'simple', 'simple a mixto');

-- 3 mixed -> simple.
select public.corregir_pagos_pedido_entregado(
  '81111111-0000-4000-8000-000000000002',
  '[{"metodo":"tarjeta","monto":30000}]', 'mixed original', 'mixto a simple');

-- 4 mixed -> mixed.
select public.corregir_pagos_pedido_entregado(
  '81111111-0000-4000-8000-000000000001',
  '[{"metodo":"efectivo","monto":15000},{"metodo":"tarjeta","monto":15000}]',
  'nota final', 'mixto a mixto');

-- 5-11 and 14: invalid payload/state cases must reject.
do $$
declare rejected boolean;
begin
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":29999}]', 'x', 'menor'); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '5: sum lower than total was accepted';
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":30001}]', 'x', 'mayor'); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '6: sum higher than total was accepted';
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":-1},{"metodo":"tarjeta","monto":30001}]', 'x', 'negativo'); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '7: negative amount was accepted';
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":0},{"metodo":"tarjeta","monto":30000}]', 'x', 'cero'); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '8: zero amount was accepted';
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":10000},{"metodo":"efectivo","monto":20000}]', 'x', 'duplicado'); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '9: duplicate method was accepted';
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"bitcoin","monto":30000}]', 'x', 'invalido'); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '10: invalid method was accepted';
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000003', '[{"metodo":"efectivo","monto":30000}]', 'x', 'estado'); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '11: non-delivered order was accepted';
  rejected := false;
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":30000}]', 'x', '   '); exception when invalid_parameter_value then rejected := true; end;
  assert rejected, '14: empty reason was accepted';
end $$;

-- 12 user without orders.update.
select pg_temp.as_actor('8bbbbbbb-0000-4000-8000-000000000002');
do $$ declare rejected boolean := false; begin
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":30000}]', 'x', 'sin permiso'); exception when insufficient_privilege then rejected := true; end;
  assert rejected, '12: user without orders.update was accepted';
end $$;

-- 13 cross-branch isolation.
select pg_temp.as_actor('8bbbbbbb-0000-4000-8000-000000000003');
do $$ declare rejected boolean := false; begin
  begin perform public.corregir_pagos_pedido_entregado('81111111-0000-4000-8000-000000000001', '[{"metodo":"efectivo","monto":30000}]', 'x', 'otra sucursal'); exception when insufficient_privilege then rejected := true; end;
  assert rejected, '13: cross-branch correction was accepted';
end $$;

reset role;

-- Failure injector for case 15. The RPC must roll back its prior DELETE.
create function pg_temp.fail_payment_insert() returns trigger language plpgsql as $$
begin
  if new.referencia = '__force_rollback__' then raise exception 'forced payment failure'; end if;
  return new;
end $$;
create trigger zz_test_fail_payment_insert before insert on public.pagos_turno
for each row execute function pg_temp.fail_payment_insert();

set local role authenticated;
select pg_temp.as_actor('8bbbbbbb-0000-4000-8000-000000000001');
do $$ declare rejected boolean := false; begin
  begin
    perform public.corregir_pagos_pedido_entregado(
      '81111111-0000-4000-8000-000000000005',
      '[{"metodo":"tarjeta","monto":30000,"referencia":"__force_rollback__"}]', null, 'rollback');
  exception when others then rejected := true;
  end;
  assert rejected, '15: injected failure did not reject';
end $$;
reset role;

do $$
declare
  p public.pedidos;
  payment_count integer;
  payment_sum bigint;
  item_quantity integer;
  audit_count integer;
  audit_has_snapshots boolean;
begin
  -- 15 rollback is complete.
  select count(*), sum(monto) into payment_count, payment_sum
  from public.pagos_turno where pedido_id = '81111111-0000-4000-8000-000000000005' and metodo = 'efectivo';
  assert payment_count = 1 and payment_sum = 30000, '15: payment composition was partially changed';

  select * into p from public.pedidos where id = '81111111-0000-4000-8000-000000000001';
  select cantidad into item_quantity from public.pedido_items where pedido_id = p.id;
  select count(*), bool_and(valor_anterior::jsonb is not null and valor_nuevo::jsonb is not null)
    into audit_count, audit_has_snapshots
  from public.log_cambios_pedido
  where pedido_id = p.id and tipo_evento = 'pagos_corregidos_post_cierre';

  assert audit_count = 3 and audit_has_snapshots, '16: complete before/after audit snapshots missing';
  assert p.total = 30000, '17: order total changed';
  assert item_quantity = 1, '18: order items changed';
  assert p.estado = 'entregado', '18: order state changed';
end $$;

set local role authenticated;
select pg_temp.as_actor('8bbbbbbb-0000-4000-8000-000000000001');

-- Direct delivered-payment writes are blocked even with otherwise-valid table grants.
do $$ declare rejected boolean := false; begin
  begin update public.pagos_turno set monto = monto where pedido_id = '81111111-0000-4000-8000-000000000001'; exception when insufficient_privilege then rejected := true; end;
  assert rejected, 'direct delivered-order payment update was accepted';
end $$;

-- 19 legacy administrative/simple RPC still works.
select public.corregir_pedido_entregado(
  '81111111-0000-4000-8000-000000000002', 'efectivo', 'legacy note', 'legacy regression');

reset role;
do $$ declare p public.pedidos; payment_sum bigint; begin
  select * into p from public.pedidos where id = '81111111-0000-4000-8000-000000000002';
  select sum(monto) into payment_sum from public.pagos_turno where pedido_id = p.id and metodo = 'efectivo';
  assert p.estado = 'entregado' and p.metodo_pago = 'efectivo' and p.notas = 'legacy note' and payment_sum = 30000,
    '19: legacy correction regression';
end $$;

-- 20 is covered by authorization_rls_matrix_v2_order_lifecycle.sql, which
-- remains part of the required regression run (listo -> en_preparacion).

rollback;
