begin;
insert into public.productos(nombre,precio,tiene_alcohol,activo)
values ('QA transitoria Mojito Frutilla S/A',10000,false,true) returning id;
select set_config('app.test.product',(select id::text from public.productos where nombre='QA transitoria Mojito Frutilla S/A' order by created_at desc limit 1),true);
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo)
values (current_setting('app.test.product')::uuid,8000,'QA transitoria activa',true),(current_setting('app.test.product')::uuid,7000,'QA transitoria inactiva',false);

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='superadmin' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor superadmin'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility superadmin: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote superadmin'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update superadmin'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete superadmin'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert superadmin';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='admin' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor admin'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility admin: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote admin'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update admin'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete admin'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert admin';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='encargado' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor encargado'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility encargado: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote encargado'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update encargado'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete encargado'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert encargado';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='tomador_pedidos' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor tomador_pedidos'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility tomador_pedidos: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote tomador_pedidos'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update tomador_pedidos'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete tomador_pedidos'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert tomador_pedidos';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='preparador' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor preparador'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility preparador: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote preparador'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update preparador'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete preparador'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert preparador';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='despachador' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor despachador'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility despachador: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote despachador'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update despachador'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete despachador'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert despachador';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='jefe_bodega' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor jefe_bodega'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility jefe_bodega: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote jefe_bodega'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update jefe_bodega'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete jefe_bodega'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert jefe_bodega';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='contador_rrhh' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor contador_rrhh'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility contador_rrhh: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote contador_rrhh'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update contador_rrhh'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete contador_rrhh'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert contador_rrhh';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='logistica' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor logistica'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility logistica: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote logistica'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update logistica'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete logistica'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert logistica';
exception when insufficient_privilege then null;
end;
end if;
end $test$;

reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo is true and rol::text='dueno_dlitro' limit 1),true);
set local role authenticated;
do $test$
declare allowed boolean; actual integer; changed integer;
begin
if auth.uid() is null then raise exception 'Missing actor dueno_dlitro'; end if;
allowed := private.has_permission('orders.create') or private.has_permission('orders.update') or private.has_permission('promotions.read') or private.has_permission('promotions.manage');
select count(*) into actual from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
if actual <> (case when allowed then 2 else 0 end) then raise exception 'Price visibility dueno_dlitro: %',actual; end if;
if allowed and not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true and precio_promo=8000) then raise exception 'Missing 8000 quote dueno_dlitro'; end if;
if not private.has_permission('promotions.manage') then
update public.promociones_precio set precio_promo=1 where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized update dueno_dlitro'; end if;
delete from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid;
get diagnostics changed = row_count;
if changed<>0 then raise exception 'Unauthorized delete dueno_dlitro'; end if;
begin
insert into public.promociones_precio(producto_id,precio_promo,nombre,activo) values(current_setting('app.test.product')::uuid,1,'FORBIDDEN',false);
raise exception 'Unauthorized insert dueno_dlitro';
exception when insufficient_privilege then null;
end;
end if;
end $test$;
reset role;
update public.promociones_precio set activo=false where producto_id=current_setting('app.test.product')::uuid and activo=true;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol='tomador_pedidos' limit 1),true);
set local role authenticated;
do $test$ begin
if not exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and precio_promo=8000 and activo=false) then raise exception 'Deactivation not readable for realtime'; end if;
if exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid and activo=true) then raise exception 'Deactivated quote still selected'; end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $test$ begin
begin
if exists(select 1 from public.promociones_precio where producto_id=current_setting('app.test.product')::uuid) then raise exception 'Anonymous exposure'; end if;
exception when insufficient_privilege then null;
end;
end $test$;
reset role;
do $test$ begin
if (select count(*) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename in ('promociones','promociones_precio'))<>2 then raise exception 'Missing realtime publication'; end if;
end $test$;
select 'PASS: 10 roles; 10000 -> 8000 quote; forbidden insert/update/delete; deactivation visibility; anon denied; realtime publication; all fixtures rolled back' as result;
rollback;
