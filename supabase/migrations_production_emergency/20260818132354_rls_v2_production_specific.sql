-- RLS v2 — PRODUCTION-SPECIFIC migration.
--
-- Target: production project ref uwymxjmyasnlmkitzvej ("main" / "DLITRO ULTIMATE").
-- This file is intentionally OUTSIDE supabase/migrations/ and must never be applied to
-- staging-security (suscxwjloggmbsqdlgpj) — that project already has this model live,
-- reached via a different migration lineage (20260816014215_authorization_rls_matrix_v2.sql
-- + 20260818125656_authorization_rls_matrix_v2_business_hierarchy_fix.sql). Do not move or
-- copy this file into supabase/migrations/, and do not run `supabase db push` with it.
--
-- Functional source of truth: the END STATE of private.role_permissions on
-- staging-security after the business hierarchy fix (see
-- supabase/tests/PERMISSIONS_MATRIX.md). This migration reaches that same end
-- state in one step — it does not replay staging's two-migration history,
-- because production's starting schema/policy/grant state is materially
-- different (see the precheck evidence below and the P1/P0-A/P0-B audits).
--
-- Precheck evidence (read-only queries against production, same session):
--   - Exactly 39 public tables + 2 views (v_stock_bajo_minimo, v_ventas_dia) exist,
--     an EXACT match for the table set staging's v2 migration covers. No schema
--     drift: this migration does not need to create or drop any table.
--   - 11 tables have RLS enabled with legacy (non-"_v2") policies; 20 tables have
--     RLS disabled entirely (policies present on some of them are already inert);
--     `clientes` and `direcciones_cliente` have RLS enabled with zero policies
--     (correct deny-by-default from P0-A, left as-is by this migration's dynamic
--     drop since there is nothing to drop there).
--   - anon holds only REFERENCES/TRIGGER on every table (P0-A + P0-B). authenticated
--     holds SELECT/INSERT/UPDATE/DELETE (+TRUNCATE on tables P0-B did not touch) on
--     every table. This migration does not reopen anon and removes the remaining
--     dead-weight TRUNCATE grant from authenticated (PostgREST never emits TRUNCATE).
--   - schema `private` already exists in production, holding 4 unrelated functions
--     (auditar_despacho_manual, calcular_y_auditar_costo_despacho,
--     preparar_despacho_manual, registrar_ajuste_costo_despacho) from the
--     20260810152110_secure_despachos_manuales_audit migration. No name collision
--     with the 8 functions this migration adds. Their EXECUTE grants (postgres only)
--     are untouched — this migration only touches EXECUTE on the functions it creates.
--   - public.is_admin(uuid) already means `rol IN ('admin','superadmin')` — the
--     historical semantics Fase 8 asks to preserve. It is NOT redefined here (see
--     "is_admin" section below for the dependency check that justifies leaving it
--     untouched). public.is_superadmin/get_user_rol/get_user_sucursal are untouched.
--   - storage.objects has 4 legacy "bridge" policies on bucket 'productos'
--     ("Public read productos images", "Authenticated {upload,update,delete}
--     productos images") that let ANY authenticated session write product images,
--     not just admin/superadmin. Replaced below with the same product_images_*_v2
--     policies validated on staging.
--   - public.get_turno_abierto(uuid) is SECURITY DEFINER, granted to anon AND to
--     PUBLIC (confirmed live: grantees are PUBLIC, anon, authenticated, postgres,
--     service_role), and returns the open turno id for any sucursal_id with no
--     further check. Revoking only from anon is not sufficient — anon inherits
--     whatever PUBLIC holds, so PUBLIC must be revoked too (found during production-
--     clone validation of this migration; see supabase/tests/results/
--     production_migration_validation/04_migration_result.md). A repo
--     grep found zero callers in src/ or supabase/functions/ (only an auto-generated
--     types.ts reference) — dead code with an unnecessary anon-facing surface.
--     Closed below (EXECUTE revoked from anon only; the function itself is not
--     dropped, since removing dead code is out of this migration's authorized scope).
--   - Triggers on despachos_manuales/inventario_cierre/pedidos/pedidos_logistica/
--     prestamos_despachador/productos/turnos belong to business logic unrelated to
--     RLS v2 (stock, pricing history, despacho-manual audit, dlitro-day). None of
--     their functions reference is_admin()/is_superadmin() or any object this
--     migration touches. They are not modified and continue to fire normally —
--     RLS does not affect trigger execution once a row mutation is already
--     authorized.
--
-- Explicitly NOT included in this migration (see FASE 12 decision in the audit
-- report): the order-modification lifecycle rule and its guard triggers
-- (guard_pedido_update_v2, guard_turno_update_v2). That is deliberately deferred to
-- a second, smaller, independently-revertible production-specific migration applied
-- only after this one is confirmed stable in production.

-- ---------------------------------------------------------------------------
-- 1. Permission matrix. private schema already exists (see precheck) — create
--    role_permissions only if missing, so a partial-retry of this migration is
--    idempotent and never clobbers the unrelated despacho-manual functions.
-- ---------------------------------------------------------------------------

create table if not exists private.role_permissions (
  role public.rol_usuario not null,
  permission text not null,
  primary key (role, permission)
);
revoke all on table private.role_permissions from public, anon, authenticated;
truncate table private.role_permissions;

-- This is the END STATE validated on staging-security, i.e. the base v2 matrix
-- (20260816014215) with the business hierarchy fix (20260818125656) already
-- folded in: superadmin >= admin on every permission; jefe_bodega/logistica hold
-- branches.read + users.read; preparador holds shifts.read; tomador_pedidos holds
-- closures.annotate. See supabase/tests/PERMISSIONS_MATRIX.md for the full,
-- human-readable table this is generated from.
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
      -- Business hierarchy fix: superadmin >= admin on every permission. Identical
      -- to admin's array, including clients.read/clients.manage/client_addresses.*
      -- (the one gap staging's original v2 migration had and the hierarchy fix closed).
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
      'kitchen.read','kitchen.update','branch_stock.manage','inventory.read','inventory.manage',
      -- Business hierarchy fix: registering a shift handover (Regla 4).
      'closures.annotate'
    ]::text[]),
    ('preparador', array[
      'catalog.read','orders.read','kitchen.read','kitchen.update',
      -- Business hierarchy fix: reading the open turno CocinaPage depends on (Regla 3).
      'shifts.read'
    ]::text[]),
    ('despachador', array['catalog.read','orders.read']::text[]),
    ('jefe_bodega', array[
      'catalog.read','branch_stock.read','branch_stock.manage','central_stock.read','central_stock.manage',
      'inventory.read','inventory.manage','transfers.read','transfers.manage','supplies.read','supplies.manage',
      'logistics_orders.read','logistics_orders.manage','logistics_orders.progress',
      -- Business hierarchy fix: reading branches + the driver/chofer pool (Regla 1).
      'branches.read','users.read'
    ]::text[]),
    ('logistica', array[
      'catalog.read','branch_stock.read','branch_stock.manage','central_stock.read','central_stock.manage',
      'inventory.read','inventory.manage','transfers.read','transfers.manage','supplies.read','supplies.manage',
      'logistics_orders.read','logistics_orders.manage','logistics_orders.progress',
      -- Business hierarchy fix: identical to jefe_bodega (Regla 2).
      'branches.read','users.read'
    ]::text[]),
    ('contador_rrhh', array[
      'catalog.read','recipes.read','orders.read','orders.audit.read','shifts.read','cash.read','cash.manage',
      'expenses.read','expenses.manage','dispatchers.read','closures.read','closures.correct',
      'attendance.read','attendance.manage'
    ]::text[])
) as matrix(role_name, permissions)
cross join lateral unnest(matrix.permissions) as permission;

