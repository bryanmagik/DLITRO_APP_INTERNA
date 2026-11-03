-- STAGING only; all synthetic data, identities and events are rolled back.
begin;
insert into public.sucursales(id,nombre,direccion,activo) values
  ('a0100000-0000-4000-8000-000000000001','Audit owned','Synthetic',true),
  ('a0100000-0000-4000-8000-000000000002','Audit franchise','Synthetic',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',email,'{}','{}',now(),now() from (values
  ('a0200000-0000-4000-8000-000000000001'::uuid,'audit-super@test.local'),
  ('a0200000-0000-4000-8000-000000000002'::uuid,'audit-owner@test.local'),
  ('a0200000-0000-4000-8000-000000000003'::uuid,'audit-taker-a@test.local'),
  ('a0200000-0000-4000-8000-000000000004'::uuid,'audit-taker-b@test.local'),
  ('a0200000-0000-4000-8000-000000000005'::uuid,'audit-admin@test.local')
) x(id,email);
insert into public.usuarios(id,nombre,rol,sucursal_id,activo) values
  ('a0200000-0000-4000-8000-000000000001','Audit Super','superadmin',null,true),
  ('a0200000-0000-4000-8000-000000000002','Audit Owner','dueno_dlitro',null,true),
  ('a0200000-0000-4000-8000-000000000003','Taker A','tomador_pedidos','a0100000-0000-4000-8000-000000000001',true),
  ('a0200000-0000-4000-8000-000000000004','Taker B','tomador_pedidos','a0100000-0000-4000-8000-000000000001',true),
  ('a0200000-0000-4000-8000-000000000005','Audit Admin','admin',null,true);
insert into public.turnos(id,sucursal_id,tomador_id,estado) values
  ('a0300000-0000-4000-8000-000000000001','a0100000-0000-4000-8000-000000000001','a0200000-0000-4000-8000-000000000003','abierto');
insert into public.categorias(id,nombre) values ('a0400000-0000-4000-8000-000000000001','Audit test');
insert into public.productos(id,nombre,precio,categoria_id) values
  ('a0400000-0000-4000-8000-000000000002','Audit beverage',5000,'a0400000-0000-4000-8000-000000000001');
create function pg_temp.as_audit_actor(actor uuid) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
$$;
set local role authenticated;
select pg_temp.as_audit_actor('a0200000-0000-4000-8000-000000000003');
insert into public.pedidos(id,sucursal_id,turno_id,tomador_id,cliente_nombre,tipo,estado,subtotal,total)
values ('a0500000-0000-4000-8000-000000000001','a0100000-0000-4000-8000-000000000001',
  'a0300000-0000-4000-8000-000000000001','a0200000-0000-4000-8000-000000000003','Synthetic customer','retiro','en_preparacion',5000,5000);
insert into public.pedido_items(id,pedido_id,producto_id,cantidad,precio_unitario,subtotal)
values ('a0600000-0000-4000-8000-000000000001','a0500000-0000-4000-8000-000000000001','a0400000-0000-4000-8000-000000000002',1,5000,5000);
select pg_temp.as_audit_actor('a0200000-0000-4000-8000-000000000004');
update public.pedido_items set cantidad=2,subtotal=10000 where id='a0600000-0000-4000-8000-000000000001';
update public.pedidos set descuento=1000,promo_tipo='canje' where id='a0500000-0000-4000-8000-000000000001';
insert into public.pagos_turno(id,turno_id,pedido_id,metodo,monto) values
  ('a0700000-0000-4000-8000-000000000001','a0300000-0000-4000-8000-000000000001','a0500000-0000-4000-8000-000000000001','efectivo',5000);
update public.pagos_turno set metodo='tarjeta' where id='a0700000-0000-4000-8000-000000000001';
-- No-op writes must not invent activity.
update public.pedido_items set cantidad=cantidad where id='a0600000-0000-4000-8000-000000000001';
update public.pedidos set updated_at=now() where id='a0500000-0000-4000-8000-000000000001';
do $$ declare rejected boolean := false; begin
  begin insert into public.log_cambios_pedido(pedido_id,usuario_id,campo,valor_nuevo)
    values ('a0500000-0000-4000-8000-000000000001','a0200000-0000-4000-8000-000000000004','forged','100');
  exception when insufficient_privilege then rejected := true; end;
  assert rejected,'Worker can fabricate audit';
  assert not exists(select 1 from public.log_cambios_pedido),'Worker can read private history';
  rejected := false;
  begin perform public.consultar_auditoria_pedidos(); exception when insufficient_privilege then rejected := true; end;
  assert rejected,'Worker can call private audit RPC';
