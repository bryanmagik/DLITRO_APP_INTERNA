-- Server-generated evidence, preserving the existing audit table and history.
alter table public.log_cambios_pedido
  add column turno_id uuid,
  add column pedido_ref uuid,
  add column numero_pedido integer,
  add column tomador_id uuid,
  add column actor_nombre text,
  add column sucursal_nombre text,
  add column origen_evento text not null default 'historico',
  add column campos text[];

-- Historical values remain historical: do not reconstruct actors or snapshots.
update public.log_cambios_pedido set pedido_ref = pedido_id where pedido_ref is null;
alter table public.log_cambios_pedido drop constraint log_cambios_pedido_pedido_id_fkey;
alter table public.log_cambios_pedido add constraint log_cambios_pedido_pedido_id_fkey
  foreign key (pedido_id) references public.pedidos(id) on delete set null;
alter table public.log_cambios_pedido drop constraint log_cambios_pedido_usuario_id_fkey;
alter table public.log_cambios_pedido add constraint log_cambios_pedido_usuario_id_fkey
  foreign key (usuario_id) references public.usuarios(id) on delete set null;
create index idx_order_audit_ref_time on public.log_cambios_pedido(pedido_ref, created_at, id);
create index idx_order_audit_turno_time on public.log_cambios_pedido(turno_id, created_at desc, id desc);

create or replace function private.can_read_order_audit()
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_app_role() in ('superadmin','dueno_dlitro'), false);
$$;
revoke all on function private.can_read_order_audit() from public, anon;
grant execute on function private.can_read_order_audit() to authenticated;

drop policy if exists log_cambios_pedido_read_v2 on public.log_cambios_pedido;
drop policy if exists log_cambios_pedido_write_v2 on public.log_cambios_pedido;
create policy log_cambios_pedido_read_v3 on public.log_cambios_pedido for select
  to authenticated using (private.can_read_order_audit());
revoke insert, update, delete on public.log_cambios_pedido from public, anon, authenticated;

-- Existing investigative categories follow the same private access boundary.
drop policy if exists pedidos_ajustes_read_v2 on public.pedidos_despacho_ajustes;
create policy pedidos_ajustes_read_v3 on public.pedidos_despacho_ajustes for select
  to authenticated using (private.can_read_order_audit());
drop policy if exists despachos_cambios_read_v2 on public.despachos_manuales_cambios;
create policy despachos_cambios_read_v3 on public.despachos_manuales_cambios for select
  to authenticated using (private.can_read_order_audit());

-- Protect the dedicated owner role from assignment by ordinary administrators.
create function private.guard_owner_role_assignment()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if ((tg_op <> 'DELETE' and new.rol::text in ('dueno_dlitro','superadmin'))
      or (tg_op <> 'INSERT' and old.rol::text in ('dueno_dlitro','superadmin')))
     and (select auth.uid()) is not null
     and private.current_app_role() is distinct from 'superadmin' then
    raise exception 'Solo superadmin puede administrar la cuenta del dueño' using errcode = '42501';
  end if;
  return coalesce(new,old);
end $$;
revoke all on function private.guard_owner_role_assignment() from public, anon, authenticated;
create trigger guard_owner_role_assignment before insert or update or delete on public.usuarios
  for each row execute function private.guard_owner_role_assignment();

-- Enrich events written by existing trusted lifecycle/correction triggers too.
create function private.enrich_order_audit_event()
returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.pedidos;
begin
  select * into p from public.pedidos where id = new.pedido_id;
  new.pedido_ref := coalesce(new.pedido_ref, new.pedido_id);
  new.turno_id := coalesce(new.turno_id, p.turno_id);
  new.numero_pedido := coalesce(new.numero_pedido, p.numero_pedido);
  new.sucursal_id := coalesce(new.sucursal_id, p.sucursal_id);
  new.tomador_id := coalesce(new.tomador_id, p.tomador_id);
  new.estado_pedido := coalesce(new.estado_pedido, p.estado);
  new.usuario_id := (select auth.uid());
  select coalesce(nullif(u.nombre_completo,''), concat_ws(' ',u.nombre,u.apellido))
    into new.actor_nombre from public.usuarios u where u.id = new.usuario_id;
  select s.nombre into new.sucursal_nombre from public.sucursales s where s.id = new.sucursal_id;
  new.created_at := clock_timestamp();
  new.origen_evento := case when new.campo = 'estado_auto_revision' or new.usuario_id is null
    then 'automatico' else 'servidor' end;
  new.campos := coalesce(new.campos, array[new.campo]);
  return new;
