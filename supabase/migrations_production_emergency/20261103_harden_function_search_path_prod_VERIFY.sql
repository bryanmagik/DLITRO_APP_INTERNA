-- VERIFICACIÓN de 20261103_harden_function_search_path_prod.sql (solo lectura).
--
-- Correr en producción (uwymxjmyasnlmkitzvej):
--   1. ANTES de aplicar → guardar la salida como snapshot (valida el ROLLBACK).
--   2. DESPUÉS de aplicar → comparar con lo esperado (ver encabezado de la migración).
--   3. Después de un eventual ROLLBACK → debe coincidir con el snapshot del paso 1.
-- No modifica nada.

-- A. Estado de cada función: search_path, SECURITY DEFINER, ACL y EXECUTE efectivo.
select
  f.sig                                                   as funcion,
  p.oid is not null                                       as existe,
  p.prosecdef                                             as security_definer,
  p.proconfig                                             as proconfig,
  p.proacl::text                                          as proacl,
  case when p.oid is null then null
       else has_function_privilege('anon', p.oid, 'EXECUTE') end          as anon_exec,
  case when p.oid is null then null
       else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_exec,
  case when p.oid is null then null
       else has_function_privilege('service_role', p.oid, 'EXECUTE') end  as service_role_exec
from (values
  ('public.set_numero_pedido()'),
  ('public.set_numero_pedido_online()'),
  ('public.descontar_stock_pedido()'),
  ('public.restaurar_stock_cancelacion()'),
  ('public.log_precio_change()'),
  ('public.get_turno_abierto(uuid)'),
  ('public.calcular_costo_despacho(numeric)'),
  ('public.is_superadmin(uuid)')
) as f(sig)
left join pg_proc p on p.oid = to_regprocedure(f.sig)
order by f.sig;

-- B. Precheck: políticas RLS (cualquier schema, incluido storage) que llamen a
--    funciones que se van a revocar. Esperado: 0 filas.
select schemaname, tablename, policyname, cmd, roles
from pg_policies
where coalesce(qual, '') ~* '(is_superadmin|get_turno_abierto|set_numero_pedido|descontar_stock_pedido|restaurar_stock_cancelacion|log_precio_change)'
   or coalesce(with_check, '') ~* '(is_superadmin|get_turno_abierto|set_numero_pedido|descontar_stock_pedido|restaurar_stock_cancelacion|log_precio_change)';

-- C. Precheck: otras funciones SECURITY INVOKER que las llamen en su cuerpo
--    (fallarían para authenticated tras el REVOKE). Esperado: 0 filas.
select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as funcion
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname not in ('pg_catalog', 'information_schema')
  and not p.prosecdef
  and p.prosrc ~* '(is_superadmin|get_turno_abierto)\s*\('
  and p.oid not in (to_regprocedure('public.is_superadmin(uuid)'),
                    to_regprocedure('public.get_turno_abierto(uuid)'));

-- D. Triggers que usan las funciones: deben seguir existiendo y habilitados (tgenabled = 'O').
select c.relname as tabla, t.tgname as trigger, t.tgenabled,
       t.tgfoid::regprocedure as funcion
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
where not t.tgisinternal
  and t.tgfoid in (to_regprocedure('public.set_numero_pedido()'),
                   to_regprocedure('public.set_numero_pedido_online()'),
                   to_regprocedure('public.descontar_stock_pedido()'),
                   to_regprocedure('public.restaurar_stock_cancelacion()'),
                   to_regprocedure('public.log_precio_change()'))
order by c.relname, t.tgname;
