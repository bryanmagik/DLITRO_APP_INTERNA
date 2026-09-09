-- Limit the trusted correction marker to the single guarded UPDATE. This is
-- defense in depth for callers that execute more statements in one transaction.

create or replace function public.corregir_pedido_entregado(
  p_pedido_id uuid,
  p_metodo_pago public.metodo_pago,
  p_notas text,
  p_motivo text
)
returns public.pedidos
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target public.pedidos;
  result public.pedidos;
  payment_methods integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacion requerida' using errcode = '28000';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'El motivo de la correccion es obligatorio' using errcode = '22023';
  end if;

  select * into target
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado o fuera de su sucursal' using errcode = '42501';
  end if;
  if target.estado <> 'entregado' then
    raise exception 'Solo se pueden corregir pedidos entregados' using errcode = '22023';
  end if;
  if not private.has_permission('orders.update')
     or not private.can_access_sucursal(target.sucursal_id) then
    raise exception 'No tiene permiso para corregir este pedido' using errcode = '42501';
  end if;

  if p_metodo_pago is distinct from target.metodo_pago then
    select count(distinct pt.metodo) into payment_methods
    from public.pagos_turno pt
    where pt.pedido_id = target.id;
    if target.metodo_pago = 'mixto' or payment_methods > 1 then
      raise exception 'Los pagos mixtos requieren correccion administrativa detallada'
        using errcode = '22023';
    end if;
  end if;

  perform set_config('app.pedido_post_close_correction', 'on', true);
  perform set_config('app.pedido_correction_reason', btrim(p_motivo), true);

  update public.pedidos
  set metodo_pago = p_metodo_pago,
      notas = nullif(btrim(p_notas), ''),
      updated_at = now()
  where id = target.id
  returning * into result;

  perform set_config('app.pedido_post_close_correction', 'off', true);
  perform set_config('app.pedido_correction_reason', '', true);

  if p_metodo_pago is distinct from target.metodo_pago then
    update public.pagos_turno set metodo = p_metodo_pago where pedido_id = target.id;
  end if;

  return result;
end $$;

revoke all on function public.corregir_pedido_entregado(uuid, public.metodo_pago, text, text)
  from public, anon;
grant execute on function public.corregir_pedido_entregado(uuid, public.metodo_pago, text, text)
  to authenticated;
