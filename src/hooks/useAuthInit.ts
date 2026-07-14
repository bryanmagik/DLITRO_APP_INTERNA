import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore, type UsuarioPerfil } from "@/stores/authStore";

/**
 * Inicializa el listener de auth y carga el perfil del usuario desde la tabla `usuarios`.
 * Debe montarse una vez en el árbol de la app (en App.tsx).
 */
export function useAuthInit() {
  const { setSession, setPerfil, setLoading, reset } = useAuthStore();

  useEffect(() => {
    let active = true;

    const cargarPerfil = async (userId: string) => {
      const { data: perfil, error } = await supabase
        .from("usuarios")
        .select("id, nombre, apellido, nombre_completo, rol, sucursal_id, activo, telefono, rut")
        .eq("id", userId)
        .maybeSingle();

      if (!active) return;
      if (error || !perfil) {
        setPerfil(null);
        return;
      }

      let sucursalNombre: string | null = null;
      if (perfil.sucursal_id) {
        const { data: suc } = await supabase
          .from("sucursales")
          .select("nombre")
          .eq("id", perfil.sucursal_id)
          .maybeSingle();
        sucursalNombre = suc?.nombre ?? null;
      }
      setPerfil(perfil as UsuarioPerfil, sucursalNombre);
    };

    // Listener primero
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        // Diferimos para evitar deadlocks
        setTimeout(() => cargarPerfil(session.user.id), 0);
      } else {
        reset();
      }
    });

    // Luego sesión actual
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        cargarPerfil(session.user.id).finally(() => active && setLoading(false));
      } else {
        setLoading(false);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, [setSession, setPerfil, setLoading, reset]);
}