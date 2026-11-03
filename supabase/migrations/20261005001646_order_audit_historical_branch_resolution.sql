-- Resolve missing legacy branch metadata only at read time. Never rewrite evidence.
-- Current order association is explicitly marked as recovered, not an event snapshot.
create function private.order_audit_branch(l public.log_cambios_pedido)
returns table(sucursal_resuelta_id uuid, sucursal_resuelta_nombre text, sucursal_recuperada boolean)
language sql stable security invoker set search_path = '' as $$
  select coalesce(l.sucursal_id,p.sucursal_id),
    coalesce(nullif(btrim(l.sucursal_nombre),''),s.nombre),
    l.sucursal_id is null and p.sucursal_id is not null
  from (values (1)) anchor(n)
  left join public.pedidos p on p.id=l.pedido_id
    and l.origen_evento='historico' and l.sucursal_id is null
  left join public.sucursales s on s.id=coalesce(l.sucursal_id,p.sucursal_id);
$$;
revoke all on function private.order_audit_branch(public.log_cambios_pedido) from public,anon,authenticated;

-- Read-only summaries for the superadmin audit dashboard; no operational writes.
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
    select l.*,b.* from public.log_cambios_pedido l
    cross join lateral private.order_audit_branch(l) b
    where l.created_at >= p_desde and l.created_at < p_hasta
      and (p_sucursal is null or b.sucursal_resuelta_id=p_sucursal)
      and coalesce(l.tipo_evento,'') <> 'pedido_creado'
      and l.origen_evento <> 'automatico'
  ), delivered as (
    -- Cohort by order creation date: no immutable delivery timestamp exists yet.
    select p.* from public.pedidos p
    where p.created_at >= p_desde and p.created_at < p_hasta and p.estado='entregado'
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
      sum(p.jarros_entregados) jarros,count(*) pedidos,
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
    select (l.created_at at time zone 'America/Santiago')::date dia,count(*) cambios
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

create or replace function public.consultar_auditoria_pedidos(
  p_sucursal uuid default null, p_actor uuid default null, p_turno uuid default null,
  p_numero integer default null, p_evento text default null,
  p_desde timestamptz default null, p_hasta timestamptz default null,
  p_pagina integer default 0, p_pedido uuid default null
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare result jsonb;
begin
  if not private.can_read_order_audit() then
    raise exception 'Sin acceso a auditoría' using errcode='42501';
  end if;
  if p_pagina is null or p_pagina < 0 or p_pagina > 1000000
     or (p_desde is not null and p_hasta is not null and p_desde >= p_hasta) then
    raise exception 'Filtros inválidos' using errcode='22023';
  end if;
  with filtered as (
    select l.*,b.* from public.log_cambios_pedido l
    cross join lateral private.order_audit_branch(l) b
    where (p_sucursal is null or b.sucursal_resuelta_id=p_sucursal)
      and (p_actor is null or l.usuario_id=p_actor)
      and (p_turno is null or l.turno_id=p_turno)
      and (p_numero is null or l.numero_pedido=p_numero)
      and (p_evento is null or l.tipo_evento=p_evento)
      and (p_pedido is null or l.pedido_ref=p_pedido)
      and (p_desde is null or l.created_at>=p_desde)
      and (p_hasta is null or l.created_at<p_hasta)
  ), page as (
    select * from filtered order by created_at desc,id desc limit 50 offset p_pagina*50
  ) select jsonb_build_object(
    'total',(select count(*) from filtered),
    'creados',(select count(distinct pedido_ref) from filtered where tipo_evento='pedido_creado'),
    'cancelados',(select count(distinct pedido_ref) from filtered where tipo_evento='pedido_cancelado'),
    'modificados',(select count(distinct pedido_ref) from filtered where tipo_evento not in ('pedido_creado','pedido_cancelado')),
    'eventos',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'cobertura_desde',(select min(created_at) from public.log_cambios_pedido where origen_evento <> 'historico')
  ) into result;
  return result;
end $$;
revoke all on function public.consultar_auditoria_pedidos(uuid,uuid,uuid,integer,text,timestamptz,timestamptz,integer,uuid) from public,anon;
grant execute on function public.consultar_auditoria_pedidos(uuid,uuid,uuid,integer,text,timestamptz,timestamptz,integer,uuid) to authenticated;
