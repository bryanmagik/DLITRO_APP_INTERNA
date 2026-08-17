-- Fix functional bug in private.guard_pedido_update_v2() confirmed on staging-security
-- by supabase/tests/authorization_rls_matrix_v2_guards.sql (case "estado_only -> allowed_value").
--
-- pedidos.vuelto is `GENERATED ALWAYS AS (...) STORED`. Inside a BEFORE UPDATE trigger,
-- NEW.vuelto has not been computed yet (reads as NULL) while OLD.vuelto holds the real
-- stored value, so the column-diff check below always saw a spurious difference and
-- blocked every preparador update -- including a pure, permitted estado-only change.
--
-- Only change: add 'vuelto' to the excluded-column arrays. No other authorization logic,
-- role, policy, or grant is touched. The trigger definition itself is unchanged.

create or replace function private.guard_pedido_update_v2()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare caller_role text := private.current_app_role();
begin
  if caller_role = 'preparador' then
    if (to_jsonb(new) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos','vuelto'])
       is distinct from
       (to_jsonb(old) - array['estado','updated_at','comanda_impresa','tiempo_estimado_minutos','vuelto']) then
      raise exception 'Preparación solo puede actualizar el estado operativo del pedido'
        using errcode = '42501';
    end if;
    if new.estado not in ('en_preparacion','listo') then
      raise exception 'Estado no permitido para Preparación' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
