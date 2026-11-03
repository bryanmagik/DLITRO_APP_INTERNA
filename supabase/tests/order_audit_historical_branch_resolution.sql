-- STAGING only. Everything is synthetic and rolled back.
begin;
insert into public.sucursales(id,nombre,direccion,activo) values
 ('b0100000-0000-4000-8000-000000000001','Dashboard A','Synthetic',true),
 ('b0100000-0000-4000-8000-000000000002','Dashboard B','Synthetic',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',email,'{}','{}',now(),now() from (values
 ('b0200000-0000-4000-8000-000000000001'::uuid,'dashboard-super@test.local'),
 ('b0200000-0000-4000-8000-000000000002'::uuid,'dashboard-dispatch@test.local'),
 ('b0200000-0000-4000-8000-000000000003'::uuid,'dashboard-owner@test.local')
) x(id,email);
insert into public.usuarios(id,nombre,rol,activo) values
 ('b0200000-0000-4000-8000-000000000001','Dashboard Super','superadmin',true),
 ('b0200000-0000-4000-8000-000000000002','Dashboard Dispatcher','despachador',true),
 ('b0200000-0000-4000-8000-000000000003','Dashboard Owner','dueno_dlitro',true);
insert into public.turnos(id,sucursal_id,tomador_id,estado) values
 ('b0300000-0000-4000-8000-000000000001','b0100000-0000-4000-8000-000000000001','b0200000-0000-4000-8000-000000000001','abierto'),
 ('b0300000-0000-4000-8000-000000000002','b0100000-0000-4000-8000-000000000002','b0200000-0000-4000-8000-000000000001','abierto');
-- Report fixtures use explicit shift journeys, independent of test execution date.
update public.turnos set fecha_dlitro='2026-10-03'
 where id in ('b0300000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000002');
insert into public.turnos(id,sucursal_id,tomador_id,estado) values
 ('b0300000-0000-4000-8000-000000000003','b0100000-0000-4000-8000-000000000001','b0200000-0000-4000-8000-000000000001','cerrado');
update public.turnos set fecha_dlitro='2026-10-04' where id='b0300000-0000-4000-8000-000000000003';
insert into public.pedidos(id,sucursal_id,turno_id,tomador_id,cliente_nombre,tipo,estado,subtotal,total,descuento,jarros_entregados,despachador_id,promo_tipo,created_at) values
 ('b0500000-0000-4000-8000-000000000001','b0100000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000001','b0200000-0000-4000-8000-000000000001','Synthetic','despacho','entregado',5000,4000,1000,4,'b0200000-0000-4000-8000-000000000002','canje','2026-10-03T03:00:00Z'),
 ('b0500000-0000-4000-8000-000000000002','b0100000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000001','b0200000-0000-4000-8000-000000000001','Synthetic','despacho','entregado',5000,5000,0,null,null,null,'2026-10-03T04:00:00Z'),
 ('b0500000-0000-4000-8000-000000000003','b0100000-0000-4000-8000-000000000002','b0300000-0000-4000-8000-000000000002','b0200000-0000-4000-8000-000000000001','Synthetic','retiro','entregado',5000,3000,2000,10,null,'cumpleanos','2026-10-03T04:00:00Z'),
 ('b0500000-0000-4000-8000-000000000004','b0100000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000001','b0200000-0000-4000-8000-000000000001','Synthetic','despacho','cancelado',5000,0,5000,99,'b0200000-0000-4000-8000-000000000002','canje','2026-10-03T04:00:00Z'),
 ('b0500000-0000-4000-8000-000000000005','b0100000-0000-4000-8000-000000000001','b0300000-0000-4000-8000-000000000003','b0200000-0000-4000-8000-000000000001','Synthetic','despacho','entregado',5000,4000,1000,99,'b0200000-0000-4000-8000-000000000002','canje','2026-10-04T03:00:00Z');
-- More than 200 existing historical change events, exact boundary checks.
insert into public.log_cambios_pedido(pedido_id,pedido_ref,sucursal_id,usuario_id,actor_nombre,campo,tipo_evento,created_at)
select 'b0500000-0000-4000-8000-000000000001','b0500000-0000-4000-8000-000000000001','b0100000-0000-4000-8000-000000000001','b0200000-0000-4000-8000-000000000001','Dashboard Super','notas','pedido_modificado','2026-10-03T03:00:00Z' from generate_series(1,205);
-- Enrichment overwrites test insertion time/author. Set historic fixture values as trusted test setup.
update public.log_cambios_pedido set created_at='2026-10-03T16:00:00Z',usuario_id='b0200000-0000-4000-8000-000000000001',actor_nombre='Dashboard Super',origen_evento='historico',sucursal_id=null,sucursal_nombre=null,tipo_evento=null
 where pedido_ref='b0500000-0000-4000-8000-000000000001' and campo='notas';