end $$;
revoke all on function private.enrich_order_audit_event() from public, anon, authenticated;
create trigger enrich_order_audit_event before insert on public.log_cambios_pedido
  for each row execute function private.enrich_order_audit_event();

create function private.capture_order_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  before_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else '{}'::jsonb end;
  after_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else '{}'::jsonb end;
  previous jsonb := '{}'::jsonb; following jsonb := '{}'::jsonb;
  changed text[] := '{}'; field text; order_row public.pedidos;
  reference uuid; event_kind text; fields text[];
begin
  if tg_table_name = 'pedidos' then
    order_row := case when tg_op = 'DELETE' then old else new end;
    reference := order_row.id;
    -- Delivered corrections already have precise events from the existing guard.
    if tg_op = 'UPDATE' and old.estado = 'entregado' then return new; end if;
    fields := array['turno_id','sucursal_id','tomador_id','cliente_nombre','cliente_telefono',
      'tipo','direccion_entrega','referencia_entrega','latitud_entrega','longitud_entrega',
      'distancia_km','despachador_id','estado','subtotal','descuento','costo_despacho',
      'costo_despacho_calculado','total','metodo_pago','monto_recibido','referencia_pago',
      'promo_tipo','cupon_id','es_jarra_dorada','notas','hora_agendada','jarros_prometidos',
      'jarros_entregados','origen','estado_confirmacion','motivo_rechazo','pago_registrado',
      'pago_esperado_efectivo','pago_esperado_transferencia','pago_esperado_tarjeta'];
    -- The lifecycle guard emits estado_auto_revision once; do not duplicate it.
    if tg_op = 'UPDATE' and pg_trigger_depth() > 1 and old.estado = 'listo'
       and new.estado = 'en_preparacion' and new.requiere_revision_cocina then
      fields := array_remove(fields, 'estado');
    end if;
    event_kind := case tg_op when 'INSERT' then 'pedido_creado'
      when 'DELETE' then 'pedido_eliminado'
      else case when new.estado = 'cancelado' and old.estado <> 'cancelado'
        then 'pedido_cancelado' else 'pedido_modificado' end end;
  else
    reference := coalesce((after_row->>'pedido_id')::uuid, (before_row->>'pedido_id')::uuid);
    if reference is null then return coalesce(new,old); end if;
    select * into order_row from public.pedidos where id = reference;
    -- Parent deletion is represented by its own event, retaining historical rows.
    if not found then return coalesce(new,old); end if;
    if tg_op = 'UPDATE' and old.pedido_id is distinct from new.pedido_id then
      raise exception 'No se puede reasignar una línea o pago a otro pedido' using errcode = '22023';
    end if;
    if tg_table_name = 'pedido_items' then
      fields := array['producto_id','cantidad','precio_unitario','descuento_item','subtotal','notas'];
      event_kind := case tg_op when 'INSERT' then 'producto_agregado'
        when 'DELETE' then 'producto_retirado' else 'producto_modificado' end;
    else
      -- The controlled payment RPC emits one complete composition event.
      if coalesce(current_setting('app.delivered_payment_correction',true),'') = 'on' then
        return coalesce(new,old);
      end if;
      fields := array['metodo','monto','referencia'];
      event_kind := case tg_op when 'INSERT' then 'pago_registrado'
        when 'DELETE' then 'pago_eliminado' else 'pago_modificado' end;
    end if;
  end if;
  foreach field in array fields loop
    if (before_row->field) is distinct from (after_row->field) then
      changed := array_append(changed,field);
      -- Free customer identity/contact/location is unnecessary for this control.
      if field = any(array['cliente_nombre','cliente_telefono','direccion_entrega',
        'referencia_entrega','latitud_entrega','longitud_entrega','referencia_pago','referencia']) then
        previous := previous || jsonb_build_object(field,case when before_row ? field then '[dato reservado]' end);
        following := following || jsonb_build_object(field,case when after_row ? field then '[dato reservado]' end);
      else
        previous := previous || jsonb_build_object(field,before_row->field);
        following := following || jsonb_build_object(field,after_row->field);
      end if;
    end if;
  end loop;
  if cardinality(changed) = 0 then return coalesce(new,old); end if;
  if tg_table_name <> 'pedidos' then
    previous := previous || jsonb_build_object('linea_id',before_row->'id');
    following := following || jsonb_build_object('linea_id',after_row->'id');
  end if;
  insert into public.log_cambios_pedido
    (pedido_id,pedido_ref,sucursal_id,turno_id,numero_pedido,tomador_id,estado_pedido,
     campo,valor_anterior,valor_nuevo,tipo_evento,motivo,campos)
  values (case when tg_table_name='pedidos' and tg_op='DELETE' then null else reference end,
    reference,order_row.sucursal_id,order_row.turno_id,order_row.numero_pedido,order_row.tomador_id,
    order_row.estado,tg_table_name,case when tg_op<>'INSERT' then previous::text end,
    case when tg_op<>'DELETE' then following::text end,event_kind,
    nullif(current_setting('app.pedido_correction_reason',true),''),changed);
  return coalesce(new,old);
