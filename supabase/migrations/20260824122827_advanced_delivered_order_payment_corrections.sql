-- Advanced, atomic payment-composition corrections for delivered orders.
-- The existing four-argument RPC remains available as a compatibility wrapper.

create or replace function private.guard_delivered_order_payments_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pedido_id uuid := case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
  target_estado public.estado_pedido;
  correction_enabled boolean :=
    coalesce(current_setting('app.delivered_payment_correction', true), '') = 'on';
begin
  if target_pedido_id is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  select p.estado
    into target_estado
  from public.pedidos p
  where p.id = target_pedido_id;

  if target_estado = 'entregado' and not correction_enabled then
    raise exception 'Use Corregir pedido para modificar pagos de un pedido entregado'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end
$$;

drop trigger if exists trg_guard_delivered_order_payments_v1 on public.pagos_turno;
create trigger trg_guard_delivered_order_payments_v1
before insert or update or delete on public.pagos_turno
for each row execute function private.guard_delivered_order_payments_v1();

create or replace function public.corregir_pagos_pedido_entregado(
  p_pedido_id uuid,
  p_pagos jsonb,
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
  old_payments jsonb;
  new_payments jsonb;
  new_method public.metodo_pago;
  payment_count integer;
  distinct_method_count integer;
  payment_total bigint;
  invalid_amounts integer;
  invalid_methods integer;
  normalized_notes text := nullif(btrim(p_notas), '');
begin
  if (select auth.uid()) is null then
    raise exception 'Autenticacion requerida' using errcode = '28000';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'El motivo de la correccion es obligatorio' using errcode = '22023';
  end if;
  if p_pagos is null or jsonb_typeof(p_pagos) <> 'array' or jsonb_array_length(p_pagos) = 0 then
    raise exception 'Debe indicar al menos un metodo de pago' using errcode = '22023';
  end if;

  select *
    into target
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

  select count(*),
         count(distinct x.metodo),
         count(*) filter (
           where x.monto is null
              or jsonb_typeof(x.item -> 'monto') <> 'number'
              or (x.item ->> 'monto') !~ '^[0-9]+$'
              or x.monto <= 0
         ),
         count(*) filter (
           where x.metodo is null
              or x.metodo not in ('efectivo', 'transferencia', 'tarjeta', 'cortesia')
         ),
         coalesce(sum(x.monto), 0)
    into payment_count, distinct_method_count, invalid_amounts, invalid_methods, payment_total
  from (
    select item,
           item ->> 'metodo' as metodo,
           case
             when jsonb_typeof(item -> 'monto') = 'number'
              and (item ->> 'monto') ~ '^[0-9]+$'
             then (item ->> 'monto')::bigint
           end as monto
    from jsonb_array_elements(p_pagos) item
  ) x;

  if invalid_amounts > 0 then
    raise exception 'Cada monto debe ser un entero mayor que cero' using errcode = '22023';
  end if;
  if invalid_methods > 0 then
    raise exception 'Metodo de pago invalido' using errcode = '22023';
  end if;
  if distinct_method_count <> payment_count then
    raise exception 'No se permiten metodos de pago duplicados' using errcode = '22023';
  end if;
  if payment_total <> target.total::bigint then
    raise exception 'La composicion de pagos debe sumar exactamente el total del pedido'
      using errcode = '22023';
  end if;

  perform 1
  from public.pagos_turno pt
  where pt.pedido_id = target.id
  for update;

  select coalesce(
    jsonb_agg(
      jsonb_build_object('metodo', pt.metodo, 'monto', pt.monto, 'referencia', pt.referencia)
      order by pt.metodo::text
    ),
    '[]'::jsonb
  )
    into old_payments
  from public.pagos_turno pt
  where pt.pedido_id = target.id;

  select jsonb_agg(
    jsonb_build_object(
      'metodo', x.metodo,
      'monto', x.monto,
      'referencia', nullif(btrim(x.referencia), '')
    )
    order by x.metodo
  )
    into new_payments
  from (
    select item ->> 'metodo' as metodo,
           (item ->> 'monto')::integer as monto,
           item ->> 'referencia' as referencia
    from jsonb_array_elements(p_pagos) item
  ) x;

  if old_payments = new_payments and target.notas is not distinct from normalized_notes then
    raise exception 'La correccion no contiene cambios' using errcode = '22023';
  end if;

  new_method := case
    when payment_count > 1 then 'mixto'::public.metodo_pago
    else (new_payments -> 0 ->> 'metodo')::public.metodo_pago
  end;

  perform set_config('app.delivered_payment_correction', 'on', true);

  delete from public.pagos_turno
  where pedido_id = target.id;

  insert into public.pagos_turno (turno_id, pedido_id, metodo, monto, referencia)
  select target.turno_id,
         target.id,
         (item ->> 'metodo')::public.metodo_pago,
         (item ->> 'monto')::integer,
         nullif(btrim(item ->> 'referencia'), '')
  from jsonb_array_elements(new_payments) item;

  perform set_config('app.delivered_payment_correction', 'off', true);

  if new_method is distinct from target.metodo_pago
     or normalized_notes is distinct from target.notas then
    perform set_config('app.pedido_post_close_correction', 'on', true);
    perform set_config('app.pedido_correction_reason', btrim(p_motivo), true);

    update public.pedidos
       set metodo_pago = new_method,
           notas = normalized_notes,
           updated_at = now()
     where id = target.id
     returning * into result;

    perform set_config('app.pedido_post_close_correction', 'off', true);
    perform set_config('app.pedido_correction_reason', '', true);
  else
    result := target;
  end if;

  insert into public.log_cambios_pedido
    (pedido_id, sucursal_id, usuario_id, estado_pedido, campo,
     valor_anterior, valor_nuevo, motivo, tipo_evento)
  values
    (target.id, target.sucursal_id, (select auth.uid()), target.estado,
     'composicion_pago', old_payments::text, new_payments::text,
     btrim(p_motivo), 'pagos_corregidos_post_cierre');

  return result;
end
$$;

revoke all on function public.corregir_pagos_pedido_entregado(uuid, jsonb, text, text)
  from public, anon;
grant execute on function public.corregir_pagos_pedido_entregado(uuid, jsonb, text, text)
  to authenticated;

comment on function public.corregir_pagos_pedido_entregado(uuid, jsonb, text, text) is
  'Atomically replaces the complete payment composition of a delivered order after validating total, permission, branch scope and append-only audit data.';

-- Preserve the existing API contract. It now delegates simple corrections to
-- the advanced transaction, so the delivered-payment trigger cannot be bypassed.
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
  payments jsonb;
begin
  select * into target
  from public.pedidos
  where id = p_pedido_id;

  if not found then
    raise exception 'Pedido no encontrado o fuera de su sucursal' using errcode = '42501';
  end if;
  if p_metodo_pago = 'mixto' then
    raise exception 'Use la correccion avanzada para pagos mixtos' using errcode = '22023';
  end if;

  select case
    when p_metodo_pago is not distinct from target.metodo_pago then
      coalesce(
        jsonb_agg(
          jsonb_build_object('metodo', pt.metodo, 'monto', pt.monto, 'referencia', pt.referencia)
          order by pt.metodo::text
        ),
        jsonb_build_array(jsonb_build_object('metodo', p_metodo_pago, 'monto', target.total, 'referencia', null))
      )
    else
      jsonb_build_array(
        jsonb_build_object(
          'metodo', p_metodo_pago,
          'monto', target.total,
          'referencia', (
            select pt.referencia from public.pagos_turno pt
            where pt.pedido_id = target.id limit 1
          )
        )
      )
    end
    into payments
  from public.pagos_turno pt
  where pt.pedido_id = target.id;

  return public.corregir_pagos_pedido_entregado(
    p_pedido_id, payments, p_notas, p_motivo
  );
end
$$;

revoke all on function public.corregir_pedido_entregado(uuid, public.metodo_pago, text, text)
  from public, anon;
grant execute on function public.corregir_pedido_entregado(uuid, public.metodo_pago, text, text)
  to authenticated;
