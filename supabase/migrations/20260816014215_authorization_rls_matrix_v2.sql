-- DLITRO authorization matrix v2.
-- Business hierarchy is intentionally: admin > superadmin > encargado > operational roles.
-- The role name "superadmin" is retained for compatibility, but it is not the top role.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table if not exists private.role_permissions (
  role public.rol_usuario not null,
  permission text not null,
  primary key (role, permission)
);

revoke all on table private.role_permissions from public, anon, authenticated;
truncate table private.role_permissions;

-- The arrays below are the executable version of Matriz_Permisos_RLS_DLITRO.xlsx.
insert into private.role_permissions (role, permission)
select role_name::public.rol_usuario, permission
from (
  values
    ('admin', array[
      'catalog.read','catalog.manage','recipes.read','recipes.manage','promotions.read','promotions.manage',
      'orders.read','orders.update','orders.cancel','orders.audit.read','online_orders.manage','public_tracking.admin',
      'shifts.read','shifts.open','shifts.close','shifts.reopen','cash.read','cash.manage','expenses.read','expenses.manage',
      'dispatchers.read','dispatchers.assign','dispatcher_payments.read','dispatcher_payments.manage',
      'dispatcher_loans.read','dispatcher_loans.manage','manual_dispatch.manage',
      'branch_stock.read','branch_stock.manage','central_stock.read','central_stock.manage',
      'inventory.read','inventory.manage','transfers.read','transfers.manage','supplies.read','supplies.manage',
      'logistics_orders.read','logistics_orders.manage','logistics_orders.progress',
      'clients.read','clients.manage','client_addresses.read','client_addresses.manage',
      'dashboard.read','branches.read','branches.manage','users.read','users.create','users.manage',
      'delivery_rates.read','delivery_rates.manage','global_config.manage',
      'closures.read','closures.correct','attendance.read','attendance.manage','worker_prices.manage',
      'audit.read','audit.export','history.modify','product_images.read','product_images.manage'
    ]::text[]),
    ('superadmin', array[
      'catalog.read','catalog.manage','recipes.read','recipes.manage','promotions.read','promotions.manage',
      'orders.read','orders.update','orders.cancel','orders.audit.read','online_orders.manage','public_tracking.admin',
      'shifts.read','shifts.open','shifts.close','shifts.reopen','cash.read','cash.manage','expenses.read','expenses.manage',
      'dispatchers.read','dispatchers.assign','dispatcher_payments.read','dispatcher_payments.manage',
      'dispatcher_loans.read','dispatcher_loans.manage','manual_dispatch.manage',
      'branch_stock.read','branch_stock.manage','central_stock.read','central_stock.manage',
      'inventory.read','inventory.manage','transfers.read','transfers.manage','supplies.read','supplies.manage',
      'logistics_orders.read','logistics_orders.manage','logistics_orders.progress',
      'dashboard.read','branches.read','branches.manage','users.read','users.create','users.manage',
      'delivery_rates.read','delivery_rates.manage','global_config.manage',
      'closures.read','closures.correct','attendance.read','attendance.manage','worker_prices.manage',
      'audit.read','audit.export','history.modify','product_images.read','product_images.manage'
    ]::text[]),
    ('encargado', array[
      'catalog.read','orders.read','orders.update','orders.cancel','orders.audit.read',
      'shifts.read','shifts.open','shifts.close','cash.read','cash.manage','expenses.read','expenses.manage',
      'dispatchers.read','dispatchers.assign','dispatcher_payments.read','dispatcher_payments.manage',
      'dispatcher_loans.read','dispatcher_loans.manage','manual_dispatch.manage',
      'branch_stock.read','branch_stock.manage','inventory.read','inventory.manage','supplies.read',
      'logistics_orders.read','logistics_orders.manage','logistics_orders.progress',
      'dashboard.read','users.read','users.create','users.manage','closures.read','closures.annotate',
      'attendance.read','attendance.manage'
    ]::text[]),
    ('tomador_pedidos', array[
      'catalog.read','orders.read','orders.create','orders.update','orders.cancel',
      'shifts.open','shifts.close','cash.read','cash.manage','expenses.read','expenses.manage',
      'dispatchers.read','dispatchers.assign','dispatcher_payments.read','dispatcher_payments.manage',
      'dispatcher_loans.read','dispatcher_loans.manage','manual_dispatch.manage',
      'kitchen.read','kitchen.update','branch_stock.manage','inventory.read','inventory.manage'
    ]::text[]),
    ('preparador', array['catalog.read','orders.read','kitchen.read','kitchen.update']::text[]),
    ('despachador', array['catalog.read','orders.read']::text[]),
    ('jefe_bodega', array[
      'catalog.read','branch_stock.read','branch_stock.manage','central_stock.read','central_stock.manage',
      'inventory.read','inventory.manage','transfers.read','transfers.manage','supplies.read','supplies.manage',
      'logistics_orders.read','logistics_orders.manage','logistics_orders.progress'
    ]::text[]),
    ('logistica', array[
      'catalog.read','branch_stock.read','branch_stock.manage','central_stock.read','central_stock.manage',
      'inventory.read','inventory.manage','transfers.read','transfers.manage','supplies.read','supplies.manage',
      'logistics_orders.read','logistics_orders.manage','logistics_orders.progress'
    ]::text[]),
    ('contador_rrhh', array[
      'catalog.read','recipes.read','orders.read','orders.audit.read','shifts.read','cash.read','cash.manage',
      'expenses.read','expenses.manage','dispatchers.read','closures.read','closures.correct',
      'attendance.read','attendance.manage'
    ]::text[])
) as matrix(role_name, permissions)
cross join lateral unnest(matrix.permissions) as permission;

