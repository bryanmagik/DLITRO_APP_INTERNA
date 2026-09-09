alter table public.pedidos_despacho_ajustes
  add column if not exists motivo text,
  add column if not exists estado_pedido public.estado_pedido;

alter table public.pedidos_despacho_ajustes
  drop constraint if exists pedidos_despacho_ajustes_operacion_check;

alter table public.pedidos_despacho_ajustes
  add constraint pedidos_despacho_ajustes_operacion_check
  check (operacion in ('ajustado_al_crear', 'modificado_posteriormente', 'tarifa_calculada_restaurada'));

create or replace function public.ajustar_costo_despacho_activo(
  p_pedido_id uuid,
  p_costo_cobrado integer,
  p_motivo text,
  p_expected_updated_at timestamptz
)
returns public.pedidos
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_pedido public.pedidos%rowtype;
  v_costo_anterior integer;
  v_costo_calculado integer;
  v_nuevo_total integer;
  v_motivo text := btrim(coalesce(p_motivo, ''));
  v_operacion text;
begin
  if v_actor is null then
    raise exception 'Debes iniciar sesión para ajustar el despacho.' using errcode = '42501';
  end if;

  if not private.has_permission('orders.update') then
    raise exception 'No tienes permiso para modificar pedidos.' using errcode = '42501';
  end if;

  if p_costo_cobrado is null or p_costo_cobrado < 0 or p_costo_cobrado > 100000 then
    raise exception 'El costo cobrado debe ser un entero entre $0 y $100.000.' using errcode = '22023';
  end if;

  if char_length(v_motivo) > 500 then
    raise exception 'El motivo no puede superar 500 caracteres.' using errcode = '22023';
  end if;

  select * into v_pedido
  from public.pedidos
  where id = p_pedido_id
  for update;

  if not found then
    raise exception 'Pedido no encontrado.' using errcode = 'P0002';
  end if;

  if not private.can_access_sucursal(v_pedido.sucursal_id) then
    raise exception 'No puedes modificar pedidos de otra sucursal.' using errcode = '42501';
  end if;

  if not private.turno_is_open(v_pedido.turno_id) then
    raise exception 'El turno del pedido ya está cerrado.' using errcode = '55000';
  end if;

  if v_pedido.estado not in ('en_preparacion', 'listo', 'en_despacho') then
    raise exception 'El estado actual del pedido no permite ajustar el despacho.' using errcode = '55000';
  end if;

  if v_pedido.tipo::text not in ('despacho', 'delivery') then
    raise exception 'Sólo se puede ajustar el costo de pedidos con despacho.' using errcode = '22023';
  end if;

  if p_expected_updated_at is null or v_pedido.updated_at is distinct from p_expected_updated_at then
    raise exception 'El pedido fue modificado por otro usuario. Recarga antes de continuar.' using errcode = '40001';
  end if;

  v_costo_anterior := coalesce(v_pedido.costo_despacho, 0);
  v_costo_calculado := coalesce(v_pedido.costo_despacho_calculado, v_costo_anterior);

  if p_costo_cobrado = v_costo_anterior then
    return v_pedido;
  end if;

  if p_costo_cobrado <> v_costo_calculado and v_motivo = '' then
    raise exception 'Debes indicar el motivo del ajuste.' using errcode = '22023';
  end if;

  v_nuevo_total := greatest(0, coalesce(v_pedido.total, 0) + p_costo_cobrado - v_costo_anterior);

  if v_nuevo_total <> coalesce(v_pedido.total, 0)
     and (coalesce(v_pedido.pago_registrado, false)
       or exists (select 1 from public.pagos_turno where pedido_id = v_pedido.id and monto > 0)) then
    raise exception 'El pedido ya tiene pagos registrados. Corrige primero la composición de pago.' using errcode = '23514';
  end if;

  v_operacion := case
    when p_costo_cobrado = v_costo_calculado then 'tarifa_calculada_restaurada'
    else 'modificado_posteriormente'
  end;

  update public.pedidos
  set costo_despacho = p_costo_cobrado,
      total = v_nuevo_total,
      updated_at = now()
  where id = v_pedido.id
  returning * into v_pedido;

  insert into public.pedidos_despacho_ajustes (
    pedido_id, numero_pedido, turno_id, sucursal_id, usuario_id, operacion,
    distancia_km, costo_calculado, costo_anterior, costo_cobrado, motivo, estado_pedido
  ) values (
    v_pedido.id, v_pedido.numero_pedido, v_pedido.turno_id, v_pedido.sucursal_id,
    v_actor, v_operacion, v_pedido.distancia_km, v_costo_calculado,
    v_costo_anterior, p_costo_cobrado, nullif(v_motivo, ''), v_pedido.estado
  );

  return v_pedido;
end;
$$;

revoke all on function public.ajustar_costo_despacho_activo(uuid, integer, text, timestamptz) from public, anon;
grant execute on function public.ajustar_costo_despacho_activo(uuid, integer, text, timestamptz) to authenticated;

revoke insert, update, delete, truncate on public.pedidos_despacho_ajustes from anon, authenticated;
