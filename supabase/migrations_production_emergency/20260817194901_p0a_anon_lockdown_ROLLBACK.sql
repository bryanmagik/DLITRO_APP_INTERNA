-- MANUAL EMERGENCY ROLLBACK for 20260817194901_p0a_anon_lockdown.sql.
--
-- This is NOT a migration. Do not place it in supabase/migrations/ and do not
-- let any automated tool (`supabase db push`, CI, etc.) apply it. It exists only
-- to be run by hand, statement by statement if needed, against production
-- (uwymxjmyasnlmkitzvej) if the P0-A hotfix causes an unexpected regression.
--
-- It restores EXACTLY the grants/state that existed immediately before P0-A was
-- applied (confirmed by the same precheck snapshot used to write the hotfix):
-- anon held DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on all
-- 12 tables; authenticated held the same set including TRUNCATE; clientes had
-- RLS disabled; anon had EXECUTE on the 4 legacy helpers. REFERENCES and TRIGGER
-- were never touched by the hotfix, so they are not part of this rollback.
--
-- Using this rollback re-opens the CRITICAL exposure the hotfix was meant to
-- close. Only run it if the hotfix itself is confirmed to be causing a worse
-- operational problem than the exposure it closes, and only until a corrected
-- hotfix can be prepared.

-- ---------------------------------------------------------------------------
-- 1. Restore anon's direct CRUD + TRUNCATE on the 12 critical tables.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete, truncate on
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
to anon;

-- ---------------------------------------------------------------------------
-- 2. Restore TRUNCATE to authenticated on the same 12 tables.
-- ---------------------------------------------------------------------------
grant truncate on
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
to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Restore clientes to its pre-hotfix state (RLS disabled).
-- ---------------------------------------------------------------------------
alter table public.clientes disable row level security;

-- ---------------------------------------------------------------------------
-- 4. Restore anon's EXECUTE on the legacy identity-enumeration helpers.
-- ---------------------------------------------------------------------------
grant execute on function public.is_admin(uuid) to anon;
grant execute on function public.is_superadmin(uuid) to anon;
grant execute on function public.get_user_rol(uuid) to anon;
grant execute on function public.get_user_sucursal(uuid) to anon;