set local role authenticated;
select set_config('request.jwt.claim.sub','b0200000-0000-4000-8000-000000000001',true);
do $$ declare report jsonb; rejected boolean:=false; begin
 report:=public.resumen_auditoria_pedidos('2026-10-03T03:00:00Z','2026-10-04T03:00:00Z','b0100000-0000-4000-8000-000000000001');
 assert (report->>'cambios')::int=205,'Summary truncated to first page or includes creation/automatic events';
 assert (report->>'pedidos_modificados')::int=1,'Counted repeated changes as distinct orders';
 assert (report->>'jarros')::int=4,'Jarros duplicated or canceled/out-of-period orders included';
 assert (report->>'jarros_sin_dato')::int=1,'Unknown quantity hidden as zero';
 assert (report->>'promociones')::int=1 and (report->>'entregados')::int=2,'Promotions duplicated or missing cohort boundary';
 assert report->'personas'->0->>'nombre'='Dashboard Super','Actor ranking incorrect';
 assert report->'despachadores'->0->>'nombre'='Dashboard Dispatcher','Dispatcher ranking incorrect';
 assert jsonb_array_length(report->'sucursales')=1,'Branch filter ignored';
 assert (report->>'sucursales_recuperadas')::int=205,'Historical branches not recovered';
 assert (report->'sucursales'->0->>'recuperados')::int=205,'Ranking omits recovered count';
 assert report->'sucursales'->0->>'nombre'='Dashboard A','Recovered name incorrect';
 assert (public.consultar_auditoria_pedidos(p_sucursal=>'b0100000-0000-4000-8000-000000000001',p_desde=>'2026-10-03T03:00:00Z',p_hasta=>'2026-10-04T03:00:00Z')->>'total')::int=205,'History branch filter differs from ranking';
 assert (public.consultar_auditoria_pedidos(p_sucursal=>'b0100000-0000-4000-8000-000000000001',p_desde=>'2026-10-03T03:00:00Z',p_hasta=>'2026-10-04T03:00:00Z')->>'modificados')::int=1,'Legacy events omitted from modified orders';
 assert jsonb_array_length(report->'dias')=1,'Chile day grouping incorrect';
 report:=public.resumen_auditoria_pedidos('2026-10-03T03:00:00Z','2026-10-04T03:00:00Z','b0100000-0000-4000-8000-000000000002');
 assert (report->>'promociones')::int=1 and report->>'jarros' is null,'Pickup jars included as dispatcher jars';
 begin perform public.resumen_auditoria_pedidos(null,null); exception when invalid_parameter_value then rejected:=true; end;
 assert rejected,'Invalid dates accepted';
end $$;

select set_config('test.audit_baseline',public.resumen_auditoria_pedidos('2026-10-03T03:00:00Z','2026-10-04T03:00:00Z')::text,true);
reset role;
insert into public.log_cambios_pedido(id,pedido_id,pedido_ref,campo,tipo_evento) values
 ('b0600000-0000-4000-8000-000000000001','b0500000-0000-4000-8000-000000000001','b0500000-0000-4000-8000-000000000001','notas','pedido_modificado'),
 ('b0600000-0000-4000-8000-000000000002',null,'b0500000-0000-4000-8000-000000000099','notas','pedido_modificado'),
 ('b0600000-0000-4000-8000-000000000003','b0500000-0000-4000-8000-000000000001','b0500000-0000-4000-8000-000000000001','notas','pedido_modificado');
update public.log_cambios_pedido set created_at='2026-10-03T16:00:00Z',
 usuario_id='b0200000-0000-4000-8000-000000000001',origen_evento='historico',
 sucursal_id=case when id='b0600000-0000-4000-8000-000000000001' then 'b0100000-0000-4000-8000-000000000002'::uuid end,
 sucursal_nombre=case when id='b0600000-0000-4000-8000-000000000001' then 'Original B' end
 where id in ('b0600000-0000-4000-8000-000000000001','b0600000-0000-4000-8000-000000000002','b0600000-0000-4000-8000-000000000003');
update public.log_cambios_pedido set origen_evento='servidor' where id='b0600000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','b0200000-0000-4000-8000-000000000001',true);
do $$ declare report jsonb; event jsonb; begin
 report:=public.resumen_auditoria_pedidos('2026-10-03T03:00:00Z','2026-10-04T03:00:00Z');
 assert (report->>'cambios')::int=(current_setting('test.audit_baseline')::jsonb->>'cambios')::int+3,'Lost or duplicated events after joins';
 assert (report->>'sin_sucursal')::int=(current_setting('test.audit_baseline')::jsonb->>'sin_sucursal')::int+2,'Guessed missing modern or orphan metadata';
 assert (report->>'sucursales_recuperadas')::int=(current_setting('test.audit_baseline')::jsonb->>'sucursales_recuperadas')::int,'Overrode explicit branch snapshot';
 select x into event from jsonb_array_elements(public.consultar_auditoria_pedidos(p_sucursal=>'b0100000-0000-4000-8000-000000000002')->'eventos') x where x->>'id'='b0600000-0000-4000-8000-000000000001';
 assert event->>'sucursal_resuelta_nombre'='Original B' and not (event->>'sucursal_recuperada')::boolean,'Snapshot replaced by current branch';
 begin perform private.order_audit_branch(null::public.log_cambios_pedido); raise exception 'Helper exposed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 assert (select count(*)=205 from public.log_cambios_pedido where pedido_ref='b0500000-0000-4000-8000-000000000001' and origen_evento='historico' and sucursal_id is null),'Read queries rewrote evidence';
end $$;
set local role authenticated;

select set_config('request.jwt.claim.sub','b0200000-0000-4000-8000-000000000003',true);
do $$ declare denied boolean:=false; begin
 begin perform public.resumen_auditoria_pedidos(now()-interval '1 day',now()); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Owner gained superadmin dashboard access';
end $$;
select set_config('request.jwt.claim.sub','b0200000-0000-4000-8000-000000000002',true);
do $$ declare denied boolean:=false; begin
 begin perform public.resumen_auditoria_pedidos(now()-interval '1 day',now()); exception when insufficient_privilege then denied:=true; end;
 assert denied,'Dispatcher gained dashboard access';
end $$;
reset role;
select 'PASS: historical branch recovery, preserved snapshots, orphan/modern unknowns, history filters, helper access, dashboard totals, >200 changes, Chile dates, unique orders, unknown jars, branch scope and superadmin authorization' result;
rollback;


