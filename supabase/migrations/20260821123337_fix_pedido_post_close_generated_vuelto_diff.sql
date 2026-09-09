-- `vuelto` is GENERATED ALWAYS and PostgreSQL includes it in NEW's row image
-- during UPDATE. Exclude it from the post-close allow-list comparison, as the
-- existing active-order guard already does. Its source columns remain locked.

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

    if (to_jsonb(new) - array['metodo_pago','notas','updated_at','vuelto'])
       is distinct from
       (to_jsonb(old) - array['metodo_pago','notas','updated_at','vuelto']) then
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
