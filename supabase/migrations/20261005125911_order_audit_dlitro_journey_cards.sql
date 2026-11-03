-- Read-only audit grouping. No changes to orders, shifts, money or audit evidence.
create function private.audit_dlitro_day(moment timestamptz)
returns date language sql immutable security invoker set search_path = '' as $$
  select ((moment at time zone 'America/Santiago') - interval '6 hours')::date;
$$;
revoke all on function private.audit_dlitro_day(timestamptz) from public,anon,authenticated;

create function private.order_audit_journey(event public.log_cambios_pedido)
returns table(jornada date, jornada_origen text, turno_resuelto uuid, numero_resuelto integer)
language sql stable security invoker set search_path = '' as $$
  select coalesce(t.fecha_dlitro,private.audit_dlitro_day(event.created_at)),
    case when t.fecha_dlitro is null then 'hora_evento'
      when event.turno_id is not null then 'turno_registrado' else 'turno_actual' end,
    coalesce(event.turno_id,p.turno_id),coalesce(event.numero_pedido,p.numero_pedido)
  from (select 1) base
  left join public.pedidos p on p.id=coalesce(event.pedido_id,event.pedido_ref)
  left join public.turnos t on t.id=coalesce(event.turno_id,p.turno_id);
$$;
revoke all on function private.order_audit_journey(public.log_cambios_pedido) from public,anon,authenticated;

-- Date parameters identify inclusive DLITRO journeys; pagination is by cards,
-- never by events. Full per-order evidence remains in consultar_auditoria_pedidos.
create function public.listar_pedidos_auditoria(
  p_sucursal uuid default null,p_actor uuid default null,p_turno uuid default null,
  p_numero integer default null,p_evento text default null,
  p_desde date default null,p_hasta date default null,p_pagina integer default 0
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_read_order_audit() then
    raise exception 'Sin acceso a auditoría' using errcode='42501';
  end if;
  if p_pagina is null or p_pagina<0 or p_pagina>1000000
    or (p_desde is not null and p_hasta is not null and p_desde>p_hasta)
    or (p_numero is not null and p_numero<1) then
    raise exception 'Filtros inválidos' using errcode='22023';
  end if;
  with filtered as (
    select l.*,b.*,j.* from public.log_cambios_pedido l
    cross join lateral private.order_audit_branch(l) b
    cross join lateral private.order_audit_journey(l) j
    where (p_sucursal is null or b.sucursal_resuelta_id=p_sucursal)
      and (p_actor is null or l.usuario_id=p_actor)
      and (p_turno is null or j.turno_resuelto=p_turno)
      and (p_numero is null or j.numero_resuelto=p_numero)
      and (p_evento is null or l.tipo_evento=p_evento)
      and (p_desde is null or j.jornada>=p_desde)
      and (p_hasta is null or j.jornada<=p_hasta)
  ), cards as (
    select coalesce(pedido_ref,pedido_id,id) tarjeta_id,jornada,
      coalesce(pedido_ref,pedido_id) pedido_ref,max(numero_resuelto) numero_pedido,
      max(created_at) ultimo_movimiento,count(*) eventos_coincidentes,
      bool_or(jornada_origen='turno_actual') jornada_recuperada,
      bool_or(jornada_origen='hora_evento') jornada_estimada,
      string_agg(distinct coalesce(sucursal_resuelta_nombre,'Sucursal sin identificar'),' · ') sucursal_nombre
    from filtered group by coalesce(pedido_ref,pedido_id,id),jornada,coalesce(pedido_ref,pedido_id)
  ), page as (
    select * from cards order by jornada desc nulls last,ultimo_movimiento desc,tarjeta_id
    limit 50 offset p_pagina*50
  ) select jsonb_build_object(
    'total',(select count(*) from filtered),'total_pedidos',(select count(*) from cards),
    'creados',(select count(distinct pedido_ref) from filtered where tipo_evento='pedido_creado'),
    'cancelados',(select count(distinct pedido_ref) from filtered where tipo_evento='pedido_cancelado'),
    'modificados',(select count(distinct pedido_ref) from filtered where coalesce(tipo_evento,'') not in ('pedido_creado','pedido_cancelado')),
    'pedidos',coalesce((select jsonb_agg(to_jsonb(page) order by jornada desc nulls last,ultimo_movimiento desc,tarjeta_id) from page),'[]'::jsonb),
    'cobertura_desde',(select min(created_at) from public.log_cambios_pedido where origen_evento<>'historico')
  ) into result;
  return result;
end $$;
revoke all on function public.listar_pedidos_auditoria(uuid,uuid,uuid,integer,text,date,date,integer) from public,anon;
grant execute on function public.listar_pedidos_auditoria(uuid,uuid,uuid,integer,text,date,date,integer) to authenticated;

-- Reuse the existing authorized history query within one stable snapshot. This
-- avoids gaps from concurrent inserts between separate browser page requests.
create function public.historial_completo_pedido_auditoria(p_pedido uuid)
returns jsonb language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb; events jsonb; next_page jsonb; page integer;
begin
  if p_pedido is null then
    raise exception 'Selecciona un pedido' using errcode='22023';
  end if;
  result:=public.consultar_auditoria_pedidos(p_pedido=>p_pedido,p_pagina=>0);
  events:=result->'eventos';
  if (result->>'total')::bigint>50 then
    for page in 1..(((result->>'total')::bigint-1)/50)::integer loop
      next_page:=public.consultar_auditoria_pedidos(p_pedido=>p_pedido,p_pagina=>page);
      events:=events || (next_page->'eventos');
    end loop;
  end if;
  return jsonb_set(result,'{eventos}',events);
end $$;
revoke all on function public.historial_completo_pedido_auditoria(uuid) from public,anon;
grant execute on function public.historial_completo_pedido_auditoria(uuid) to authenticated;

-- Existing summary API retains its signature. Midnight bounds select journey
-- dates in Chile (exclusive upper date), rather than event calendar timestamps.
create or replace function public.resumen_auditoria_pedidos(
  p_desde timestamptz, p_hasta timestamptz, p_sucursal uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if private.current_app_role() is distinct from 'superadmin' then
    raise exception 'Resumen reservado a superadmin' using errcode='42501';
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
end $$;
revoke all on function public.resumen_auditoria_pedidos(timestamptz,timestamptz,uuid) from public,anon;
grant execute on function public.resumen_auditoria_pedidos(timestamptz,timestamptz,uuid) to authenticated;
