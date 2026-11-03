-- Accounting may consult audit summary and history. No mutation permissions change.
CREATE OR REPLACE FUNCTION private.can_read_order_audit()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(private.current_app_role() in ('superadmin','dueno_dlitro','contador_rrhh'), false);
$function$;

CREATE OR REPLACE FUNCTION public.resumen_auditoria_pedidos(p_desde timestamp with time zone, p_hasta timestamp with time zone, p_sucursal uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
  if coalesce(private.current_app_role() not in ('superadmin','contador_rrhh'),true) then
    raise exception 'Sin acceso al resumen de auditoría' using errcode='42501';
  end if;
  if p_desde is null or p_hasta is null or p_desde >= p_hasta or p_hasta-p_desde > interval '367 days' then
    raise exception 'Selecciona un período válido de hasta un año' using errcode='22023';
  end if;
  with changes as (
    select l.*,b.*,j.* from public.log_cambios_pedido l
    cross join lateral private.order_audit_branch(l) b
    cross join lateral private.order_audit_journey(l) j
    where j.jornada >= (p_desde at time zone 'America/Santiago')::date
      and j.jornada < (p_hasta at time zone 'America/Santiago')::date
      and (p_sucursal is null or b.sucursal_resuelta_id=p_sucursal)
      and coalesce(l.tipo_evento,'') <> 'pedido_creado'
      and l.origen_evento <> 'automatico'
  ), delivered as (
    -- Current delivered state of orders belonging to the selected DLITRO journeys.
    select p.* from public.pedidos p
    left join public.turnos t on t.id=p.turno_id
    where coalesce(t.fecha_dlitro,private.audit_dlitro_day(p.created_at)) >= (p_desde at time zone 'America/Santiago')::date
      and coalesce(t.fecha_dlitro,private.audit_dlitro_day(p.created_at)) < (p_hasta at time zone 'America/Santiago')::date
      and p.estado='entregado'
      and (p_sucursal is null or p.sucursal_id=p_sucursal)
  ), actors as (
    select l.usuario_id id, coalesce(max(l.actor_nombre),max(nullif(btrim(coalesce(u.nombre_completo,concat_ws(' ',u.nombre,u.apellido))),'')),'Autor no registrado') nombre,
      count(*) cambios,count(distinct l.pedido_ref) pedidos
    from changes l left join public.usuarios u on u.id=l.usuario_id group by l.usuario_id
  ), branches as (
    select l.sucursal_resuelta_id id,coalesce(max(l.sucursal_resuelta_nombre),'Sucursal sin identificar') nombre,
      count(*) cambios,count(distinct l.pedido_ref) pedidos,
      count(*) filter(where l.sucursal_recuperada) recuperados
    from changes l group by l.sucursal_resuelta_id
  ), dispatchers as (
    select p.despachador_id id,coalesce(max(nullif(btrim(coalesce(u.nombre_completo,concat_ws(' ',u.nombre,u.apellido))),'')),'Sin despachador registrado') nombre,
      sum(p.jarros_entregados) jarros,
      sum(p.jarros_entregados / 4) promos,
      sum(p.jarros_entregados % 4) sueltos,count(*) pedidos,
      count(*) filter(where p.jarros_entregados is null) sin_dato
    from delivered p left join public.usuarios u on u.id=p.despachador_id
    where p.tipo='despacho' group by p.despachador_id
  ), promotions as (
    select p.sucursal_id id,coalesce(max(s.nombre),'Sucursal no registrada') nombre,
      count(*) entregados,
      count(*) filter(where p.promo_tipo is not null or p.cupon_id is not null or p.es_jarra_dorada or p.descuento>0) promociones,
      count(*) filter(where p.promo_tipo='canje') canjes,
      count(*) filter(where p.promo_tipo='cumpleanos') cumpleanos,
      count(*) filter(where p.promo_tipo='trabajador') trabajador,
      count(*) filter(where p.promo_tipo='jarra_dorada' or p.es_jarra_dorada) doradas,
      sum(p.descuento) filter(where p.promo_tipo is not null or p.cupon_id is not null or p.es_jarra_dorada or p.descuento>0) descuentos
    from delivered p left join public.sucursales s on s.id=p.sucursal_id group by p.sucursal_id
  ), daily as (
    select l.jornada dia,count(*) cambios
    from changes l group by 1
  ) select jsonb_build_object(
    'cambios',(select count(*) from changes),
    'pedidos_modificados',(select count(distinct pedido_ref) from changes),
    'historicos',(select count(*) from changes where origen_evento='historico'),
    'sin_autor',(select count(*) from changes where usuario_id is null),
    'sucursales_recuperadas',(select count(*) from changes where sucursal_recuperada),
    'sin_sucursal',(select count(*) from changes where sucursal_resuelta_id is null),
    'entregados',(select count(*) from delivered),
    'jarros',(select sum(jarros_entregados) from delivered where tipo='despacho'),
    'jarros_promos',(select sum(jarros_entregados / 4) from delivered where tipo='despacho'),
    'jarros_sueltos',(select sum(jarros_entregados % 4) from delivered where tipo='despacho'),
    'jarros_sin_dato',(select count(*) from delivered where tipo='despacho' and jarros_entregados is null),
    'promociones',(select coalesce(sum(promociones),0) from promotions),
    'cobertura_desde',(select min(created_at) from public.log_cambios_pedido where origen_evento <> 'historico'),
    'personas',coalesce((select jsonb_agg(to_jsonb(a) order by cambios desc,nombre,id) from actors a),'[]'),
    'sucursales',coalesce((select jsonb_agg(to_jsonb(b) order by cambios desc,nombre,id) from branches b),'[]'),
    'despachadores',coalesce((select jsonb_agg(to_jsonb(d) order by jarros desc nulls last,nombre,id) from dispatchers d),'[]'),
    'promos_sucursales',coalesce((select jsonb_agg(to_jsonb(p) order by promociones desc,nombre,id) from promotions p),'[]'),
    'dias',coalesce((select jsonb_agg(to_jsonb(d) order by dia) from daily d),'[]')
  ) into result;
  return result;
end $function$;