create or replace function private.current_app_role()
returns text
language sql stable security definer set search_path = ''
as $$
  select u.rol::text from public.usuarios u
  where u.id = (select auth.uid()) and u.activo is true
  limit 1
$$;

create or replace function private.current_sucursal_id()
returns uuid
language sql stable security definer set search_path = ''
as $$
  select u.sucursal_id from public.usuarios u
  where u.id = (select auth.uid()) and u.activo is true
  limit 1
$$;

create or replace function private.has_permission(required_permission text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from private.role_permissions rp
    join public.usuarios u on u.rol = rp.role
    where u.id = (select auth.uid()) and u.activo is true
      and rp.permission = required_permission
  )
$$;

create or replace function private.has_global_scope()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(private.current_app_role() in
    ('admin','superadmin','contador_rrhh','jefe_bodega','logistica'), false)
$$;

create or replace function private.can_access_sucursal(target_sucursal uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (select auth.uid()) is not null and (
    private.has_global_scope()
    or target_sucursal = private.current_sucursal_id()
  )
$$;

create or replace function private.turno_in_scope(target_turno uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.turnos t
    where t.id = target_turno and private.can_access_sucursal(t.sucursal_id)
  )
$$;

create or replace function private.turno_is_open(target_turno uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.turnos t where t.id = target_turno and t.estado = 'abierto'
  )
$$;

create or replace function private.pedido_in_scope(target_pedido uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pedidos p
    where p.id = target_pedido and private.can_access_sucursal(p.sucursal_id)
  )
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.current_sucursal_id() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.has_global_scope() to authenticated;
grant execute on function private.can_access_sucursal(uuid) to authenticated;
grant execute on function private.turno_in_scope(uuid) to authenticated;
grant execute on function private.turno_is_open(uuid) to authenticated;
grant execute on function private.pedido_in_scope(uuid) to authenticated;

-- Compatibility helper: in DLITRO v2, "admin" means the actual top role only.
create or replace function public.is_admin(_user_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select _user_id = (select auth.uid()) and private.current_app_role() = 'admin'
$$;
revoke all on function public.is_admin(uuid) from public, anon, authenticated;
grant execute on function public.is_admin(uuid) to authenticated;

-- Every exposed table is closed to anon. Authenticated receives only an outer
-- table privilege; the policies below remain the effective authorization layer.
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- Replace all previous public-table policies so permissive policies cannot
-- accidentally combine with this matrix.
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- Global catalog.
create policy categorias_read_v2 on public.categorias for select to authenticated
using (private.has_permission('catalog.read'));
create policy categorias_manage_v2 on public.categorias for all to authenticated
using (private.has_permission('catalog.manage')) with check (private.has_permission('catalog.manage'));
create policy productos_read_v2 on public.productos for select to authenticated
using (private.has_permission('catalog.read'));
create policy productos_manage_v2 on public.productos for all to authenticated
using (private.has_permission('catalog.manage')) with check (private.has_permission('catalog.manage'));
create policy sabores_extra_read_v2 on public.sabores_extra for select to authenticated
using (private.has_permission('catalog.read'));
create policy sabores_extra_manage_v2 on public.sabores_extra for all to authenticated
using (private.has_permission('catalog.manage')) with check (private.has_permission('catalog.manage'));

create policy recetas_read_v2 on public.recetas for select to authenticated
using (private.has_permission('recipes.read'));
create policy recetas_manage_v2 on public.recetas for all to authenticated
using (private.has_permission('recipes.manage')) with check (private.has_permission('recipes.manage'));
create policy historial_precios_read_v2 on public.historial_precios for select to authenticated
using (private.has_permission('recipes.read') or private.has_permission('audit.read'));
create policy historial_precios_manage_v2 on public.historial_precios for all to authenticated
using (private.has_permission('history.modify')) with check (private.has_permission('history.modify'));

create policy promociones_read_v2 on public.promociones for select to authenticated
using (private.has_permission('promotions.read'));
create policy promociones_manage_v2 on public.promociones for all to authenticated
using (private.has_permission('promotions.manage')) with check (private.has_permission('promotions.manage'));
create policy promociones_precio_read_v2 on public.promociones_precio for select to authenticated
using (private.has_permission('promotions.read'));
create policy promociones_precio_manage_v2 on public.promociones_precio for all to authenticated
using (private.has_permission('promotions.manage')) with check (private.has_permission('promotions.manage'));
create policy cupones_read_v2 on public.cupones for select to authenticated
using (private.has_permission('promotions.read'));
create policy cupones_manage_v2 on public.cupones for all to authenticated
using (private.has_permission('promotions.manage')) with check (private.has_permission('promotions.manage'));

-- Customer directory is deliberately admin-only. Order-specific customer data
-- remains visible to preparation/dispatch through public.pedidos in their branch.
create policy clientes_admin_only_v2 on public.clientes for all to authenticated
using (private.has_permission('clients.read')) with check (private.has_permission('clients.manage'));
create policy direcciones_admin_only_v2 on public.direcciones_cliente for all to authenticated
using (private.has_permission('client_addresses.read')) with check (private.has_permission('client_addresses.manage'));

-- Branches and users.
create policy sucursales_read_v2 on public.sucursales for select to authenticated
using (private.has_permission('branches.read') or id = private.current_sucursal_id());
create policy sucursales_manage_v2 on public.sucursales for all to authenticated
using (private.has_permission('branches.manage')) with check (private.has_permission('branches.manage'));

create policy usuarios_read_v2 on public.usuarios for select to authenticated
using (
  id = (select auth.uid())
  or (private.has_permission('users.read') and (
    private.current_app_role() in ('admin','superadmin')
    or sucursal_id = private.current_sucursal_id()
  ))
);
create policy usuarios_insert_v2 on public.usuarios for insert to authenticated
with check (
  private.has_permission('users.create') and (
    private.current_app_role() in ('admin','superadmin')
    or (
      private.current_app_role() = 'encargado'
      and sucursal_id = private.current_sucursal_id()
      and rol in ('tomador_pedidos','preparador','despachador')
    )
  )
);
create policy usuarios_update_v2 on public.usuarios for update to authenticated
using (
  private.has_permission('users.manage') and (
    private.current_app_role() in ('admin','superadmin')
    or (private.current_app_role() = 'encargado' and sucursal_id = private.current_sucursal_id()
        and rol in ('tomador_pedidos','preparador','despachador'))
  )
)
with check (
  private.has_permission('users.manage') and (
    private.current_app_role() in ('admin','superadmin')
    or (private.current_app_role() = 'encargado' and sucursal_id = private.current_sucursal_id()
        and rol in ('tomador_pedidos','preparador','despachador'))
  )
);
create policy usuarios_delete_v2 on public.usuarios for delete to authenticated
using (
  private.has_permission('users.manage') and (
    private.current_app_role() in ('admin','superadmin')
    or (private.current_app_role() = 'encargado' and sucursal_id = private.current_sucursal_id()
        and rol in ('tomador_pedidos','preparador','despachador'))
  )
);

-- Orders. Preparers and dispatchers can see complete order rows only in their
-- own branch; this does not grant access to the customer directory.
create policy pedidos_read_v2 on public.pedidos for select to authenticated
using (private.has_permission('orders.read') and private.can_access_sucursal(sucursal_id));
create policy pedidos_insert_v2 on public.pedidos for insert to authenticated
with check (
  private.has_permission('orders.create')
  and sucursal_id = private.current_sucursal_id()
  and tomador_id = (select auth.uid())
  and private.turno_is_open(turno_id)
);
create policy pedidos_update_v2 on public.pedidos for update to authenticated
using (
  (private.has_permission('orders.update') or private.has_permission('kitchen.update'))
  and private.can_access_sucursal(sucursal_id)
  and private.turno_is_open(turno_id)
)
with check (
  (private.has_permission('orders.update') or private.has_permission('kitchen.update'))
  and private.can_access_sucursal(sucursal_id)
  and private.turno_is_open(turno_id)
);
create policy pedidos_delete_v2 on public.pedidos for delete to authenticated
using (
  private.has_permission('orders.cancel')
  and private.can_access_sucursal(sucursal_id)
  and private.turno_is_open(turno_id)
);
create policy pedido_items_read_v2 on public.pedido_items for select to authenticated
using (private.has_permission('orders.read') and private.pedido_in_scope(pedido_id));
create policy pedido_items_manage_v2 on public.pedido_items for all to authenticated
using (
  (private.has_permission('orders.create') or private.has_permission('orders.update'))
  and private.pedido_in_scope(pedido_id)
)
with check (
  (private.has_permission('orders.create') or private.has_permission('orders.update'))
  and private.pedido_in_scope(pedido_id)
);

create policy log_cambios_pedido_read_v2 on public.log_cambios_pedido for select to authenticated
using (private.has_permission('orders.audit.read') and private.pedido_in_scope(pedido_id));
create policy log_cambios_pedido_write_v2 on public.log_cambios_pedido for insert to authenticated
with check (private.pedido_in_scope(pedido_id) and usuario_id = (select auth.uid()));
create policy pedidos_ajustes_read_v2 on public.pedidos_despacho_ajustes for select to authenticated
using (private.has_permission('orders.audit.read') and private.can_access_sucursal(sucursal_id));

-- Turnos, cash and closures. A tomador gets the supporting read needed by
-- PostgreSQL for UPDATE, but only for own-branch turns.
create policy turnos_read_v2 on public.turnos for select to authenticated
using (
  (private.has_permission('shifts.read') or private.has_permission('shifts.open') or private.has_permission('shifts.close'))
  and private.can_access_sucursal(sucursal_id)
);
create policy turnos_insert_v2 on public.turnos for insert to authenticated
with check (
  private.has_permission('shifts.open') and private.can_access_sucursal(sucursal_id)
  and (private.has_global_scope() or tomador_id = (select auth.uid()))
);
create policy turnos_update_v2 on public.turnos for update to authenticated
using (
  (private.has_permission('shifts.close') or private.has_permission('shifts.reopen')
   or private.has_permission('closures.annotate') or private.has_permission('closures.correct'))
  and private.can_access_sucursal(sucursal_id)
)
with check (
  (private.has_permission('shifts.close') or private.has_permission('shifts.reopen')
   or private.has_permission('closures.annotate') or private.has_permission('closures.correct'))
  and private.can_access_sucursal(sucursal_id)
);
create policy turnos_delete_v2 on public.turnos for delete to authenticated
using (private.current_app_role() = 'admin');

create policy pagos_turno_read_v2 on public.pagos_turno for select to authenticated
using (private.has_permission('cash.read') and private.turno_in_scope(turno_id));
create policy pagos_turno_manage_v2 on public.pagos_turno for all to authenticated
using (private.has_permission('cash.manage') and private.turno_in_scope(turno_id))
with check (private.has_permission('cash.manage') and private.turno_in_scope(turno_id));
create policy gastos_turno_read_v2 on public.gastos_turno for select to authenticated
using (private.has_permission('expenses.read') and private.turno_in_scope(turno_id));
create policy gastos_turno_manage_v2 on public.gastos_turno for all to authenticated
using (private.has_permission('expenses.manage') and private.turno_in_scope(turno_id))
with check (private.has_permission('expenses.manage') and private.turno_in_scope(turno_id));
create policy cambios_turno_read_v2 on public.cambios_turno for select to authenticated
using (private.has_permission('closures.read') and private.turno_in_scope(turno_id));
create policy cambios_turno_write_v2 on public.cambios_turno for insert to authenticated
with check (private.has_permission('closures.annotate') and private.turno_in_scope(turno_id));

-- Dispatch operations are scoped through their turn.
create policy turno_despachadores_read_v2 on public.turno_despachadores for select to authenticated
using (private.has_permission('dispatchers.read') and private.turno_in_scope(turno_id));
create policy turno_despachadores_manage_v2 on public.turno_despachadores for all to authenticated
using (private.has_permission('dispatchers.assign') and private.turno_in_scope(turno_id))
with check (private.has_permission('dispatchers.assign') and private.turno_in_scope(turno_id));
create policy pago_despachadores_read_v2 on public.pago_despachadores for select to authenticated
using (private.has_permission('dispatcher_payments.read') and private.turno_in_scope(turno_id));
create policy pago_despachadores_manage_v2 on public.pago_despachadores for all to authenticated
using (private.has_permission('dispatcher_payments.manage') and private.turno_in_scope(turno_id))
with check (private.has_permission('dispatcher_payments.manage') and private.turno_in_scope(turno_id));
create policy prestamos_read_v2 on public.prestamos_despachador for select to authenticated
using (private.has_permission('dispatcher_loans.read') and private.turno_in_scope(turno_id));
create policy prestamos_manage_v2 on public.prestamos_despachador for all to authenticated
using (private.has_permission('dispatcher_loans.manage') and private.turno_in_scope(turno_id))
with check (private.has_permission('dispatcher_loans.manage') and private.turno_in_scope(turno_id));
create policy despachos_manuales_manage_v2 on public.despachos_manuales for all to authenticated
using (private.has_permission('manual_dispatch.manage') and private.turno_in_scope(turno_id))
with check (private.has_permission('manual_dispatch.manage') and private.turno_in_scope(turno_id));
create policy despachos_cambios_read_v2 on public.despachos_manuales_cambios for select to authenticated
using (private.has_permission('audit.read') or
      (private.has_permission('manual_dispatch.manage') and private.turno_in_scope(turno_id)));

-- Inventory and logistics.
create policy insumos_read_v2 on public.insumos for select to authenticated
using (private.has_permission('supplies.read'));
create policy insumos_manage_v2 on public.insumos for all to authenticated
using (private.has_permission('supplies.manage')) with check (private.has_permission('supplies.manage'));
create policy stock_sucursal_read_v2 on public.stock_sucursal for select to authenticated
using (private.has_permission('branch_stock.read') and private.can_access_sucursal(sucursal_id));
create policy stock_sucursal_manage_v2 on public.stock_sucursal for all to authenticated
using (private.has_permission('branch_stock.manage') and private.can_access_sucursal(sucursal_id))
with check (private.has_permission('branch_stock.manage') and private.can_access_sucursal(sucursal_id));
create policy stock_central_read_v2 on public.stock_bodega_central for select to authenticated
using (private.has_permission('central_stock.read'));
create policy stock_central_manage_v2 on public.stock_bodega_central for all to authenticated
using (private.has_permission('central_stock.manage')) with check (private.has_permission('central_stock.manage'));
create policy stock_movimientos_read_v2 on public.stock_movimientos for select to authenticated
using (
  (es_bodega and private.has_permission('central_stock.read'))
  or (not es_bodega and private.has_permission('branch_stock.read') and private.can_access_sucursal(sucursal_id))
);
create policy stock_movimientos_insert_v2 on public.stock_movimientos for insert to authenticated
with check (
  (es_bodega and private.has_permission('central_stock.manage'))
  or (not es_bodega and private.has_permission('branch_stock.manage') and private.can_access_sucursal(sucursal_id))
);

create policy inventarios_read_v2 on public.inventarios_parciales for select to authenticated
using (private.has_permission('inventory.read') and private.can_access_sucursal(sucursal_id));
create policy inventarios_manage_v2 on public.inventarios_parciales for all to authenticated
using (private.has_permission('inventory.manage') and private.can_access_sucursal(sucursal_id))
with check (private.has_permission('inventory.manage') and private.can_access_sucursal(sucursal_id));
create policy inventario_items_read_v2 on public.inventarios_parciales_items for select to authenticated
using (exists (select 1 from public.inventarios_parciales i where i.id = inventario_id));
create policy inventario_items_manage_v2 on public.inventarios_parciales_items for all to authenticated
using (exists (select 1 from public.inventarios_parciales i where i.id = inventario_id))
with check (exists (select 1 from public.inventarios_parciales i where i.id = inventario_id));
create policy inventario_cierre_read_v2 on public.inventario_cierre for select to authenticated
using (private.has_permission('inventory.read') and private.turno_in_scope(turno_id));
create policy inventario_cierre_manage_v2 on public.inventario_cierre for all to authenticated
using (private.has_permission('inventory.manage') and private.turno_in_scope(turno_id))
with check (private.has_permission('inventory.manage') and private.turno_in_scope(turno_id));

create policy transferencias_read_v2 on public.transferencias_stock for select to authenticated
using (private.has_permission('transfers.read'));
create policy transferencias_manage_v2 on public.transferencias_stock for all to authenticated
using (private.has_permission('transfers.manage')) with check (private.has_permission('transfers.manage'));
create policy transferencia_items_read_v2 on public.transferencia_items for select to authenticated
using (private.has_permission('transfers.read'));
create policy transferencia_items_manage_v2 on public.transferencia_items for all to authenticated
using (private.has_permission('transfers.manage')) with check (private.has_permission('transfers.manage'));

create policy pedidos_logistica_read_v2 on public.pedidos_logistica for select to authenticated
using (private.has_permission('logistics_orders.read') and private.can_access_sucursal(sucursal_id));
create policy pedidos_logistica_manage_v2 on public.pedidos_logistica for all to authenticated
using (private.has_permission('logistics_orders.manage') and private.can_access_sucursal(sucursal_id))
with check (private.has_permission('logistics_orders.manage') and private.can_access_sucursal(sucursal_id));
create policy pedidos_logistica_items_read_v2 on public.pedidos_logistica_items for select to authenticated
using (exists (select 1 from public.pedidos_logistica p where p.id = pedido_id));
create policy pedidos_logistica_items_manage_v2 on public.pedidos_logistica_items for all to authenticated
using (exists (select 1 from public.pedidos_logistica p where p.id = pedido_id))
with check (exists (select 1 from public.pedidos_logistica p where p.id = pedido_id));

-- Accounting, HR and configuration.
create policy asistencia_read_v2 on public.asistencia for select to authenticated
using (private.has_permission('attendance.read') and private.can_access_sucursal(sucursal_id));
create policy asistencia_manage_v2 on public.asistencia for all to authenticated
using (private.has_permission('attendance.manage') and private.can_access_sucursal(sucursal_id))
with check (private.has_permission('attendance.manage') and private.can_access_sucursal(sucursal_id));
create policy precios_trabajador_read_v2 on public.precios_trabajador for select to authenticated
using (private.has_permission('worker_prices.manage'));
create policy precios_trabajador_manage_v2 on public.precios_trabajador for all to authenticated
using (private.has_permission('worker_prices.manage')) with check (private.has_permission('worker_prices.manage'));
create policy tarifas_despacho_read_v2 on public.tarifas_despacho for select to authenticated
using (private.has_permission('delivery_rates.read'));
create policy tarifas_despacho_manage_v2 on public.tarifas_despacho for all to authenticated
using (private.has_permission('delivery_rates.manage')) with check (private.has_permission('delivery_rates.manage'));
create policy tarifas_despachador_read_v2 on public.tarifas_despachador for select to authenticated
using (private.has_permission('delivery_rates.read'));
create policy tarifas_despachador_manage_v2 on public.tarifas_despachador for all to authenticated
using (private.has_permission('delivery_rates.manage')) with check (private.has_permission('delivery_rates.manage'));
create policy configuracion_read_v2 on public.configuracion_sucursal for select to authenticated
using (private.has_permission('global_config.manage') or sucursal_id = private.current_sucursal_id());
create policy configuracion_manage_v2 on public.configuracion_sucursal for all to authenticated
using (private.has_permission('global_config.manage')) with check (private.has_permission('global_config.manage'));

-- Column-change guards close gaps that row policies cannot express.
create or replace function private.guard_pedido_update_v2()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare caller_role text := private.current_app_role();
begin
  if caller_role = 'preparador' then
    if (to_jsonb(new) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos'])
       is distinct from
       (to_jsonb(old) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos']) then
      raise exception 'Preparación solo puede actualizar el estado operativo del pedido'
        using errcode = '42501';
    end if;
    if new.estado not in ('en_preparacion','listo') then
      raise exception 'Estado no permitido para Preparación' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create or replace function private.guard_turno_update_v2()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare caller_role text := private.current_app_role();
begin
  if caller_role = 'encargado' and old.estado = 'cerrado' then
    if (to_jsonb(new) - array['observacion_descuadre'])
       is distinct from (to_jsonb(old) - array['observacion_descuadre']) then
      raise exception 'El encargado puede anotar un cierre, pero no corregirlo ni reabrirlo'
        using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

revoke all on function private.guard_pedido_update_v2() from public, anon, authenticated;
revoke all on function private.guard_turno_update_v2() from public, anon, authenticated;

drop trigger if exists guard_pedido_update_v2 on public.pedidos;
create trigger guard_pedido_update_v2 before update on public.pedidos
for each row execute function private.guard_pedido_update_v2();

drop trigger if exists guard_turno_update_v2 on public.turnos;
create trigger guard_turno_update_v2 before update on public.turnos
for each row execute function private.guard_turno_update_v2();

-- Storage: product images remain publicly readable for the customer application,
-- while only admin and superadmin can upload, replace or delete.
drop policy if exists "Public read productos images" on storage.objects;
drop policy if exists "Authenticated upload productos images" on storage.objects;
drop policy if exists "Authenticated update productos images" on storage.objects;
drop policy if exists "Authenticated delete productos images" on storage.objects;
drop policy if exists product_images_public_read_v2 on storage.objects;
drop policy if exists product_images_insert_v2 on storage.objects;
drop policy if exists product_images_update_v2 on storage.objects;
drop policy if exists product_images_delete_v2 on storage.objects;

create policy product_images_public_read_v2 on storage.objects for select to anon, authenticated
using (bucket_id = 'productos');
create policy product_images_insert_v2 on storage.objects for insert to authenticated
with check (bucket_id = 'productos' and private.has_permission('product_images.manage'));
create policy product_images_update_v2 on storage.objects for update to authenticated
using (bucket_id = 'productos' and private.has_permission('product_images.manage'))
with check (bucket_id = 'productos' and private.has_permission('product_images.manage'));
create policy product_images_delete_v2 on storage.objects for delete to authenticated
using (bucket_id = 'productos' and private.has_permission('product_images.manage'));

-- Fail the migration atomically if a critical business invariant was lost.
do $$
begin
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ) then
    raise exception 'RLS v2 invariant failed: a public table has RLS disabled';
  end if;

  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
  ) then
    raise exception 'RLS v2 invariant failed: a public table has no policy';
  end if;

  if not exists (
    select 1 from private.role_permissions
    where role = 'admin' and permission = 'clients.read'
  ) or exists (
    select 1 from private.role_permissions
    where role = 'superadmin' and permission in ('clients.read','clients.manage')
  ) then
    raise exception 'RLS v2 invariant failed: customer directory is not admin-only';
  end if;

  if not exists (
    select 1 from private.role_permissions
    where role in ('jefe_bodega','logistica') and permission = 'central_stock.read'
    group by permission having count(*) = 2
  ) then
    raise exception 'RLS v2 invariant failed: central stock read roles incomplete';
  end if;
end $$;
