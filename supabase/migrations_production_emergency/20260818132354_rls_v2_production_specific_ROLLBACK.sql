-- MANUAL EMERGENCY ROLLBACK for 20260818132354_rls_v2_production_specific.sql.
--
-- This is NOT a migration. Do not place it in supabase/migrations/ and do not let
-- any automated tool (`supabase db push`, CI, etc.) apply it. It exists only to be
-- run by hand, statement by statement if needed, against production
-- (uwymxjmyasnlmkitzvej) if the RLS v2 production migration causes an unexpected
-- regression after being applied.
--
-- Philosophy (FASE 16): prefer roll-forward (fix one wrong v2 policy in place) over
-- this file whenever the problem is narrow — a single policy being too strict or
-- too loose is safer to patch directly than to revert the whole authorization
-- model back to the pre-migration state, which reopens every gap the P1 audit and
-- this migration closed (including the authenticated self-escalation-to-admin
-- path). Use this file only if the v2 model itself is unusable in production
-- (e.g. a whole role's core flow is broken and cannot wait for a targeted fix).
--
-- What this file restores, exactly as captured by this migration's own precheck:
--   - RLS disabled again on the 20 tables that had it disabled before this
--     migration (categorias, cupones, gastos_turno, insumos, inventario_cierre,
--     pago_despachadores, pagos_turno, pedido_items, pedidos, precios_trabajador,
--     productos, promociones, promociones_precio, sabores_extra, stock_movimientos,
--     stock_sucursal, sucursales, turno_despachadores, turnos, usuarios).
--   - The exact 60 legacy policies that existed before this migration, on both
--     the RLS-disabled tables above (where they were already inert) and the 21
--     tables that had RLS enabled with legacy policies.
--   - Every anon/authenticated table grant restored to its EXACT pre-migration
--     value, per object, taken from the snapshot captured during this migration's
--     own validation (supabase/tests/results/production_migration_validation/
--     03_pre_migration_grants.json) — not a blanket rule. In particular:
--     despachos_manuales, despachos_manuales_cambios and pedidos_despacho_ajustes
--     get back exactly what they had (no anon grant at all, no TRUNCATE for
--     authenticated), and the two views (v_stock_bajo_minimo, v_ventas_dia) are
--     restored explicitly, since Postgres' `pg_tables` excludes views and a
--     table-only loop would silently skip them (found and fixed during this
--     migration's rollback-drill validation).
--   - EXECUTE on public.get_turno_abierto(uuid) restored to both anon and PUBLIC
--     (production held both before the migration; the corrected migration now
--     revokes both).
--   - storage.objects: the 4 legacy "bridge" policies on bucket 'productos'.
--
-- What this file deliberately does NOT do:
--   - It does NOT drop private.role_permissions or the 8 private.* helper
--     functions this migration created. They become dormant (nothing references
--     them once the v2 policies below are dropped) but are otherwise harmless to
--     leave in place, and DROP FUNCTION/TABLE here would add failure modes to an
--     emergency procedure for no operational benefit. Remove them later, outside
--     an incident, if a full cleanup is wanted.
--   - It does NOT touch public.is_admin/is_superadmin/get_user_rol/get_user_sucursal
--     — this migration never modified them, so there is nothing to restore.
--   - It does NOT disable RLS on clientes or direcciones_cliente. Those had RLS
--     enabled with zero policies before this migration too (P0-A's deny-by-default,
--     independent of this migration) — restoring "no policy" is a no-op here, not
--     a rollback action, so it is listed for completeness but nothing is executed.

-- ---------------------------------------------------------------------------
-- 1. Drop every v2 policy this migration created.
-- ---------------------------------------------------------------------------

do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and policyname like '%_v2'
  loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

drop policy if exists product_images_public_read_v2 on storage.objects;
drop policy if exists product_images_insert_v2 on storage.objects;
drop policy if exists product_images_update_v2 on storage.objects;
drop policy if exists product_images_delete_v2 on storage.objects;

-- ---------------------------------------------------------------------------
-- 2. Restore RLS-disabled state on the 20 tables that had it disabled before.
-- ---------------------------------------------------------------------------

alter table public.categorias disable row level security;
alter table public.cupones disable row level security;
alter table public.gastos_turno disable row level security;
alter table public.insumos disable row level security;
alter table public.inventario_cierre disable row level security;
alter table public.pago_despachadores disable row level security;
alter table public.pagos_turno disable row level security;
alter table public.pedido_items disable row level security;
alter table public.pedidos disable row level security;
alter table public.precios_trabajador disable row level security;
alter table public.productos disable row level security;
alter table public.promociones disable row level security;
alter table public.promociones_precio disable row level security;
alter table public.sabores_extra disable row level security;
alter table public.stock_movimientos disable row level security;
alter table public.stock_sucursal disable row level security;
alter table public.sucursales disable row level security;
alter table public.turno_despachadores disable row level security;
alter table public.turnos disable row level security;
alter table public.usuarios disable row level security;

-- ---------------------------------------------------------------------------
-- 3. Restore the 60 legacy policies, exactly as captured live before this
--    migration ran (same session precheck).
-- ---------------------------------------------------------------------------

create policy "authenticated_all_cambios_turno" on public.cambios_turno for all to authenticated
using (true) with check (true);

create policy "categorias_admin_modify" on public.categorias for all to authenticated
using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "authenticated_read_categorias" on public.categorias for select to public
using (auth.role() = 'authenticated'::text);
create policy "categorias_authenticated_select" on public.categorias for select to authenticated
using (true);

create policy "despachos_manuales_delete_autorizado" on public.despachos_manuales for delete to authenticated
using ((( select is_admin(( select auth.uid() as uid)) as is_admin) or ((( select get_user_rol(( select auth.uid() as uid)) as get_user_rol) = any (array['tomador_pedidos','encargado'])) and (exists ( select 1 from turnos t where ((t.id = despachos_manuales.turno_id) and (t.estado = 'abierto'::estado_turno) and (t.sucursal_id = ( select get_user_sucursal(( select auth.uid() as uid)) as get_user_sucursal))))))));
create policy "despachos_manuales_insert_autorizado" on public.despachos_manuales for insert to authenticated
with check ((( select is_admin(( select auth.uid() as uid)) as is_admin) or ((( select get_user_rol(( select auth.uid() as uid)) as get_user_rol) = any (array['tomador_pedidos','encargado'])) and (exists ( select 1 from turnos t where ((t.id = despachos_manuales.turno_id) and (t.estado = 'abierto'::estado_turno) and (t.sucursal_id = ( select get_user_sucursal(( select auth.uid() as uid)) as get_user_sucursal))))))));
create policy "despachos_manuales_select_autorizado" on public.despachos_manuales for select to authenticated
using ((( select is_admin(( select auth.uid() as uid)) as is_admin) or ((( select get_user_rol(( select auth.uid() as uid)) as get_user_rol) = any (array['tomador_pedidos','encargado'])) and (exists ( select 1 from turnos t where ((t.id = despachos_manuales.turno_id) and (t.sucursal_id = ( select get_user_sucursal(( select auth.uid() as uid)) as get_user_sucursal))))))));
create policy "despachos_manuales_update_autorizado" on public.despachos_manuales for update to authenticated
using ((( select is_admin(( select auth.uid() as uid)) as is_admin) or ((( select get_user_rol(( select auth.uid() as uid)) as get_user_rol) = any (array['tomador_pedidos','encargado'])) and (exists ( select 1 from turnos t where ((t.id = despachos_manuales.turno_id) and (t.estado = 'abierto'::estado_turno) and (t.sucursal_id = ( select get_user_sucursal(( select auth.uid() as uid)) as get_user_sucursal))))))))
with check ((( select is_admin(( select auth.uid() as uid)) as is_admin) or ((( select get_user_rol(( select auth.uid() as uid)) as get_user_rol) = any (array['tomador_pedidos','encargado'])) and (exists ( select 1 from turnos t where ((t.id = despachos_manuales.turno_id) and (t.estado = 'abierto'::estado_turno) and (t.sucursal_id = ( select get_user_sucursal(( select auth.uid() as uid)) as get_user_sucursal))))))));

create policy "despachos_manuales_cambios_admin_select" on public.despachos_manuales_cambios for select to authenticated
using (( select is_admin(( select auth.uid() as uid)) as is_admin));

create policy "authenticated_all_gastos_turno" on public.gastos_turno for all to public
using (auth.role() = 'authenticated'::text);

create policy "historial_authenticated_insert" on public.historial_precios for insert to authenticated
with check (true);
create policy "historial_admin_select" on public.historial_precios for select to authenticated
using (is_admin(auth.uid()));

create policy "insumos_admin_modify" on public.insumos for all to authenticated
using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "authenticated_read_insumos" on public.insumos for select to public
using (auth.role() = 'authenticated'::text);

create policy "authenticated_all_inventarios_parciales" on public.inventarios_parciales for all to authenticated
using (true) with check (true);
create policy "authenticated_all_inventarios_parciales_items" on public.inventarios_parciales_items for all to authenticated
using (true) with check (true);

create policy "log_cambios_pedido_superadmin_all" on public.log_cambios_pedido for all to authenticated
using (is_superadmin(auth.uid())) with check (is_superadmin(auth.uid()));

create policy "authenticated_all_pago_despachadores" on public.pago_despachadores for all to public
using (auth.role() = 'authenticated'::text);
create policy "authenticated_all_pagos_turno" on public.pagos_turno for all to public
using (auth.role() = 'authenticated'::text);

create policy "authenticated_delete_pedido_items" on public.pedido_items for delete to authenticated
using (auth.role() = 'authenticated'::text);
create policy "authenticated_insert_pedido_items" on public.pedido_items for insert to authenticated
with check (auth.role() = 'authenticated'::text);
create policy "authenticated_read_pedido_items" on public.pedido_items for select to authenticated
using (auth.role() = 'authenticated'::text);
create policy "authenticated_update_pedido_items" on public.pedido_items for update to authenticated
using (auth.role() = 'authenticated'::text) with check (auth.role() = 'authenticated'::text);

create policy "full_access_admins_pedidos" on public.pedidos for all to public
using (exists ( select 1 from usuarios where ((usuarios.id = auth.uid()) and (usuarios.rol = any (array['superadmin'::rol_usuario, 'admin'::rol_usuario])))));
create policy "sucursal_propia_pedidos" on public.pedidos for all to public
using (exists ( select 1 from usuarios where ((usuarios.id = auth.uid()) and (usuarios.sucursal_id = pedidos.sucursal_id) and (usuarios.rol = any (array['tomador_pedidos'::rol_usuario, 'encargado'::rol_usuario, 'preparador'::rol_usuario])))));
create policy "despachador_sus_pedidos" on public.pedidos for select to public
using (despachador_id = auth.uid());

create policy "pedidos_despacho_ajustes_admin_select" on public.pedidos_despacho_ajustes for select to authenticated
using (( select is_admin(( select auth.uid() as uid)) as is_admin));

create policy "authenticated_all_pedidos_logistica" on public.pedidos_logistica for all to authenticated
using (true) with check (true);
create policy "authenticated_all_pedidos_logistica_items" on public.pedidos_logistica_items for all to authenticated
using (true) with check (true);

create policy "Authenticated can delete prestamos" on public.prestamos_despachador for delete to authenticated
using (true);
create policy "Authenticated can insert prestamos" on public.prestamos_despachador for insert to authenticated
with check (true);
create policy "Authenticated can read prestamos" on public.prestamos_despachador for select to authenticated
using (true);
create policy "Authenticated can update prestamos" on public.prestamos_despachador for update to authenticated
using (true) with check (true);

create policy "productos_admin_modify" on public.productos for all to authenticated
using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "authenticated_read_productos" on public.productos for select to public
using (auth.role() = 'authenticated'::text);
create policy "productos_authenticated_select" on public.productos for select to authenticated
using (true);

create policy "authenticated_read_recetas" on public.recetas for all to public
using (auth.role() = 'authenticated'::text);

create policy "sabores_extra_select_authenticated" on public.sabores_extra for select to authenticated
using (true);

create policy "authenticated_all_stock_bodega_central" on public.stock_bodega_central for all to authenticated
using (true) with check (true);

create policy "jefe_bodega_stock" on public.stock_sucursal for all to public
using (exists ( select 1 from usuarios where ((usuarios.id = auth.uid()) and (usuarios.rol = 'jefe_bodega'::rol_usuario))));

create policy "sucursales_admin_delete" on public.sucursales for delete to authenticated
using (is_admin(auth.uid()));
create policy "sucursales_admin_modify" on public.sucursales for insert to authenticated
with check (is_admin(auth.uid()));
create policy "authenticated_read_sucursales" on public.sucursales for select to public
using (auth.role() = 'authenticated'::text);
create policy "sucursales_authenticated_select" on public.sucursales for select to authenticated
using (true);
create policy "sucursales_admin_update" on public.sucursales for update to authenticated
using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create policy "tarifas_despachador_admin_modify" on public.tarifas_despachador for all to authenticated
using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "tarifas_despachador_read_all" on public.tarifas_despachador for select to public
using (auth.role() = 'authenticated'::text);

create policy "tarifas_despacho_admin_modify" on public.tarifas_despacho for all to authenticated
using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "tarifas_despacho_read_all" on public.tarifas_despacho for select to public
using (auth.role() = 'authenticated'::text);

create policy "authenticated_all_turno_despachadores" on public.turno_despachadores for all to public
using (auth.role() = 'authenticated'::text);

create policy "authenticated_all_turnos" on public.turnos for all to public
using (auth.role() = 'authenticated'::text);
create policy "full_access_admins" on public.turnos for all to public
using (exists ( select 1 from usuarios where ((usuarios.id = auth.uid()) and (usuarios.rol = any (array['superadmin'::rol_usuario, 'admin'::rol_usuario])))));
create policy "sucursal_propia_turnos" on public.turnos for all to public
using (exists ( select 1 from usuarios where ((usuarios.id = auth.uid()) and (usuarios.sucursal_id = turnos.sucursal_id) and (usuarios.rol = any (array['tomador_pedidos'::rol_usuario, 'encargado'::rol_usuario, 'preparador'::rol_usuario])))));

create policy "usuarios_admin_all" on public.usuarios for all to public
using (is_admin(auth.uid())) with check (is_admin(auth.uid()));
create policy "authenticated_read_usuarios" on public.usuarios for select to public
using (auth.role() = 'authenticated'::text);
create policy "tomador_read_usuarios_sucursal" on public.usuarios for select to public
using (auth.role() = 'authenticated'::text);
create policy "usuarios_encargado_sucursal_select" on public.usuarios for select to public
using ((get_user_rol(auth.uid()) = 'encargado'::text) and (sucursal_id = get_user_sucursal(auth.uid())));
create policy "usuarios_self_select" on public.usuarios for select to public
using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Restore grants to their exact pre-migration state, per object, from the
--    snapshot captured during this migration's own validation (supabase/tests/
--    results/production_migration_validation/03_pre_migration_grants.json).
--    No generic loop, no hardcoded exclude list: despachos_manuales,
--    despachos_manuales_cambios and pedidos_despacho_ajustes never held
--    TRUNCATE for authenticated nor REFERENCES/TRIGGER for anon, and the two
--    views (v_stock_bajo_minimo, v_ventas_dia) held the same full grant set as
--    any other table -- both facts are preserved exactly below instead of
--    assumed away by a blanket restore.
--
--    GRANT only ever adds privileges, it never removes any -- so before
--    restoring the exact snapshot, every anon/authenticated privilege the
--    migration (or a default-privilege side effect) may have added is revoked
--    first. Without this, tables where authenticated originally held fewer
--    privileges than the migration's blanket `grant select, insert, update,
--    delete ... to authenticated` (despachos_manuales_cambios and
--    pedidos_despacho_ajustes both originally had only SELECT) would keep the
--    extra INSERT/UPDATE/DELETE forever (found during this fix's rollback-drill
--    re-validation).
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant references, trigger on table public.asistencia to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.asistencia to authenticated;
grant references, trigger on table public.cambios_turno to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.cambios_turno to authenticated;
grant references, trigger on table public.categorias to anon;
grant delete, insert, references, select, trigger, update on table public.categorias to authenticated;
grant references, trigger on table public.clientes to anon;
grant delete, insert, references, select, trigger, update on table public.clientes to authenticated;
grant references, trigger on table public.configuracion_sucursal to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.configuracion_sucursal to authenticated;
grant references, trigger on table public.cupones to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.cupones to authenticated;
grant delete, insert, select, update on table public.despachos_manuales to authenticated;
grant select on table public.despachos_manuales_cambios to authenticated;
grant references, trigger on table public.direcciones_cliente to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.direcciones_cliente to authenticated;
grant references, trigger on table public.gastos_turno to anon;
grant delete, insert, references, select, trigger, update on table public.gastos_turno to authenticated;
grant references, trigger on table public.historial_precios to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.historial_precios to authenticated;
grant references, trigger on table public.insumos to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.insumos to authenticated;
grant references, trigger on table public.inventario_cierre to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.inventario_cierre to authenticated;
grant references, trigger on table public.inventarios_parciales to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.inventarios_parciales to authenticated;
grant references, trigger on table public.inventarios_parciales_items to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.inventarios_parciales_items to authenticated;
grant references, trigger on table public.log_cambios_pedido to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.log_cambios_pedido to authenticated;
grant references, trigger on table public.pago_despachadores to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.pago_despachadores to authenticated;
grant references, trigger on table public.pagos_turno to anon;
grant delete, insert, references, select, trigger, update on table public.pagos_turno to authenticated;
grant references, trigger on table public.pedido_items to anon;
grant delete, insert, references, select, trigger, update on table public.pedido_items to authenticated;
grant references, trigger on table public.pedidos to anon;
grant delete, insert, references, select, trigger, update on table public.pedidos to authenticated;
grant select on table public.pedidos_despacho_ajustes to authenticated;
grant references, trigger on table public.pedidos_logistica to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.pedidos_logistica to authenticated;
grant references, trigger on table public.pedidos_logistica_items to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.pedidos_logistica_items to authenticated;
grant references, trigger on table public.precios_trabajador to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.precios_trabajador to authenticated;
grant references, trigger on table public.prestamos_despachador to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.prestamos_despachador to authenticated;
grant references, trigger on table public.productos to anon;
grant delete, insert, references, select, trigger, update on table public.productos to authenticated;
grant references, trigger on table public.promociones to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.promociones to authenticated;
grant references, trigger on table public.promociones_precio to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.promociones_precio to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.recetas to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.recetas to authenticated;
grant references, trigger on table public.sabores_extra to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.sabores_extra to authenticated;
grant references, trigger on table public.stock_bodega_central to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.stock_bodega_central to authenticated;
grant references, trigger on table public.stock_movimientos to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.stock_movimientos to authenticated;
grant references, trigger on table public.stock_sucursal to anon;
grant delete, insert, references, select, trigger, update on table public.stock_sucursal to authenticated;
grant references, trigger on table public.sucursales to anon;
grant delete, insert, references, select, trigger, update on table public.sucursales to authenticated;
grant references, trigger on table public.tarifas_despachador to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.tarifas_despachador to authenticated;
grant references, trigger on table public.tarifas_despacho to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.tarifas_despacho to authenticated;
grant references, trigger on table public.transferencia_items to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.transferencia_items to authenticated;
grant references, trigger on table public.transferencias_stock to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.transferencias_stock to authenticated;
grant references, trigger on table public.turno_despachadores to anon;
grant delete, insert, references, select, trigger, update on table public.turno_despachadores to authenticated;
grant references, trigger on table public.turnos to anon;
grant delete, insert, references, select, trigger, update on table public.turnos to authenticated;
grant references, trigger on table public.usuarios to anon;
grant delete, insert, references, select, trigger, update on table public.usuarios to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_stock_bajo_minimo to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_stock_bajo_minimo to authenticated;
grant delete, insert, references, select, trigger, truncate, update on table public.v_ventas_dia to anon;
grant delete, insert, references, select, trigger, truncate, update on table public.v_ventas_dia to authenticated;

-- get_turno_abierto: restore both the anon-specific grant and the PUBLIC grant
-- the corrected migration now also revokes (production held both).
grant execute on function public.get_turno_abierto(uuid) to anon;
grant execute on function public.get_turno_abierto(uuid) to public;

-- ---------------------------------------------------------------------------
-- 5. Restore storage.objects bridge policies.
-- ---------------------------------------------------------------------------

create policy "Public read productos images" on storage.objects for select to public
using (bucket_id = 'productos'::text);
create policy "Authenticated upload productos images" on storage.objects for insert to authenticated
with check (bucket_id = 'productos'::text);
create policy "Authenticated update productos images" on storage.objects for update to authenticated
using (bucket_id = 'productos'::text);
create policy "Authenticated delete productos images" on storage.objects for delete to authenticated
using (bucket_id = 'productos'::text);
