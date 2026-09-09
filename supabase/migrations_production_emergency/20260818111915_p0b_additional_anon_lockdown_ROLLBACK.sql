-- MANUAL EMERGENCY ROLLBACK for 20260818111915_p0b_additional_anon_lockdown.sql.
--
-- This is NOT a migration. Do not place it in supabase/migrations/ and do not
-- let any automated tool (`supabase db push`, CI, etc.) apply it. It exists only
-- to be run by hand, statement by statement if needed, against production
-- (uwymxjmyasnlmkitzvej) if the P0-B hotfix causes an unexpected regression.
--
-- It restores EXACTLY the grants that existed immediately before P0-B was applied
-- (confirmed by the same precheck snapshot used to write the hotfix): anon held
-- DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on all 25 tables
-- below. REFERENCES and TRIGGER were never touched by the hotfix, so they are not
-- part of this rollback.
--
-- Using this rollback re-opens the exposure the hotfix was meant to close:
-- unauthenticated read/write on the Group A tables, and unauthenticated TRUNCATE
-- on the Group B tables. Only run it if the hotfix itself is confirmed to be
-- causing a worse operational problem than the exposure it closes, and only until
-- a corrected hotfix can be prepared. This does not touch public.clientes or
-- public.direcciones_cliente's RLS state, public.usuarios, or any other table
-- outside this hotfix's scope.

-- ---------------------------------------------------------------------------
-- 1. Restore anon's grants on the Group A tables.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete, truncate on
  public.cupones,
  public.insumos,
  public.promociones,
  public.promociones_precio,
  public.stock_movimientos,
  public.pago_despachadores,
  public.precios_trabajador,
  public.sabores_extra,
  public.inventario_cierre
to anon;

-- ---------------------------------------------------------------------------
-- 2. Restore anon's grants on the Group B tables.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete, truncate on
  public.asistencia,
  public.cambios_turno,
  public.configuracion_sucursal,
  public.direcciones_cliente,
  public.historial_precios,
  public.inventarios_parciales,
  public.inventarios_parciales_items,
  public.log_cambios_pedido,
  public.pedidos_logistica,
  public.pedidos_logistica_items,
  public.prestamos_despachador,
  public.stock_bodega_central,
  public.tarifas_despachador,
  public.tarifas_despacho,
  public.transferencia_items,
  public.transferencias_stock
to anon;
