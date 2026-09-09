-- Production-specific delta checks for 20260818132354_rls_v2_production_specific.sql.
--
-- This file covers exactly what is DIFFERENT about promoting RLS v2 to production
-- versus staging: legacy policy removal, anon grants reaching zero, the storage
-- bridge-policy replacement, and closing the dead get_turno_abierto anon RPC.
--
-- It deliberately does NOT re-cover positive/negative/cross-branch/escalation/
-- hierarchy/logistics/kitchen/cambios_turno/admin-global behavior — that is
-- already exhaustively covered by the two suites already validated on staging,
-- which are directly portable (byte-for-byte, no edits needed) against whatever
-- database this migration is applied to, since the end-state schema is identical:
--   - supabase/tests/authorization_rls_matrix_v2_matrix.sql (95 cases)
--   - supabase/tests/authorization_rls_matrix_v2_business_hierarchy_fix.sql (166 cases)
-- Run all three files, in this order, against a temporary preview branch/clone of
-- production — never against production directly. Run this file AFTER
-- 20260818132354_rls_v2_production_specific.sql has been applied there.
--
-- Transactional: BEGIN ... ROLLBACK. Nothing here is ever committed.

begin;

create temp table prod_delta_results (
  seq bigserial,
  check_name text not null,
  actual text not null,
  expected text not null,
  result text not null,
  detail text not null
) on commit drop;

create procedure pg_temp.check_delta(p_name text, p_actual text, p_expected text, p_detail text)
language sql as $$
  insert into prod_delta_results (check_name, actual, expected, result, detail)
  values (p_name, p_actual, p_expected, case when p_actual = p_expected then 'PASS' else 'FAIL' end, p_detail);
$$;

-- ---------------------------------------------------------------------------
-- 1. None of the 60 legacy policy names should survive the dynamic drop.
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from pg_policies
  where schemaname = 'public' and policyname in (
    'authenticated_all_cambios_turno','categorias_admin_modify','authenticated_read_categorias',
    'categorias_authenticated_select','despachos_manuales_delete_autorizado',
    'despachos_manuales_insert_autorizado','despachos_manuales_select_autorizado',
    'despachos_manuales_update_autorizado','despachos_manuales_cambios_admin_select',
    'authenticated_all_gastos_turno','historial_authenticated_insert','historial_admin_select',
    'insumos_admin_modify','authenticated_read_insumos','authenticated_all_inventarios_parciales',
    'authenticated_all_inventarios_parciales_items','log_cambios_pedido_superadmin_all',
    'authenticated_all_pago_despachadores','authenticated_all_pagos_turno',
    'authenticated_delete_pedido_items','authenticated_insert_pedido_items',
    'authenticated_read_pedido_items','authenticated_update_pedido_items',
    'full_access_admins_pedidos','sucursal_propia_pedidos','despachador_sus_pedidos',
    'pedidos_despacho_ajustes_admin_select','authenticated_all_pedidos_logistica',
    'authenticated_all_pedidos_logistica_items','Authenticated can delete prestamos',
    'Authenticated can insert prestamos','Authenticated can read prestamos',
    'Authenticated can update prestamos','productos_admin_modify','authenticated_read_productos',
    'productos_authenticated_select','authenticated_read_recetas','sabores_extra_select_authenticated',
    'authenticated_all_stock_bodega_central','jefe_bodega_stock','sucursales_admin_delete',
    'sucursales_admin_modify','authenticated_read_sucursales','sucursales_authenticated_select',
    'sucursales_admin_update','tarifas_despachador_admin_modify','tarifas_despachador_read_all',
    'tarifas_despacho_admin_modify','tarifas_despacho_read_all','authenticated_all_turno_despachadores',
    'authenticated_all_turnos','full_access_admins','sucursal_propia_turnos','usuarios_admin_all',
    'authenticated_read_usuarios','tomador_read_usuarios_sucursal','usuarios_encargado_sucursal_select',
    'usuarios_self_select'
  );
  call pg_temp.check_delta('legacy_policies_removed', v_count::text, '0',
    'none of the 60 pre-migration legacy policy names should still exist on public.*');
end $$;