-- ---------------------------------------------------------------------------
-- 2. Private helper functions. Identical to staging's validated definitions.
--    is_admin(uuid)/is_superadmin(uuid)/get_user_rol(uuid)/get_user_sucursal(uuid)
--    are NOT touched here — see the "is_admin" note above and in the audit report.
-- ---------------------------------------------------------------------------

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
-- Explicitly re-grant EXECUTE on the pre-existing despacho-manual audit functions
-- so the blanket revoke above never regresses them, even though today only
-- `postgres` calls them internally (verified in the precheck).
grant usage on schema private to authenticated;
grant execute on function private.current_app_role() to authenticated;
grant execute on function private.current_sucursal_id() to authenticated;
grant execute on function private.has_permission(text) to authenticated;
grant execute on function private.has_global_scope() to authenticated;
grant execute on function private.can_access_sucursal(uuid) to authenticated;
grant execute on function private.turno_in_scope(uuid) to authenticated;
grant execute on function private.turno_is_open(uuid) to authenticated;
grant execute on function private.pedido_in_scope(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Enable RLS on every table this migration controls (idempotent: a table
--    that already has RLS enabled is unaffected).
-- ---------------------------------------------------------------------------

alter table public.categorias enable row level security;
alter table public.productos enable row level security;
alter table public.sabores_extra enable row level security;
alter table public.recetas enable row level security;
alter table public.historial_precios enable row level security;
alter table public.promociones enable row level security;
alter table public.promociones_precio enable row level security;
alter table public.cupones enable row level security;
alter table public.clientes enable row level security;
alter table public.direcciones_cliente enable row level security;
alter table public.sucursales enable row level security;
alter table public.usuarios enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;
alter table public.log_cambios_pedido enable row level security;
alter table public.pedidos_despacho_ajustes enable row level security;
alter table public.turnos enable row level security;
alter table public.pagos_turno enable row level security;
alter table public.gastos_turno enable row level security;
alter table public.cambios_turno enable row level security;
alter table public.turno_despachadores enable row level security;
alter table public.pago_despachadores enable row level security;
alter table public.prestamos_despachador enable row level security;
alter table public.despachos_manuales enable row level security;
alter table public.despachos_manuales_cambios enable row level security;
alter table public.insumos enable row level security;
alter table public.stock_sucursal enable row level security;
alter table public.stock_bodega_central enable row level security;
alter table public.stock_movimientos enable row level security;
alter table public.inventarios_parciales enable row level security;
alter table public.inventarios_parciales_items enable row level security;
alter table public.inventario_cierre enable row level security;
alter table public.transferencias_stock enable row level security;
alter table public.transferencia_items enable row level security;
alter table public.pedidos_logistica enable row level security;
alter table public.pedidos_logistica_items enable row level security;
alter table public.asistencia enable row level security;
alter table public.precios_trabajador enable row level security;
alter table public.tarifas_despacho enable row level security;
alter table public.tarifas_despachador enable row level security;
alter table public.configuracion_sucursal enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Dynamic policy cleanup (FASE 4). Production's live policy names differ
--    from staging's (confirmed in the P1 audit: e.g. `tomador_read_usuarios_sucursal`
--    on usuarios does not exist on staging and is not caught by any hardcoded
--    DROP list). Drop every existing policy on every public table by name,
--    whatever that name is, so no legacy permissive policy can survive to
--    combine (OR) with the new v2 policies below.
-- ---------------------------------------------------------------------------

