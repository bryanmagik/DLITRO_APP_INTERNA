-- Order-modification lifecycle rule.
--
-- Business rule (confirmed 2026-08-17): a pedido can be modified while it is
-- tomado / en_preparacion / listo. Once it enters despacho or is delivered, it
-- must not be modifiable. If a 'listo' pedido receives a valid operational
-- modification (its comanda changes), it must automatically return to
-- 'en_preparacion' so cocina reviews/prepares it again, with a visible signal
-- and an audit trail.
--
-- Two architecture decisions were confirmed with the business owner before
-- writing this migration (both driven by existing, actively used code found
-- during inspection -- not invented here):
--
--   1. admin/superadmin are exempt from the entregado/cancelado terminal lock.
--      src/pages/admin/PedidosAdminPage.tsx is the existing, admin-only
--      correction tool and explicitly edits pedidos (and pedido_items) in any
--      estado, including entregado/cancelado, to fix historical records. This
--      mirrors the existing closures.correct override already used for turnos
--      in guard_turno_update_v2 (encargado is restricted, admin is not).
--
--   2. 'en_despacho' only freezes pedido_items (the comanda). The `pedidos`
--      row itself stays editable at en_despacho for every role that already
--      has permission, because src/pages/turno/tabs/MisPedidosTab.tsx's
--      delivery flow legitimately writes to `pedidos` (jarros_entregados,
--      descuento, total, metodo_pago, despachador_id, direccion_entrega, etc.)
--      WHILE estado = 'en_despacho', as the mechanism that reconciles jarros
--      and payment before the final transition to 'entregado'. Locking
--      `pedidos` itself at en_despacho would break that live feature.
--      src/pages/turno/MapaDespachos.tsx also reassigns despachador_id while
--      already en_despacho.
--
-- 'cancelado' is treated the same as 'entregado' (fully locked except admin):
-- the existing frontend (MisPedidosTab.tsx's `pedidoCerrado` check) already
-- treats entregado and cancelado identically, and no code path found during
-- inspection edits a cancelled order.

alter table public.pedidos
  add column if not exists requiere_revision_cocina boolean not null default false;

-- Extends the existing v2 guard (only the preparador-specific column-diff logic
-- existed before). The new logic here applies to every role, not just
-- preparador -- RLS's orders.update/kitchen.update grants have no notion of
-- estado, so the terminal lock has to live in this trigger, same reasoning as
-- the rest of guard_pedido_update_v2.
create or replace function private.guard_pedido_update_v2()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare caller_role text := private.current_app_role();
begin
  if old.estado in ('entregado', 'cancelado') and caller_role not in ('admin', 'superadmin') then
    raise exception 'Pedido % ya no puede modificarse', old.estado using errcode = '42501';
  end if;

  -- Cocina confirming "listo" again is the natural acknowledgement of a
  -- post-listo modification -- auto-clear the review flag, no separate UI
  -- action needed.
  if new.estado = 'listo' and old.estado is distinct from 'listo' then
    new.requiere_revision_cocina := false;
  end if;

  if caller_role = 'preparador' then
    if (to_jsonb(new) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos','vuelto','requiere_revision_cocina'])
       is distinct from
       (to_jsonb(old) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos','vuelto','requiere_revision_cocina']) then
      raise exception 'Preparación solo puede actualizar el estado operativo del pedido'
        using errcode = '42501';
    end if;
    if new.estado not in ('en_preparacion','listo') then
      raise exception 'Estado no permitido para Preparación' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- New guard: pedido_items lifecycle. RLS (pedido_items_manage_v2) already
-- enforces permission + branch scope; this adds the estado-based business rule
-- that row policies cannot express (need to look up the PARENT pedido's
-- current estado, and cascade a state change to it).
create or replace function private.guard_pedido_items_lifecycle_v2()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  caller_role text := private.current_app_role();
  target_pedido_id uuid;
  pedido_estado public.estado_pedido;
begin
  if tg_op = 'DELETE' then
    target_pedido_id := old.pedido_id;
  else
    target_pedido_id := new.pedido_id;
  end if;

  select p.estado into pedido_estado from public.pedidos p where p.id = target_pedido_id;

  -- Comanda frozen once en_despacho/entregado/cancelado, except admin/superadmin
  -- (see decision 1/2 above).
  if pedido_estado in ('en_despacho', 'entregado', 'cancelado') and caller_role not in ('admin', 'superadmin') then
    raise exception 'La comanda ya no admite cambios (pedido %)', pedido_estado using errcode = '42501';
  end if;

  -- Operational comanda change on a 'listo' pedido: send it back to cocina.
  -- Applies regardless of role (including admin) -- if the comanda changed,
  -- cocina genuinely needs to prepare it again.
  if pedido_estado = 'listo' then
    update public.pedidos
      set estado = 'en_preparacion', requiere_revision_cocina = true
      where id = target_pedido_id;
    insert into public.log_cambios_pedido (pedido_id, usuario_id, campo, valor_anterior, valor_nuevo)
      values (target_pedido_id, (select auth.uid()), 'estado_auto_revision', 'listo', 'en_preparacion');
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end $$;

revoke all on function private.guard_pedido_items_lifecycle_v2() from public, anon, authenticated;

drop trigger if exists guard_pedido_items_lifecycle_v2 on public.pedido_items;
create trigger guard_pedido_items_lifecycle_v2
before insert or update or delete on public.pedido_items
for each row execute function private.guard_pedido_items_lifecycle_v2();
