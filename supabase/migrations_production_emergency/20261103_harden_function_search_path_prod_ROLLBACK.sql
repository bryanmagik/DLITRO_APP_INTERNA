-- ROLLBACK de 20261103_harden_function_search_path_prod.sql
--
-- Destino: SOLO producción, ref uwymxjmyasnlmkitzvej. Requiere confirmación explícita.
--
-- Objetivo: dejar search_path y EXECUTE como estaban ANTES del hardening.
--
-- IMPORTANTE — comparar con el snapshot previo antes de correr esto.
--   El ACL exacto de producción no está en el repo (el dump inicial del repo es de
--   staging). Los GRANT de abajo reconstruyen el estado previo a partir de la
--   evidencia del repo:
--     - Funciones de trigger: nunca se tocaron en producción → permisos por defecto
--       de Supabase: PUBLIC, anon, authenticated (+ postgres, service_role).
--     - is_superadmin(uuid): el parche p0a (20260817194901_p0a_anon_lockdown.sql)
--       revocó EXECUTE a anon; authenticated lo conserva. PUBLIC no tiene EXECUTE
--       (proacl de producción del 2026-11-03, ver sección 2).
--     - get_turno_abierto(uuid): 20260818132354_rls_v2_production_specific.sql
--       revocó EXECUTE a anon y a PUBLIC; authenticated lo conserva.
--   Por eso NO se devuelve EXECUTE a anon en is_superadmin ni en get_turno_abierto:
--   hacerlo reabriría lo que se cerró en agosto, no "volvería a como estaba hoy".
--   Si la columna proacl del snapshot (VERIFY, sección A) difiere de lo asumido
--   aquí, ajustar los GRANT de abajo antes de ejecutar.

begin;

-- 1. Quitar el search_path fijo (las funciones vuelven a usar el del invocador).
alter function public.set_numero_pedido()               reset search_path;
alter function public.set_numero_pedido_online()        reset search_path;
alter function public.descontar_stock_pedido()          reset search_path;
alter function public.restaurar_stock_cancelacion()     reset search_path;
alter function public.log_precio_change()               reset search_path;
alter function public.get_turno_abierto(uuid)           reset search_path;
alter function public.calcular_costo_despacho(numeric)  reset search_path;

-- 2. Restaurar EXECUTE.
-- Funciones de trigger: permisos por defecto.
grant execute on function public.set_numero_pedido()            to public, anon, authenticated;
grant execute on function public.set_numero_pedido_online()     to public, anon, authenticated;
grant execute on function public.descontar_stock_pedido()       to public, anon, authenticated;
grant execute on function public.restaurar_stock_cancelacion()  to public, anon, authenticated;
grant execute on function public.log_precio_change()            to public, anon, authenticated;

-- is_superadmin: solo authenticated; anon sin grant (p0a) y sin PUBLIC.
-- proacl real en producción (verificado el 2026-11-03, antes del hardening):
--   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
-- Sin entrada "=X/" → PUBLIC no tenía EXECUTE, por eso no se le devuelve.
grant execute on function public.is_superadmin(uuid) to authenticated;

-- get_turno_abierto: solo authenticated (anon y PUBLIC revocados en agosto).
grant execute on function public.get_turno_abierto(uuid) to authenticated;

commit;
