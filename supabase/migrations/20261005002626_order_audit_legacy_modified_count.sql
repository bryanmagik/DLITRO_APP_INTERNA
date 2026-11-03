-- Include legacy change events whose event type was never recorded.
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
    'modificados',(select count(distinct pedido_ref) from filtered where coalesce(tipo_evento,'') not in ('pedido_creado','pedido_cancelado')),
    'eventos',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb),
    'cobertura_desde',(select min(created_at) from public.log_cambios_pedido where origen_evento <> 'historico')
  ) into result;
  return result;
end $$;
revoke all on function public.consultar_auditoria_pedidos(uuid,uuid,uuid,integer,text,timestamptz,timestamptz,integer,uuid) from public,anon;
grant execute on function public.consultar_auditoria_pedidos(uuid,uuid,uuid,integer,text,timestamptz,timestamptz,integer,uuid) to authenticated;
