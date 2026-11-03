-- STAGING only. All synthetic fixtures and the candidate migration roll back.
begin;
insert into public.sucursales(id,nombre,direccion,activo) values
 ('b7100000-0000-4000-8000-000000000001','Journey A','Synthetic',true),
 ('b7100000-0000-4000-8000-000000000002','Journey B','Synthetic',true);
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select id,'authenticated','authenticated',email,'{}','{}',now(),now() from (values
 ('b7200000-0000-4000-8000-000000000001'::uuid,'journey-super@test.local'),
 ('b7200000-0000-4000-8000-000000000002'::uuid,'journey-worker@test.local'),
 ('b7200000-0000-4000-8000-000000000003'::uuid,'journey-owner@test.local')
) x(id,email);
insert into public.usuarios(id,nombre,rol,activo) values
 ('b7200000-0000-4000-8000-000000000001','Journey Super','superadmin',true),
 ('b7200000-0000-4000-8000-000000000002','Journey Worker','despachador',true),
 ('b7200000-0000-4000-8000-000000000003','Journey Owner','dueno_dlitro',true);
insert into public.turnos(id,sucursal_id,tomador_id,estado,created_at) values
 ('b7300000-0000-4000-8000-000000000001','b7100000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000001','abierto','2026-10-04T16:00:00Z'),
 ('b7300000-0000-4000-8000-000000000002','b7100000-0000-4000-8000-000000000002','b7200000-0000-4000-8000-000000000001','abierto','2026-10-05T16:00:00Z');
update public.turnos set fecha_dlitro=case when id='b7300000-0000-4000-8000-000000000001' then '2026-10-04'::date else '2026-10-05'::date end
 where id in ('b7300000-0000-4000-8000-000000000001','b7300000-0000-4000-8000-000000000002');
