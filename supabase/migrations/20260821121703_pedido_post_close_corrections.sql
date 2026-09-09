-- Controlled, append-only administrative corrections for delivered orders.
-- Only payment method and administrative notes are accepted. The RPC keeps
-- pedidos and pagos_turno consistent without changing amounts or totals.

alter table public.log_cambios_pedido
  add column if not exists sucursal_id uuid references public.sucursales(id),
  add column if not exists estado_pedido public.estado_pedido,
  add column if not exists motivo text,
  add column if not exists tipo_evento text;

create index if not exists idx_log_cambios_pedido_sucursal_fecha
  on public.log_cambios_pedido (sucursal_id, created_at desc);
create index if not exists idx_log_cambios_pedido_usuario_fecha
  on public.log_cambios_pedido (usuario_id, created_at desc);
create index if not exists idx_log_cambios_pedido_campo_fecha
  on public.log_cambios_pedido (campo, created_at desc);
create index if not exists idx_log_cambios_pedido_tipo_evento_fecha
  on public.log_cambios_pedido (tipo_evento, created_at desc);

-- Audit rows are emitted by trusted triggers only. Application users can read
-- rows in scope when their role has orders.audit.read, but cannot forge,
-- overwrite or delete history.
drop policy if exists log_cambios_pedido_write_v2 on public.log_cambios_pedido;
revoke insert, update, delete on public.log_cambios_pedido from anon, authenticated;

create or replace function private.guard_pedido_update_v2()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  caller_role text := private.current_app_role();
  correction_reason text := nullif(btrim(current_setting('app.pedido_correction_reason', true)), '');
  correction_enabled boolean := coalesce(current_setting('app.pedido_post_close_correction', true), '') = 'on';
begin
  if old.estado = 'entregado' then
    if not correction_enabled or correction_reason is null then
      raise exception 'Use Corregir pedido e indique un motivo para modificar un pedido entregado'
        using errcode = '42501';
    end if;

    if (to_jsonb(new) - array['metodo_pago','notas','updated_at'])
       is distinct from
       (to_jsonb(old) - array['metodo_pago','notas','updated_at']) then
      raise exception 'Un pedido entregado solo permite corregir forma de pago y observaciones'
        using errcode = '42501';
    end if;

    if new.estado is distinct from old.estado then
      raise exception 'Una correccion post-cierre no puede cambiar el estado del pedido'
        using errcode = '42501';
    end if;

    if new.metodo_pago is not distinct from old.metodo_pago
       and new.notas is not distinct from old.notas then
      raise exception 'La correccion no contiene cambios' using errcode = '22023';
    end if;

    if new.metodo_pago is distinct from old.metodo_pago then
      insert into public.log_cambios_pedido
        (pedido_id, sucursal_id, usuario_id, estado_pedido, campo,
         valor_anterior, valor_nuevo, motivo, tipo_evento)
      values
        (old.id, old.sucursal_id, (select auth.uid()), old.estado, 'metodo_pago',
         old.metodo_pago::text, new.metodo_pago::text, correction_reason,
         'pedido_corregido_post_cierre');
    end if;

    if new.notas is distinct from old.notas then
      insert into public.log_cambios_pedido
        (pedido_id, sucursal_id, usuario_id, estado_pedido, campo,
         valor_anterior, valor_nuevo, motivo, tipo_evento)
      values
        (old.id, old.sucursal_id, (select auth.uid()), old.estado, 'notas',
         old.notas, new.notas, correction_reason,
         'pedido_corregido_post_cierre');
    end if;

    return new;
  end if;

  if old.estado = 'cancelado' and caller_role not in ('admin', 'superadmin') then
    raise exception 'Pedido cancelado ya no puede modificarse' using errcode = '42501';
  end if;

  if new.estado = 'listo' and old.estado is distinct from 'listo' then
    new.requiere_revision_cocina := false;
  end if;

  if caller_role = 'preparador' then
    if (to_jsonb(new) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos','vuelto','requiere_revision_cocina'])
       is distinct from
       (to_jsonb(old) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos','vuelto','requiere_revision_cocina']) then
      raise exception 'Preparacion solo puede actualizar el estado operativo del pedido'
        using errcode = '42501';
    end if;
    if new.estado not in ('en_preparacion','listo') then
      raise exception 'Estado no permitido para Preparacion' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function private.guard_pedido_items_lifecycle_v2()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  caller_role text := private.current_app_role();
  target_pedido_id uuid;
  pedido_estado public.estado_pedido;
begin
  target_pedido_id := case when tg_op = 'DELETE' then old.pedido_id else new.pedido_id end;
  select p.estado into pedido_estado from public.pedidos p where p.id = target_pedido_id;

  -- Delivered comandas are immutable for every application role. Admins keep
  -- their existing override only for en_despacho/cancelado records.
  if pedido_estado = 'entregado'
     or (pedido_estado in ('en_despacho', 'cancelado') and caller_role not in ('admin', 'superadmin')) then
    raise exception 'La comanda ya no admite cambios (pedido %)', pedido_estado using errcode = '42501';
  end if;

  if pedido_estado = 'listo' then
    update public.pedidos
      set estado = 'en_preparacion', requiere_revision_cocina = true
      where id = target_pedido_id;
    insert into public.log_cambios_pedido (pedido_id, usuario_id, campo, valor_anterior, valor_nuevo)
      values (target_pedido_id, (select auth.uid()), 'estado_auto_revision', 'listo', 'en_preparacion');
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end $$;

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

  if p_metodo_pago is distinct from target.metodo_pago then
    update public.pagos_turno
    set metodo = p_metodo_pago
    where pedido_id = target.id;
  end if;

  return result;
end $$;

revoke all on function public.corregir_pedido_entregado(uuid, public.metodo_pago, text, text)
  from public, anon;
grant execute on function public.corregir_pedido_entregado(uuid, public.metodo_pago, text, text)
  to authenticated;

comment on function public.corregir_pedido_entregado(uuid, public.metodo_pago, text, text) is
  'Corrects payment method and/or administrative notes on a delivered order, atomically and with one append-only audit row per changed field.';
