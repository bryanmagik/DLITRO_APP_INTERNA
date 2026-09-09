-- PRODUCTION EMERGENCY HOTFIX — P0-B ONLY.
--
-- Target: production project ref uwymxjmyasnlmkitzvej ("main" branch / "DLITRO ULTIMATE").
-- This file is intentionally OUTSIDE supabase/migrations/ and must never be applied to
-- staging-security (suscxwjloggmbsqdlgpj) — that project already has a superseding,
-- fully-scoped RLS v2 model (see supabase/migrations/20260816014215_authorization_rls_matrix_v2.sql).
-- Do not move or copy this file into supabase/migrations/.
--
-- Scope (P0-B, follow-up to P0-A, read-only audit performed same session): P0-A
-- (20260817194901_p0a_anon_lockdown.sql) closed anon's direct grants on 12 tables only.
-- This hotfix closes the same class of exposure on the remaining tables P0-A did not
-- cover. Nothing else. Explicitly NOT included:
--   - any change to public.clientes, public.direcciones_cliente RLS state (already
--     enabled with zero policies for clientes since P0-A; direcciones_cliente already
--     has RLS enabled with zero policies independent of this hotfix)
--   - any change to authenticated's existing grants or policies
--   - any change to service_role
--   - RLS enable/disable on any table
--   - any policy, function, or trigger change
--   - P1 (authenticated-side cross-branch RLS/policy work) — tracked separately
--
-- Precheck evidence (read-only queries against production, same session, 2026-08-18):
--
-- Group A — RLS disabled (relrowsecurity = false), so anon's table grants are
-- directly effective (no RLS to filter them):
--   cupones, insumos, promociones, promociones_precio, stock_movimientos,
--   pago_despachadores, precios_trabajador, sabores_extra, inventario_cierre
--
-- Group B — RLS enabled (relrowsecurity = true), all existing policies scoped to
-- role authenticated only (or role public with an explicit auth.role() = 'authenticated'
-- check), so anon's SELECT/INSERT/UPDATE/DELETE are already denied at the RLS layer.
-- TRUNCATE is never subject to RLS in PostgreSQL, so anon's TRUNCATE grant remains
-- directly exploitable regardless of these policies:
--   asistencia, cambios_turno, configuracion_sucursal, direcciones_cliente,
--   historial_precios, inventarios_parciales, inventarios_parciales_items,
--   log_cambios_pedido, pedidos_logistica, pedidos_logistica_items,
--   prestamos_despachador, stock_bodega_central, tarifas_despachador,
--   tarifas_despacho, transferencia_items, transferencias_stock
--
-- All 25 tables confirmed to exist in public schema with relforcerowsecurity = false.
-- anon currently holds the identical grant set on every one of the 25 tables:
--   DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
-- authenticated currently holds the same set on all 25 (untouched by this hotfix).
--
-- Dependency check (source-of-truth: this repo, same session):
--   - No Edge Function (recibir-pedido-online, recibir-pedido-nely, crear-usuario)
--     reads or writes any of these 25 tables using the anon key. recibir-pedido-nely
--     reads public.sabores_extra but does so with the service-role key (unaffected by
--     any anon revoke). crear-usuario's anon-key client is used exclusively for
--     supabase.auth.getUser() (JWT verification via the Auth API), never for a table
--     read/write, so it holds no dependency on any table grant.
--   - No public/unauthenticated route (/, /login, /seguimiento/:pedidoId) references
--     any of these 25 tables. A full-repo grep of `.from("<table>")` for all 25 names
--     returns matches only inside role-gated pages under src/pages/{turno,admin,
--     encargado,contador,bodega}/ and src/components/, all wrapped by ProtectedRoute
--     (requires an authenticated session with an allowed role).
--   - REFERENCES and TRIGGER are intentionally left untouched for anon (same as P0-A):
--     no material risk identified from either privilege in isolation, and revoking them
--     is out of P0-B's authorized scope.

-- ---------------------------------------------------------------------------
-- 1. Revoke anon's direct CRUD + TRUNCATE on the Group A tables (RLS disabled;
--    these grants are fully effective today — this is the most urgent part).
-- ---------------------------------------------------------------------------
revoke select, insert, update, delete, truncate on
  public.cupones,
  public.insumos,
  public.promociones,
  public.promociones_precio,
  public.stock_movimientos,
  public.pago_despachadores,
  public.precios_trabajador,
  public.sabores_extra,
  public.inventario_cierre
from anon;

-- ---------------------------------------------------------------------------
-- 2. Revoke anon's direct CRUD + TRUNCATE on the Group B tables (RLS enabled;
--    SELECT/INSERT/UPDATE/DELETE are already denied in practice by existing
--    authenticated-only policies, but the grant is removed anyway as defense in
--    depth rather than relying solely on policy correctness. TRUNCATE is the
--    privilege that is actually exploitable today on these tables, since RLS
--    never applies to TRUNCATE).
-- ---------------------------------------------------------------------------
revoke select, insert, update, delete, truncate on
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
from anon;