end $$;
revoke all on function private.capture_order_history() from public, anon, authenticated;
create trigger capture_order_history after insert or update or delete on public.pedidos
  for each row execute function private.capture_order_history();
create trigger capture_order_history after insert or update or delete on public.pedido_items
  for each row execute function private.capture_order_history();
create trigger capture_order_history after insert or update or delete on public.pagos_turno
  for each row execute function private.capture_order_history();

-- Narrowly upgrade the existing validated payment correction RPC so its own
-- server evidence does not depend on client INSERT privileges. Restore the RLS
-- cash/shift checks explicitly, in addition to its existing auth/order scope checks.
do $$
declare definition text;
begin
  definition := pg_get_functiondef('public.corregir_pagos_pedido_entregado(uuid,jsonb,text,text)'::regprocedure);
  if position('SECURITY DEFINER' in definition) = 0 then
    definition := replace(definition, 'LANGUAGE plpgsql', 'LANGUAGE plpgsql SECURITY DEFINER');
  end if;
  definition := replace(definition, 'where id = p_pedido_id' || chr(10) || '  for update;',
    'where id = p_pedido_id and private.can_access_sucursal(sucursal_id) and private.turno_in_scope(turno_id)' || chr(10) || '  for update;');
  definition := replace(definition, 'if not private.has_permission(''orders.update'')',
    'if not private.has_permission(''cash.manage'') or not private.turno_in_scope(target.turno_id) or not private.has_permission(''orders.update'')');
  if position('private.has_permission(''cash.manage'')' in definition) = 0 then
    raise exception 'Unexpected payment RPC: missing explicit cash authorization';
  end if;
  execute definition;
end $$;

create function public.puede_ver_auditoria_pedidos()
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.can_read_order_audit();
$$;
revoke all on function public.puede_ver_auditoria_pedidos() from public,anon;
grant execute on function public.puede_ver_auditoria_pedidos() to authenticated;

-- One controlled read endpoint; owner gets audit evidence, not general data access.
create function public.consultar_auditoria_pedidos(
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
    select l.* from public.log_cambios_pedido l
    where (p_sucursal is null or l.sucursal_id=p_sucursal)
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

create function public.opciones_auditoria_pedidos()
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if not private.can_read_order_audit() then raise exception 'Sin acceso a auditoría' using errcode='42501'; end if;
  return jsonb_build_object(
    'personas',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',coalesce(nullif(nombre_completo,''),concat_ws(' ',nombre,apellido))) order by nombre),'[]'::jsonb) from public.usuarios),
    'sucursales',(select coalesce(jsonb_agg(jsonb_build_object('id',id,'nombre',nombre) order by nombre),'[]'::jsonb) from public.sucursales));
end $$;
revoke all on function public.opciones_auditoria_pedidos() from public,anon;
grant execute on function public.opciones_auditoria_pedidos() to authenticated;