insert into public.pedidos(id,sucursal_id,turno_id,tomador_id,cliente_nombre,tipo,estado,subtotal,total,jarros_entregados,promo_tipo,descuento,created_at)
select ('b7500000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'b7100000-0000-4000-8000-000000000001','b7300000-0000-4000-8000-000000000001','b7200000-0000-4000-8000-000000000001',
 'Synthetic','despacho','entregado',5000,4000,case when n=1 then 6 else null end,(case when n=1 then 'canje' end)::public.tipo_promo,1000,'2026-10-05T04:00:00Z'
from generate_series(1,51) n;
-- New automatic events excluded from the summary; 211 explicit actions, one card.
insert into public.log_cambios_pedido(pedido_id,pedido_ref,campo,tipo_evento)
select 'b7500000-0000-4000-8000-000000000001','b7500000-0000-4000-8000-000000000001','notas','pedido_modificado' from generate_series(1,211);
update public.log_cambios_pedido set created_at='2026-10-05T04:00:00Z',usuario_id='b7200000-0000-4000-8000-000000000001',origen_evento='servidor'
 where pedido_ref='b7500000-0000-4000-8000-000000000001' and campo='notas';
-- A later correction stays with the original shift; historical metadata recovers it.
update public.log_cambios_pedido set turno_id=null,numero_pedido=null,origen_evento='historico',created_at='2026-10-06T16:00:00Z'
 where id=(select id from public.log_cambios_pedido where pedido_ref='b7500000-0000-4000-8000-000000000001' and campo='notas' limit 1);
do $$ begin
 assert private.audit_dlitro_day('2026-10-05T08:59:59Z')='2026-10-04','Before cutoff belongs to previous day';
 assert private.audit_dlitro_day('2026-10-05T09:00:00Z')='2026-10-05','At cutoff belongs to new day';
 assert private.audit_dlitro_day('2026-07-05T09:59:59Z')='2026-07-04','Winter offset incorrect';
 assert private.audit_dlitro_day('2026-07-05T10:00:00Z')='2026-07-05','Winter cutoff incorrect';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','b7200000-0000-4000-8000-000000000001',true);
do $$ declare report jsonb; cards jsonb; second jsonb; events jsonb; begin
 report:=public.resumen_auditoria_pedidos('2026-10-04T03:00:00Z','2026-10-05T03:00:00Z','b7100000-0000-4000-8000-000000000001');
 assert (report->>'cambios')::int=211,'Midnight or later corrections assigned to wrong journey';
 assert report->'dias'->0->>'dia'='2026-10-04' and jsonb_array_length(report->'dias')=1,'Daily grouping not by shift';
 assert (report->>'entregados')::int=51 and (report->>'jarros')::int=6,'Delivered cohort is not shift-based';
 assert (report->>'jarros_promos')::int=1 and (report->>'jarros_sueltos')::int=2,'Jar breakdown regressed';
 assert (report->>'jarros_sin_dato')::int=50,'Unknown jar quantities hidden';
 assert (public.resumen_auditoria_pedidos('2026-10-05T03:00:00Z','2026-10-06T03:00:00Z','b7100000-0000-4000-8000-000000000001')->>'cambios')::int=0,'Next journey includes overnight actions';
 cards:=public.listar_pedidos_auditoria(p_sucursal=>'b7100000-0000-4000-8000-000000000001',p_desde=>'2026-10-04',p_hasta=>'2026-10-04');
 assert (cards->>'total_pedidos')::int=51 and jsonb_array_length(cards->'pedidos')=50,'Paginated events instead of distinct cards';
 second:=public.listar_pedidos_auditoria(p_sucursal=>'b7100000-0000-4000-8000-000000000001',p_desde=>'2026-10-04',p_hasta=>'2026-10-04',p_pagina=>1);
 assert jsonb_array_length(second->'pedidos')=1,'Second card page incorrect';
 assert not exists(select 1 from jsonb_array_elements(cards->'pedidos') a cross join jsonb_array_elements(second->'pedidos') b where a->>'tarjeta_id'=b->>'tarjeta_id'),'Card repeated on two pages';
 cards:=public.listar_pedidos_auditoria(p_actor=>'b7200000-0000-4000-8000-000000000001',p_sucursal=>'b7100000-0000-4000-8000-000000000001',p_evento=>'pedido_modificado',p_desde=>'2026-10-04',p_hasta=>'2026-10-04');
 assert (cards->>'total_pedidos')::int=1 and (cards->>'total')::int=211,'Actor/type filters applied after pagination';
 assert (cards->'pedidos'->0->>'jornada_recuperada')::boolean,'Historical journey recovery not identified';
 events:=public.consultar_auditoria_pedidos(p_pedido=>'b7500000-0000-4000-8000-000000000001');
 assert (events->>'total')::int>211 and jsonb_array_length(events->'eventos')=50,'Complete order history unavailable';
 events:=public.historial_completo_pedido_auditoria('b7500000-0000-4000-8000-000000000001');
 assert jsonb_array_length(events->'eventos')=(events->>'total')::int and (events->>'total')::int>211,'Full history truncated to first page';
 assert (public.listar_pedidos_auditoria(p_sucursal=>'b7100000-0000-4000-8000-000000000002')->>'total')::int=0,'Branch filter ignored';
 begin perform public.listar_pedidos_auditoria(p_desde=>'2026-10-05',p_hasta=>'2026-10-04'); raise exception 'Invalid dates accepted'; exception when invalid_parameter_value then null; end;
 begin perform private.order_audit_journey(null::public.log_cambios_pedido); raise exception 'Private helper exposed'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','b7200000-0000-4000-8000-000000000003',true);
do $$ begin
 assert (public.listar_pedidos_auditoria(p_sucursal=>'b7100000-0000-4000-8000-000000000001')->>'total_pedidos')::int=51,'Owner cannot read cards';
 begin perform public.resumen_auditoria_pedidos(now()-interval '1 day',now()); raise exception 'Owner summary scope widened'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','b7200000-0000-4000-8000-000000000002',true);
do $$ begin
 begin perform public.listar_pedidos_auditoria(); raise exception 'Worker can read audit cards'; exception when insufficient_privilege then null; end;
 begin perform public.historial_completo_pedido_auditoria('b7500000-0000-4000-8000-000000000001'); raise exception 'Worker can read full audit'; exception when insufficient_privilege then null; end;
end $$;
reset role;
set local role anon;
do $$ begin
 begin perform public.listar_pedidos_auditoria(); raise exception 'Anonymous audit access'; exception when insufficient_privilege then null; end;
 begin perform public.historial_completo_pedido_auditoria('b7500000-0000-4000-8000-000000000001'); raise exception 'Anonymous full audit access'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: shift-based journeys, late corrections, Chile 06:00 cutoff, winter offset, card pagination, full history, filters, jars and denied access' result;
rollback;