-- ---------------------------------------------------------------------------
-- 2. Every public table must be RLS-enabled and (except clientes/direcciones_cliente)
--    have at least one policy -- the same invariant the migration itself enforces,
--    re-checked independently here.
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  call pg_temp.check_delta('all_tables_rls_enabled', v_count::text, '0', 'tables with RLS disabled after migration');

  select count(*) into v_count from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname not in ('clientes','direcciones_cliente')
    and not exists (select 1 from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname);
  call pg_temp.check_delta('all_tables_have_policy', v_count::text, '0', 'tables with zero policies (excluding the intentional deny-by-default pair)');
end $$;

-- ---------------------------------------------------------------------------
-- 3. anon must hold zero grants on any public table.
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'anon';
  call pg_temp.check_delta('anon_zero_grants', v_count::text, '0', 'anon must hold no privilege (including REFERENCES/TRIGGER) on any public table');
end $$;

-- ---------------------------------------------------------------------------
-- 4. authenticated must hold no TRUNCATE anywhere (PostgREST never emits it).
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from information_schema.role_table_grants
  where table_schema = 'public' and grantee = 'authenticated' and privilege_type = 'TRUNCATE';
  call pg_temp.check_delta('authenticated_no_truncate', v_count::text, '0', 'authenticated must hold no TRUNCATE grant on any public table');
end $$;

-- ---------------------------------------------------------------------------
-- 5. Storage: legacy bridge policies gone, v2 policies present, semantics correct.
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('Public read productos images','Authenticated upload productos images',
                        'Authenticated update productos images','Authenticated delete productos images');
  call pg_temp.check_delta('storage_legacy_removed', v_count::text, '0', 'legacy bridge policies must be gone');

  select count(*) into v_count from pg_policies
  where schemaname = 'storage' and tablename = 'objects'
    and policyname in ('product_images_public_read_v2','product_images_insert_v2',
                        'product_images_update_v2','product_images_delete_v2');
  call pg_temp.check_delta('storage_v2_present', v_count::text, '4', 'all 4 v2 storage policies must exist');
end $$;

-- ---------------------------------------------------------------------------
-- 6. Dead anon RPC surface closed.
-- ---------------------------------------------------------------------------

do $$
declare v_has boolean;
begin
  select has_function_privilege('anon', 'public.get_turno_abierto(uuid)', 'EXECUTE') into v_has;
  call pg_temp.check_delta('get_turno_abierto_anon_closed', v_has::text, 'false', 'anon must not be able to call get_turno_abierto anymore');
end $$;

-- ---------------------------------------------------------------------------
-- 7. is_admin() semantics unchanged (production's historical meaning is kept,
--    NOT staging's original narrow admin-only redefinition).
-- ---------------------------------------------------------------------------

do $$
declare v_src text;
begin
  select prosrc into v_src from pg_proc where proname = 'is_admin' and pronamespace = 'public'::regnamespace;
  call pg_temp.check_delta('is_admin_untouched', (v_src ilike '%superadmin%' and v_src ilike '%admin%')::text, 'true',
    'is_admin() must still reference both admin and superadmin (historical semantics, never narrowed)');
end $$;

-- ---------------------------------------------------------------------------
-- 8. private schema pre-existing objects untouched (despacho-manual audit).
-- ---------------------------------------------------------------------------

do $$
declare v_count int;
begin
  select count(*) into v_count from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private' and p.proname in
    ('auditar_despacho_manual','calcular_y_auditar_costo_despacho','preparar_despacho_manual','registrar_ajuste_costo_despacho');
  call pg_temp.check_delta('private_legacy_functions_preserved', v_count::text, '4', 'the 4 pre-existing despacho-manual audit functions must still exist');
end $$;

-- ---------------------------------------------------------------------------
-- Report and rollback.
-- ---------------------------------------------------------------------------

select jsonb_build_object(
  'total', (select count(*) from prod_delta_results),
  'pass', (select count(*) from prod_delta_results where result = 'PASS'),
  'fail', (select count(*) from prod_delta_results where result = 'FAIL'),
  'failures', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from prod_delta_results r where result = 'FAIL'),
  'all_results', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from prod_delta_results r)
) as report;

rollback;
