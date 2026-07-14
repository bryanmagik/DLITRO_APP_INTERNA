import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PedidosOrigen } from "@/pages/turno/pedidosOrigenConfig";

/**
 * Cuenta en tiempo real los pedidos externos pendientes de confirmación
 * (online, NELY, etc.) para la sucursal del tomador.
 */
export function usePedidosOrigenPendientes(sucursalId?: string | null, origen: PedidosOrigen = "online") {
  const [count, setCount] = useState(0);
  const [nuevoTick, setNuevoTick] = useState(0);

  useEffect(() => {
    if (!sucursalId) { setCount(0); return; }
    let cancelled = false;

    const refresh = async () => {
      const { count: c } = await supabase
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("sucursal_id", sucursalId)
        .eq("origen", origen)
        .eq("estado_confirmacion", "pendiente_confirmacion");
      if (!cancelled) setCount(c ?? 0);
    };
    refresh();

    const ch = supabase
      .channel(`pedidos-${origen}-${sucursalId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `origen=eq.${origen}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as {
            sucursal_id?: string;
            origen?: string;
            estado_confirmacion?: string;
          } | undefined;
          if (row?.sucursal_id !== sucursalId || row?.origen !== origen) return;

          const nuevoEs = (payload.new as { estado_confirmacion?: string } | undefined)?.estado_confirmacion;
          const viejoEs = (payload.old as { estado_confirmacion?: string } | undefined)?.estado_confirmacion;
          const esNuevo =
            payload.eventType === "INSERT" &&
            nuevoEs === "pendiente_confirmacion";
          if (esNuevo) setNuevoTick((t) => t + 1);
          if (nuevoEs !== viejoEs || payload.eventType === "INSERT") refresh();
        },
      )
      .subscribe();

    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, [sucursalId, origen]);

  return { count, nuevoTick };
}

/** @deprecated Usar usePedidosOrigenPendientes(sucursalId, "online") */
export function usePedidosOnlinePendientes(sucursalId?: string | null) {
  return usePedidosOrigenPendientes(sucursalId, "online");
}
