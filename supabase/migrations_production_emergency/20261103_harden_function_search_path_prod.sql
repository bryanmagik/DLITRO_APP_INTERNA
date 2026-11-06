-- PRODUCCIÓN — HARDENING DE FUNCIONES (search_path + EXECUTE).
--
-- Destino: SOLO producción, ref uwymxjmyasnlmkitzvej ("DLITRO ULTIMATE").
-- NO aplicar en staging (suscxwjloggmbsqdlgpj): staging ya tiene un hardening
-- más estricto (supabase/migrations/20260814042835_harden_function_security.sql,
-- con search_path = '' y cuerpos reescritos con nombres calificados).
-- No mover ni copiar este archivo a supabase/migrations/.
-- Requiere confirmación explícita antes de aplicarse. Rollback:
-- 20261103_harden_function_search_path_prod_ROLLBACK.sql
--
-- MOTIVO
--   Verificado en producción el 2026-11-03: estas 7 funciones de public no tienen
--   search_path fijo, así que resuelven tablas según el search_path de quien las
--   invoca (riesgo de secuestro de objetos vía schema/pg_temp, sobre todo en las
--   SECURITY DEFINER):
--     set_numero_pedido(), set_numero_pedido_online(), descontar_stock_pedido(),
--     restaurar_stock_cancelacion(), log_precio_change(), get_turno_abierto(uuid),
--     calcular_costo_despacho(numeric)
--   Además, is_superadmin(uuid) y get_turno_abierto(uuid) siguen siendo ejecutables
--   por authenticated, y las 5 funciones de trigger son invocables como RPC.
--   Ninguna política RLS, Edge Function ni el frontend las llama directamente (grep
--   del repo el 2026-11-03: solo aparecen en src/integrations/supabase/types.ts).
--
-- POR QUÉ NO search_path = ''
--   En producción los cuerpos usan tablas SIN schema (p. ej. `UPDATE stock_sucursal`,
--   `FROM recetas`, `pedidos`). Con search_path vacío esas referencias fallan y
--   romperían los triggers de pedidos (numeración, descuento y restauración de stock)
--   y el historial de precios. Staging pudo usar '' porque ahí se reescribieron los
--   cuerpos; aquí NO se cambian cuerpos. `public, pg_temp` fija la resolución a
--   public y deja pg_temp al final para que no pueda ocultar objetos.
--   pg_catalog se busca siempre primero de forma implícita (now(), coalesce, etc.).
--
-- QUÉ HACE
--   1. ALTER FUNCTION ... SET search_path = public, pg_temp en las 7 funciones.
--   2. REVOKE EXECUTE FROM PUBLIC, anon, authenticated en is_superadmin(uuid),
--      get_turno_abierto(uuid) y las 5 funciones de trigger.
--      Los triggers siguen disparándose: Postgres valida EXECUTE al crear el
--      trigger, no al dispararlo (staging ya opera así desde 2026-08-14).
--      postgres y service_role conservan EXECUTE.
-- QUÉ NO HACE
--   - No cambia cuerpos de funciones.
--   - No toca permisos de calcular_costo_despacho (solo su search_path).
--   - No mueve pg_trgm fuera de public.
--   - No toca tablas, políticas ni triggers.
--
-- CÓMO VERIFICAR
--   ANTES de aplicar: correr 20261103_harden_function_search_path_prod_VERIFY.sql
--   y guardar la salida (es el snapshot que valida el ROLLBACK). Revisar que las
--   secciones B y C devuelvan 0 filas.
--   DESPUÉS: volver a correr VERIFY. Esperado:
--     - proconfig = {search_path=public, pg_temp} en las 7 funciones.
--     - anon_exec = false y authenticated_exec = false en is_superadmin,
--       get_turno_abierto y las 5 de trigger.
--     - calcular_costo_despacho: permisos sin cambios respecto del snapshot.
--   NO crear pedidos de prueba en producción. Después de aplicar, revisar los
--   siguientes pedidos reales (numero asignado, stock descontado) y los logs de
--   Postgres. Si algo falla, correr el ROLLBACK de inmediato.

begin;

-- Precondición: las 8 firmas deben existir tal cual. Si alguna no existe, abortar.
do $$
declare
  sig text;
begin
  foreach sig in array array[
    'public.set_numero_pedido()',
    'public.set_numero_pedido_online()',
    'public.descontar_stock_pedido()',
    'public.restaurar_stock_cancelacion()',
    'public.log_precio_change()',
    'public.get_turno_abierto(uuid)',
    'public.calcular_costo_despacho(numeric)',
    'public.is_superadmin(uuid)'
  ] loop
    if to_regprocedure(sig) is null then
      raise exception 'Firma no encontrada: % — abortando sin cambios', sig;
    end if;
  end loop;
end $$;

-- 1. search_path fijo (sin cambiar cuerpos).
alter function public.set_numero_pedido()               set search_path = public, pg_temp;
alter function public.set_numero_pedido_online()        set search_path = public, pg_temp;
alter function public.descontar_stock_pedido()          set search_path = public, pg_temp;
alter function public.restaurar_stock_cancelacion()     set search_path = public, pg_temp;
alter function public.log_precio_change()               set search_path = public, pg_temp;
alter function public.get_turno_abierto(uuid)           set search_path = public, pg_temp;
alter function public.calcular_costo_despacho(numeric)  set search_path = public, pg_temp;

-- 2. Cerrar EXECUTE. PUBLIC se revoca también: anon/authenticated heredan de PUBLIC.
revoke execute on function public.is_superadmin(uuid)            from public, anon, authenticated;
revoke execute on function public.get_turno_abierto(uuid)        from public, anon, authenticated;
revoke execute on function public.set_numero_pedido()            from public, anon, authenticated;
revoke execute on function public.set_numero_pedido_online()     from public, anon, authenticated;
revoke execute on function public.descontar_stock_pedido()       from public, anon, authenticated;
revoke execute on function public.restaurar_stock_cancelacion()  from public, anon, authenticated;
revoke execute on function public.log_precio_change()            from public, anon, authenticated;

-- Postcondición: si anon o authenticated conservan EXECUTE por cualquier vía
-- (herencia de otro rol), abortar todo.
do $$
declare
  sig text;
  r text;
begin
  foreach sig in array array[
    'public.is_superadmin(uuid)',
    'public.get_turno_abierto(uuid)',
    'public.set_numero_pedido()',
    'public.set_numero_pedido_online()',
    'public.descontar_stock_pedido()',
    'public.restaurar_stock_cancelacion()',
    'public.log_precio_change()'
  ] loop
    foreach r in array array['anon', 'authenticated'] loop
      if has_function_privilege(r, sig, 'EXECUTE') then
        raise exception '% todavía puede ejecutar % — abortando', r, sig;
      end if;
    end loop;
  end loop;
end $$;

commit;
