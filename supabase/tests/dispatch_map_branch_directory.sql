begin;
insert into public.sucursales(nombre,direccion,activo,latitud,longitud,clave_canje) values
('QA map directory visible','QA map',true,-33.5,-70.7,'QA_NOT_FOR_MAP'),
('QA map directory inactive','QA map',false,-33.5,-70.7,'QA_NOT_FOR_MAP'),
('QA map directory missing','QA map',true,null,-70.7,'QA_NOT_FOR_MAP'),
('QA map directory invalid','QA map',true,91,-70.7,'QA_NOT_FOR_MAP');
select set_config('app.map.expected',(select count(*)::text from public.sucursales where activo and latitud between -90 and 90 and longitud between -180 and 180),true);
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='superadmin'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor superadmin'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory superadmin: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing superadmin'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included superadmin'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields superadmin'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory superadmin'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='admin'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor admin'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory admin: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing admin'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included admin'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields admin'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory admin'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='encargado'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor encargado'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory encargado: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing encargado'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included encargado'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields encargado'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory encargado'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='tomador_pedidos' and sucursal_id is not null limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor tomador_pedidos'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory tomador_pedidos: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing tomador_pedidos'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included tomador_pedidos'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields tomador_pedidos'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory tomador_pedidos'; exception when insufficient_privilege then null; end;
end if;
if private.has_permission('branches.read') or private.has_permission('branches.manage') then raise exception 'Branch permissions broadened'; end if;
if exists(select 1 from public.sucursales where id<>private.current_sucursal_id()) then raise exception 'Other branch full configuration exposed'; end if;
if exists(select 1 from public.pedidos where sucursal_id<>private.current_sucursal_id()) then raise exception 'Other branch orders exposed'; end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='preparador'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor preparador'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory preparador: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing preparador'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included preparador'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields preparador'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory preparador'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='despachador'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor despachador'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory despachador: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing despachador'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included despachador'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields despachador'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory despachador'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='jefe_bodega'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor jefe_bodega'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory jefe_bodega: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing jefe_bodega'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included jefe_bodega'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields jefe_bodega'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory jefe_bodega'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='contador_rrhh'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor contador_rrhh'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory contador_rrhh: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing contador_rrhh'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included contador_rrhh'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields contador_rrhh'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory contador_rrhh'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='logistica'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor logistica'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory logistica: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing logistica'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included logistica'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields logistica'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory logistica'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='dueno_dlitro'  limit 1),true);
set local role authenticated;
do $test$ declare permitted boolean; count_found integer; payload jsonb; begin
if auth.uid() is null then raise exception 'Missing test actor dueno_dlitro'; end if;
permitted := (private.has_permission('orders.create') and private.current_sucursal_id() is not null) or private.has_permission('branches.read');
if permitted then
 select count(*) into count_found from public.sucursales_mapa_despachos();
 if count_found<>current_setting('app.map.expected')::integer then raise exception 'Incomplete directory dueno_dlitro: %',count_found; end if;
 if not exists(select 1 from public.sucursales_mapa_despachos() where nombre='QA map directory visible') then raise exception 'Other branch missing dueno_dlitro'; end if;
 if exists(select 1 from public.sucursales_mapa_despachos() where nombre in ('QA map directory inactive','QA map directory missing','QA map directory invalid')) then raise exception 'Invalid branch included dueno_dlitro'; end if;
 select to_jsonb(m) into payload from public.sucursales_mapa_despachos() m limit 1;
 if (select count(*) from jsonb_object_keys(payload))<>5 or payload ? 'clave_canje' or payload ? 'telefono' then raise exception 'Excess map fields dueno_dlitro'; end if;
else
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unauthorized directory dueno_dlitro'; exception when insufficient_privilege then null; end;
end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000000',true);
set local role authenticated;
do $test$ begin
 begin perform public.sucursales_mapa_despachos(); raise exception 'Unknown user directory exposed'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $test$ begin
 begin perform public.sucursales_mapa_despachos(); raise exception 'Anonymous directory exposed'; exception when insufficient_privilege then null; end;
 begin perform private.dispatch_map_branches(); raise exception 'Anonymous private helper exposed'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
select 'PASS: ten roles; complete map directory; invalid/inactive/missing excluded; five fields only; branch secrets and cross-branch orders remain protected; unknown user and anon denied; fixtures rolled back' as result;
rollback;