end $$;
reset role;
do $$ declare count_before integer; begin
  assert (select count(*) from public.log_cambios_pedido where pedido_ref='a0500000-0000-4000-8000-000000000001')=6,'Wrong event count / duplicated/no-op events';
  assert exists(select 1 from public.log_cambios_pedido where pedido_ref='a0500000-0000-4000-8000-000000000001'
    and tipo_evento='pedido_creado' and usuario_id='a0200000-0000-4000-8000-000000000003'),'Creator not captured';
  assert exists(select 1 from public.log_cambios_pedido where pedido_ref='a0500000-0000-4000-8000-000000000001'
    and tipo_evento='producto_modificado' and usuario_id='a0200000-0000-4000-8000-000000000004'
    and valor_anterior::jsonb->>'cantidad'='1' and valor_nuevo::jsonb->>'cantidad'='2'),'Modifier or before/after wrong';
  assert exists(select 1 from public.log_cambios_pedido where pedido_ref='a0500000-0000-4000-8000-000000000001'
    and tipo_evento='pedido_modificado' and estado_pedido='en_preparacion'
    and valor_nuevo::jsonb->>'promo_tipo'='canje'),'Promotion state missing';
  select count(*) into count_before from public.log_cambios_pedido;
  begin
    update public.pedido_items set cantidad=3 where id='a0600000-0000-4000-8000-000000000001';
    raise exception 'synthetic rollback';
  exception when raise_exception then null; end;
  assert (select count(*) from public.log_cambios_pedido)=count_before,'Rolled-back operation left history';
end $$;
-- More than 200 real server events, then filter BEFORE pagination.
do $$ begin for i in 1..205 loop
  update public.pedidos set descuento=i where id='a0500000-0000-4000-8000-000000000001';
end loop; end $$;
set local role authenticated;
select pg_temp.as_audit_actor('a0200000-0000-4000-8000-000000000002');
do $$ declare report jsonb; rejected boolean := false; begin
  report := public.consultar_auditoria_pedidos(p_pedido=>'a0500000-0000-4000-8000-000000000001',p_pagina=>4);
  assert (report->>'total')::integer=211 and jsonb_array_length(report->'eventos')=11,'Pagination truncates history';
  report := public.consultar_auditoria_pedidos(p_actor=>'a0200000-0000-4000-8000-000000000003',p_pedido=>'a0500000-0000-4000-8000-000000000001');
  assert (report->>'total')::integer=2,'Actor filter applied after pagination';
  assert (report->>'creados')::integer=1,'Creation summary counts fields';
  assert not private.has_permission('orders.update') and not private.has_permission('cash.manage'),'Owner got operation permissions';
  begin delete from public.log_cambios_pedido; exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Owner can delete evidence';
end $$;
-- Roles outside the explicit audit reader list must remain denied.
reset role;
do $$ declare actor uuid; denied boolean; begin
  for actor in select id from public.usuarios where activo and rol::text not in ('superadmin','dueno_dlitro','contador_rrhh') loop
    perform pg_temp.as_audit_actor(actor);
    denied:=false;
    begin perform public.consultar_auditoria_pedidos(); exception when insufficient_privilege then denied:=true; end;
    assert denied,'Unauthorized role gained audit access';
  end loop;
end $$;
set local role authenticated;
select pg_temp.as_audit_actor('a0200000-0000-4000-8000-000000000005');
do $$ declare rejected boolean:=false; begin
  begin update public.usuarios set rol='dueno_dlitro' where id='a0200000-0000-4000-8000-000000000005';
  exception when insufficient_privilege then rejected:=true; end;
  assert rejected,'Admin can promote itself to owner';
end $$;
select pg_temp.as_audit_actor('a0200000-0000-4000-8000-000000000001');
do $$ begin
  assert public.puede_ver_auditoria_pedidos(),'Superadmin denied';
  assert (public.consultar_auditoria_pedidos(p_pedido=>'a0500000-0000-4000-8000-000000000001')->>'total')::integer=211,'Superadmin history missing';
end $$;
reset role;
-- Removing an order must retain evidence and its immutable reference.
delete from public.pagos_turno where pedido_id='a0500000-0000-4000-8000-000000000001';
delete from public.pedidos where id='a0500000-0000-4000-8000-000000000001';
do $$ begin
  assert (select count(*) from public.log_cambios_pedido where pedido_ref='a0500000-0000-4000-8000-000000000001')>=212,'Order deletion removed history';
end $$;
select 'PASS: server snapshots, actors, promotions, payments, no-ops, rollback, >200 pagination, role isolation and history retention' result;
rollback;
