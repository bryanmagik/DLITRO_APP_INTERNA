-- PRODUCTION EMERGENCY HOTFIX — P0-A ONLY.
--
-- Target: production project ref uwymxjmyasnlmkitzvej ("main" branch / "DLITRO ULTIMATE").
-- This file is intentionally OUTSIDE supabase/migrations/ and must never be applied to
-- staging-security (suscxwjloggmbsqdlgpj) — that project already has a superseding,
-- fully-scoped RLS v2 model (see supabase/migrations/20260816014215_authorization_rls_matrix_v2.sql).
-- Do not move or copy this file into supabase/migrations/.
--
-- Scope (P0-A, authorized 2026-08-17): reduce the CRITICAL unauthenticated exposure
-- found in the read-only production audit. Nothing else. Explicitly NOT included:
--   - recibir-pedido-online (needs a business decision on its real caller first)
--   - P1 (authenticated-side RLS/policy work)
--   - RLS v2 promotion
--   - any frontend change
--   - any change to authenticated's existing policies
--   - any change to service_role
--
-- Precheck evidence (read-only queries against production, same session):
--   - All 12 tables confirmed present in public schema.
--   - public.is_admin(uuid), public.is_superadmin(uuid), public.get_user_rol(uuid),
--     public.get_user_sucursal(uuid) confirmed present with exact (uuid) signature.
--   - public.clientes confirmed relrowsecurity = false, relforcerowsecurity = false,
--     zero policies, zero consumers found in the production frontend or Edge Functions.
--   - anon and authenticated both currently hold DELETE, INSERT, REFERENCES, SELECT,
--     TRIGGER, TRUNCATE, UPDATE on all 12 tables (REFERENCES and TRIGGER are NOT
--     touched by this hotfix -- out of the authorized P0-A scope).
--   - No Edge Function (recibir-pedido-online, recibir-pedido-nely, crear-usuario)
--     uses the anon key for table reads/writes on these 12 tables; the two that use
--     anon at all use it only to verify a caller's JWT via the Auth API (crear-usuario),
--     which does not require any of the grants revoked here.

-- ---------------------------------------------------------------------------
-- 1. Revoke anon's direct CRUD + TRUNCATE on the 12 critical tables.
-- ---------------------------------------------------------------------------
revoke select, insert, update, delete, truncate on
  public.pedidos,
  public.pedido_items,
  public.usuarios,
  public.turnos,
  public.sucursales,
  public.categorias,
  public.productos,
  public.stock_sucursal,
  public.turno_despachadores,
  public.gastos_turno,
  public.pagos_turno,
  public.clientes
from anon;

-- ---------------------------------------------------------------------------
-- 2. Revoke TRUNCATE from authenticated on the same 12 tables. PostgREST has no
--    mechanism to emit TRUNCATE, so this removes dead-weight privilege only.
-- ---------------------------------------------------------------------------
revoke truncate on
  public.pedidos,
  public.pedido_items,
  public.usuarios,
  public.turnos,
  public.sucursales,
  public.categorias,
  public.productos,
  public.stock_sucursal,
  public.turno_despachadores,
  public.gastos_turno,
  public.pagos_turno,
  public.clientes
from authenticated;

-- ---------------------------------------------------------------------------
-- 3. clientes: deny-by-default. No policy is added on purpose -- RLS enabled
--    with zero policies denies all access to non-owner roles, which is correct
--    here since zero current consumers were found for this table.
-- ---------------------------------------------------------------------------
alter table public.clientes enable row level security;

-- ---------------------------------------------------------------------------
-- 4. Revoke anon's EXECUTE on the legacy identity-enumeration helpers.
--    authenticated's EXECUTE on these is untouched (out of P0-A scope; these
--    functions are used inside existing authenticated-side policies).
-- ---------------------------------------------------------------------------
revoke execute on function public.is_admin(uuid) from anon;
revoke execute on function public.is_superadmin(uuid) from anon;
revoke execute on function public.get_user_rol(uuid) from anon;
revoke execute on function public.get_user_sucursal(uuid) from anon;
