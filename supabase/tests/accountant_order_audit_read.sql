begin read only;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='superadmin' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor superadmin'; end if;
if private.can_read_order_audit() is distinct from true then raise exception 'History permission superadmin'; end if;
perform public.opciones_auditoria_pedidos();
perform public.listar_pedidos_auditoria(p_desde=>'2026-10-01',p_hasta=>'2026-10-15');
perform public.consultar_auditoria_pedidos(p_desde=>'2026-10-01',p_hasta=>'2026-10-02');
perform public.historial_completo_pedido_auditoria('00000000-0000-0000-0000-000000000000'::uuid);
r:=public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z');
if not r ? 'personas' then raise exception 'Incomplete summary superadmin'; end if;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='admin' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor admin'; end if;
if private.can_read_order_audit() is distinct from false then raise exception 'History permission admin'; end if;
begin perform public.opciones_auditoria_pedidos(); raise exception 'Options leak admin'; exception when insufficient_privilege then null; end;
begin perform public.listar_pedidos_auditoria(); raise exception 'History leak admin'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak admin'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='encargado' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor encargado'; end if;
if private.can_read_order_audit() is distinct from false then raise exception 'History permission encargado'; end if;
begin perform public.opciones_auditoria_pedidos(); raise exception 'Options leak encargado'; exception when insufficient_privilege then null; end;
begin perform public.listar_pedidos_auditoria(); raise exception 'History leak encargado'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak encargado'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='tomador_pedidos' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor tomador_pedidos'; end if;
if private.can_read_order_audit() is distinct from false then raise exception 'History permission tomador_pedidos'; end if;
begin perform public.opciones_auditoria_pedidos(); raise exception 'Options leak tomador_pedidos'; exception when insufficient_privilege then null; end;
begin perform public.listar_pedidos_auditoria(); raise exception 'History leak tomador_pedidos'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak tomador_pedidos'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='preparador' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor preparador'; end if;
if private.can_read_order_audit() is distinct from false then raise exception 'History permission preparador'; end if;
begin perform public.opciones_auditoria_pedidos(); raise exception 'Options leak preparador'; exception when insufficient_privilege then null; end;
begin perform public.listar_pedidos_auditoria(); raise exception 'History leak preparador'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak preparador'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='despachador' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor despachador'; end if;
if private.can_read_order_audit() is distinct from false then raise exception 'History permission despachador'; end if;
begin perform public.opciones_auditoria_pedidos(); raise exception 'Options leak despachador'; exception when insufficient_privilege then null; end;
begin perform public.listar_pedidos_auditoria(); raise exception 'History leak despachador'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak despachador'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='jefe_bodega' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor jefe_bodega'; end if;
if private.can_read_order_audit() is distinct from false then raise exception 'History permission jefe_bodega'; end if;
begin perform public.opciones_auditoria_pedidos(); raise exception 'Options leak jefe_bodega'; exception when insufficient_privilege then null; end;
begin perform public.listar_pedidos_auditoria(); raise exception 'History leak jefe_bodega'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak jefe_bodega'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='contador_rrhh' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor contador_rrhh'; end if;
if private.can_read_order_audit() is distinct from true then raise exception 'History permission contador_rrhh'; end if;
perform public.opciones_auditoria_pedidos();
perform public.listar_pedidos_auditoria(p_desde=>'2026-10-01',p_hasta=>'2026-10-15');
perform public.consultar_auditoria_pedidos(p_desde=>'2026-10-01',p_hasta=>'2026-10-02');
perform public.historial_completo_pedido_auditoria('00000000-0000-0000-0000-000000000000'::uuid);
r:=public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z');
if not r ? 'personas' then raise exception 'Incomplete summary contador_rrhh'; end if;
if private.has_permission('orders.update') or private.has_permission('orders.delete') or private.has_permission('users.manage') then raise exception 'Accounting gained mutation permissions'; end if;
end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='logistica' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor logistica'; end if;
if private.can_read_order_audit() is distinct from false then raise exception 'History permission logistica'; end if;
begin perform public.opciones_auditoria_pedidos(); raise exception 'Options leak logistica'; exception when insufficient_privilege then null; end;
begin perform public.listar_pedidos_auditoria(); raise exception 'History leak logistica'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak logistica'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub',(select id::text from public.usuarios where activo and rol::text='dueno_dlitro' limit 1),true);
set local role authenticated;
do $test$ declare r jsonb; begin
if auth.uid() is null then raise exception 'Missing actor dueno_dlitro'; end if;
if private.can_read_order_audit() is distinct from true then raise exception 'History permission dueno_dlitro'; end if;
perform public.opciones_auditoria_pedidos();
perform public.listar_pedidos_auditoria(p_desde=>'2026-10-01',p_hasta=>'2026-10-15');
perform public.consultar_auditoria_pedidos(p_desde=>'2026-10-01',p_hasta=>'2026-10-02');
perform public.historial_completo_pedido_auditoria('00000000-0000-0000-0000-000000000000'::uuid);
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Summary leak dueno_dlitro'; exception when insufficient_privilege then null; end;

end $test$;
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role anon;
do $test$ begin
begin perform public.listar_pedidos_auditoria(); raise exception 'Anonymous history leak'; exception when insufficient_privilege then null; end;
begin perform public.resumen_auditoria_pedidos('2026-10-01T03:00:00Z','2026-10-16T03:00:00Z'); raise exception 'Anonymous summary leak'; exception when insufficient_privilege then null; end;
end $test$;
reset role;
select 'PASS: 10 roles; accountant summary/options/list/events/full-history; no new mutation permissions; unauthorized and anonymous denied' as result;
rollback;
