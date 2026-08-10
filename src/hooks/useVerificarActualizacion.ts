import { useEffect, useRef } from "react";
import { useAuthStore } from "@/stores/authStore";
import { verificarActualizacion } from "@/lib/verificarActualizacion";

/** Tras login (sesión + perfil), chequear actualización una vez por sesión. */
export function useVerificarActualizacion() {
  const session = useAuthStore((s) => s.session);
  const perfil = useAuthStore((s) => s.perfil);
  const done = useRef(false);

  useEffect(() => {
    if (!session || !perfil) {
      done.current = false;
      return;
    }
    if (done.current) return;
    done.current = true;
    void verificarActualizacion();
  }, [session, perfil]);
}
