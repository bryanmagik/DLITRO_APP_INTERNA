-- ONLY staging suscxwjloggmbsqdlgpj. Explicitly requested dashboard sample.
-- Fictional inactive profiles have no password, identity or login method.
begin;
do $$ begin
 assert not exists(select 1 from public.sucursales where id::text like 'd4100000-%'), 'Demo already loaded; do not duplicate';
end $$;
insert into public.sucursales(id,nombre,direccion,activo)
select ('d4100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'DEMO Auditoría '||(array['Centro','Norte','Sur'])[i],'Datos ficticios para visualizar auditoría',true
from generate_series(1,3) i;
insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select ('d4200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'authenticated','authenticated','audit-dashboard-demo-'||i||'@example.invalid','{}',
 '{"demo":"audit_dashboard_20261004"}'::jsonb,now(),now() from generate_series(1,6) i;
insert into public.usuarios(id,nombre,apellido,rol,sucursal_id,activo)
select ('d4200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 'DEMO '||(array['Camila','Diego','Valentina','Mateo','Lucas','Antonia'])[i],
 (array['Rojas','Soto','Pérez','Silva','Torres','Díaz'])[i],
 case when i<=3 then 'tomador_pedidos' else 'despachador' end::public.rol_usuario,
 ('d4100000-0000-4000-8000-'||lpad(((i-1)%3+1)::text,12,'0'))::uuid,false
from generate_series(1,6) i;
insert into public.turnos(id,sucursal_id,tomador_id,estado)
select ('d4300000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('d4100000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('d4200000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'cerrado'
from generate_series(1,3) i;
-- Dedicated fictitious orders only. No payment, inventory, product or cash mutations.
insert into public.pedidos(id,sucursal_id,turno_id,tomador_id,cliente_nombre,tipo,estado,
 subtotal,total,descuento,jarros_prometidos,jarros_entregados,despachador_id,promo_tipo,notas,created_at)
select ('d4500000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,
 ('d4100000-0000-4000-8000-'||lpad(b::text,12,'0'))::uuid,
 ('d4300000-0000-4000-8000-'||lpad(b::text,12,'0'))::uuid,
 ('d4200000-0000-4000-8000-'||lpad(b::text,12,'0'))::uuid,
 'DEMO Cliente '||i,'despacho',case when i%11=0 then 'cancelado' else 'entregado' end::public.estado_pedido,
 18000,18000-case when i%5=0 then 0 else 1000*(1+i%4) end,
 case when i%5=0 then 0 else 1000*(1+i%4) end,
 case b when 1 then 8 when 2 then 4 else 2 end,
 case when i%13=0 then null else case b when 1 then 4+i%5 when 2 then 2+i%3 else 1+i%2 end end,
 case when i%17=0 then null else ('d4200000-0000-4000-8000-'||lpad((b+3)::text,12,'0'))::uuid end,
 case when i%5=0 then null else (array['canje','cumpleanos','trabajador','jarra_dorada'])[1+i%4]::public.tipo_promo end,
 '[DEMO AUDITORÍA 20261004] Pedido ficticio; no representa venta, pago ni movimiento físico.',
 ((now() at time zone 'America/Santiago')::date-(i%7))::timestamp at time zone 'America/Santiago' + interval '12 hours'
from (select i,(i-1)%3+1 b from generate_series(1,42) i) fixtures;
-- Demo snapshots are not actual employee actions. Mark as historic sample evidence.
insert into public.log_cambios_pedido(pedido_id,campo,valor_anterior,valor_nuevo,tipo_evento,motivo)
select p.id,case when n%3=0 then 'descuento' else 'notas' end,
 case when n%3=0 then '0' else 'DEMO: observación original' end,
 case when n%3=0 then p.descuento::text else 'DEMO: observación corregida '||n end,
 'pedido_modificado','[DEMO AUDITORÍA 20261004] Cambio ficticio de demostración #'||n
from public.pedidos p cross join lateral generate_series(1,
 case when p.sucursal_id::text like '%000000000001' then 5 when p.sucursal_id::text like '%000000000002' then 3 else 1 end) n
where p.id::text like 'd4500000-%';
update public.log_cambios_pedido l set origen_evento='historico',
 usuario_id=p.tomador_id,actor_nombre=u.nombre_completo,sucursal_nombre=s.nombre,
 created_at=p.created_at+interval '15 minutes'
from public.pedidos p join public.usuarios u on u.id=p.tomador_id join public.sucursales s on s.id=p.sucursal_id
where l.pedido_ref=p.id and p.id::text like 'd4500000-%';
select count(*) as pedidos_demo from public.pedidos where id::text like 'd4500000-%';
commit;