do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 5. v2 policies. Identical logic to staging's validated model, including the
--    business-hierarchy-fix version of usuarios_read_v2 (FASE 7): jefe_bodega and
--    logistica get exactly the driver/chofer pool (rol = 'logistica'), never a
--    blanket read of every usuarios row, and never users.create/users.manage.
-- ---------------------------------------------------------------------------

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

-- Customer directory: admin AND superadmin (business hierarchy fix), nobody else.
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
    -- Business hierarchy fix (Regla 1/2): jefe_bodega/logistica read the
    -- driver/chofer pool company-wide, never an unrelated role's row.
    or (private.current_app_role() in ('jefe_bodega','logistica') and rol = 'logistica')
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

-- Orders.
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

-- Turnos, cash and closures.
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

-- Dispatch operations, scoped through their turn.
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

-- ---------------------------------------------------------------------------
-- 6. Grants (FASE 10). anon is NOT touched upward — P0-A/P0-B already closed it
--    to REFERENCES/TRIGGER only, and this migration keeps it that way, going one
--    step further by also removing REFERENCES/TRIGGER (DDL-only privileges never
--    exercised by an API role) to exactly match the validated staging end state.
--    authenticated keeps SELECT/INSERT/UPDATE/DELETE everywhere (RLS above is the
--    real boundary) and loses the remaining dead-weight TRUNCATE grant that P0-B
--    intentionally left out of its own scope.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke truncate on all tables in schema public from authenticated;

