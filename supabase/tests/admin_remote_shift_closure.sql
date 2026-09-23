begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into public.sucursales (id, nombre, direccion, activo) values
  ('fa000000-0000-4000-8000-000000000001', 'Test cierre admin 1', 'Direccion test 1', true),
  ('fa000000-0000-4000-8000-000000000002', 'Test cierre admin 2', 'Direccion test 2', true),
  ('fa000000-0000-4000-8000-000000000003', 'Test cierre admin 3', 'Direccion test 3', true);

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
  ('fa100000-0000-4000-8000-000000000001'::uuid, 'cierre-admin-1@test.local'),
  ('fa100000-0000-4000-8000-000000000002'::uuid, 'cierre-admin-2@test.local'),
  ('fa100000-0000-4000-8000-000000000003'::uuid, 'cierre-tomador@test.local')
) as x(id, email);

insert into public.usuarios (id, nombre, rol, sucursal_id, activo) values
  ('fa100000-0000-4000-8000-000000000001', 'Admin Uno', 'admin', 'fa000000-0000-4000-8000-000000000001', true),
  ('fa100000-0000-4000-8000-000000000002', 'Admin Dos', 'admin', 'fa000000-0000-4000-8000-000000000001', true),
  ('fa100000-0000-4000-8000-000000000003', 'Tomador', 'tomador_pedidos', 'fa000000-0000-4000-8000-000000000001', true);

insert into public.turnos (id, sucursal_id, tomador_id, caja_chica_apertura, estado) values
  ('fa200000-0000-4000-8000-000000000001', 'fa000000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000003', 10000, 'abierto'),
  ('fa200000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000002', 'fa100000-0000-4000-8000-000000000003', 10000, 'abierto'),
  ('fa200000-0000-4000-8000-000000000003', 'fa000000-0000-4000-8000-000000000003', 'fa100000-0000-4000-8000-000000000003', 10000, 'abierto');

insert into public.pagos_turno (turno_id, metodo, monto)
values ('fa200000-0000-4000-8000-000000000001', 'efectivo', 20000);
insert into public.gastos_turno (turno_id, concepto, monto, metodo)
values ('fa200000-0000-4000-8000-000000000001', 'Compra operativa', 3000, 'efectivo');
insert into public.pago_despachadores
  (turno_id, despachador_id, total_a_pagar, pagado)
values
  ('fa200000-0000-4000-8000-000000000001', 'fa100000-0000-4000-8000-000000000003', 5000, true);
insert into public.pedidos
  (id, turno_id, sucursal_id, tomador_id, cliente_nombre, tipo, estado, subtotal, total)
values
  ('fa300000-0000-4000-8000-000000000001', 'fa200000-0000-4000-8000-000000000002', 'fa000000-0000-4000-8000-000000000002', 'fa100000-0000-4000-8000-000000000003', 'Cliente test', 'retiro', 'listo', 1000, 1000);

select ok(
  has_function_privilege('authenticated', 'public.cerrar_turno_remotamente_admin(uuid,integer,text)', 'EXECUTE'),
  'authenticated puede invocar el RPC protegido de cierre'
);
select ok(
  not has_function_privilege('anon', 'public.cerrar_turno_remotamente_admin(uuid,integer,text)', 'EXECUTE'),
  'anon no puede invocar el cierre administrativo'
);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"fa100000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$select public.cerrar_turno_remotamente_admin('fa200000-0000-4000-8000-000000000001', 0, 'Turno olvidado')$$,
  'el administrador puede declarar cero al cerrar'
);
select is(
  (select efectivo_sistema from public.turnos where id = 'fa200000-0000-4000-8000-000000000001'),
  22000,
  'el efectivo esperado se calcula en la base de datos'
);
select ok(
  (select cierre_remoto and cerrado_remotamente_por = 'fa100000-0000-4000-8000-000000000001'
   from public.turnos where id = 'fa200000-0000-4000-8000-000000000001'),
  'el turno queda marcado con el administrador que lo cerro'
);
select is(
  (select count(*)::integer from public.turnos_cierres_admin_auditoria
   where turno_id = 'fa200000-0000-4000-8000-000000000001' and accion = 'cierre_remoto'),
  1,
  'el cierre crea una entrada de auditoria'
);

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok(
  $$select public.corregir_efectivo_cierre_remoto_admin('fa200000-0000-4000-8000-000000000001', 0, 25000, 'Monto recibido')$$,
  '42501',
  'Solo quien realizo el cierre administrativo puede corregirlo',
  'otro administrador no puede corregir el cierre ajeno'
);

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok(
  $$select public.corregir_efectivo_cierre_remoto_admin('fa200000-0000-4000-8000-000000000001', 0, 25000, 'Monto real recibido')$$,
  'el mismo administrador puede corregir el efectivo'
);
select is(
  (select efectivo_anterior from public.turnos_cierres_admin_auditoria
   where turno_id = 'fa200000-0000-4000-8000-000000000001' and accion = 'correccion_efectivo'),
  0,
  'la auditoria conserva el monto anterior aunque sea cero'
);
select throws_ok(
  $$select public.cerrar_turno_remotamente_admin('fa200000-0000-4000-8000-000000000002', 0, 'Turno con pedido')$$,
  '22023',
  'No se puede cerrar: el turno tiene pedidos sin completar',
  'no se cierra un turno con pedidos operativos pendientes'
);

select set_config('request.jwt.claims', '{"sub":"fa100000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$select public.cerrar_turno_remotamente_admin('fa200000-0000-4000-8000-000000000003', 0, 'Intento no autorizado')$$,
  '42501',
  'Solo un administrador puede cerrar turnos remotamente',
  'un tomador no puede usar el cierre administrativo'
);

select * from finish();
rollback;