-- Dead, anon-facing RPC surface found in this migration's precheck (FASE 1/10):
-- SECURITY DEFINER, takes any sucursal_id, returns the open turno id, zero
-- callers in the app. Only EXECUTE is revoked (from anon AND from PUBLIC, since
-- anon otherwise inherits PUBLIC's grant); the function itself is out of this
-- migration's scope to drop, and authenticated/service_role keep their existing
-- EXECUTE grant unchanged.
revoke execute on function public.get_turno_abierto(uuid) from anon;
revoke execute on function public.get_turno_abierto(uuid) from public;

-- ---------------------------------------------------------------------------
-- 7. Storage (FASE 11). Replace the 4 legacy "bridge" policies (verified live on
--    production in this migration's precheck) with the v2 equivalents already
--    validated on staging: public read stays, but only product_images.manage
--    (admin/superadmin) can write, instead of any authenticated session.
-- ---------------------------------------------------------------------------

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

-- ---------------------------------------------------------------------------
-- 8. Atomic invariants (FASE 5/6/9). Fail the whole migration if any of these
--    hold — matches the safety pattern staging's own v2 migration established.
-- ---------------------------------------------------------------------------

do $$
begin
  -- Every public table must have RLS enabled.
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity
  ) then
    raise exception 'RLS v2 production invariant failed: a public table has RLS disabled';
  end if;

  -- Every public table must have at least one policy (clientes/direcciones_cliente
  -- are the deliberate exception: RLS on, zero policies, deny-by-default).
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not in ('clientes','direcciones_cliente')
      and not exists (
        select 1 from pg_policies p
        where p.schemaname = 'public' and p.tablename = c.relname
      )
  ) then
    raise exception 'RLS v2 production invariant failed: a public table has no policy';
  end if;

  -- Business hierarchy: superadmin >= admin on every permission (Regla 5).
  if exists (
    select 1 from private.role_permissions admin_perm
    where admin_perm.role = 'admin'
      and not exists (
        select 1 from private.role_permissions sa
        where sa.role = 'superadmin' and sa.permission = admin_perm.permission
      )
  ) then
    raise exception 'RLS v2 production invariant failed: admin has a permission superadmin lacks';
  end if;

  -- jefe_bodega/logistica must never receive users.create or users.manage
  -- (Regla 1/2: read-only access to the driver pool, no user administration).
  if exists (
    select 1 from private.role_permissions
    where role in ('jefe_bodega','logistica')
      and permission in ('users.create','users.manage')
  ) then
    raise exception 'RLS v2 production invariant failed: jefe_bodega/logistica must not hold users.create/users.manage';
  end if;

  -- tomador_pedidos must never receive closures.correct (Regla 4).
  if exists (
    select 1 from private.role_permissions
    where role = 'tomador_pedidos' and permission = 'closures.correct'
  ) then
    raise exception 'RLS v2 production invariant failed: tomador_pedidos must not hold closures.correct';
  end if;

  -- anon must hold nothing on any public table (P0-A/P0-B/this migration).
  if exists (
    select 1 from information_schema.role_table_grants
    where table_schema = 'public' and grantee = 'anon'
  ) then
    raise exception 'RLS v2 production invariant failed: anon still holds a grant on a public table';
  end if;
end $$;
