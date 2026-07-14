import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Check, Clock, Loader2, MapPin, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

interface PedidoSeguimiento {
  id: string;
  numero_pedido: number | null;
  cliente_nombre: string;
  tipo: string;
  estado: string;
  estado_confirmacion: string;
  tiempo_estimado_minutos: number | null;
  motivo_rechazo: string | null;
  created_at: string | null;
}

function labelTiempo(minutos: number | null): string | null {
  if (minutos === null || minutos === undefined) return null;
  if (minutos === 0) return "Inmediato";
  return `${minutos} min`;
}

function estadoCliente(p: PedidoSeguimiento): { titulo: string; detalle?: string; tone: "pending" | "ok" | "warn" | "error" } {
  if (p.estado_confirmacion === "pendiente_confirmacion") {
    return { titulo: "Esperando confirmación", detalle: "La sucursal está revisando tu pedido.", tone: "pending" };
  }
  if (p.estado_confirmacion === "rechazado" || p.estado === "cancelado") {
    return {
      titulo: "Pedido cancelado",
      detalle: p.motivo_rechazo ?? "La sucursal no pudo tomar tu pedido.",
      tone: "error",
    };
  }
  const tiempo = labelTiempo(p.tiempo_estimado_minutos);
  if (p.estado === "entregado") {
    return { titulo: "Entregado", detalle: tiempo ? `Tiempo estimado al confirmar: ${tiempo}` : undefined, tone: "ok" };
  }
  if (p.estado === "listo" || p.estado === "en_despacho") {
    return {
      titulo: p.estado === "listo" ? "Listo" : "En camino",
      detalle: tiempo ? `Tiempo estimado: ${tiempo}` : undefined,
      tone: "ok",
    };
  }
  return {
    titulo: "En preparación",
    detalle: tiempo
      ? p.tiempo_estimado_minutos === 0
        ? "Tu pedido se prepara de inmediato."
        : `Tiempo estimado de preparación: ${tiempo}`
      : undefined,
    tone: "warn",
  };
}

export default function SeguimientoPedidoPage() {
  const { pedidoId } = useParams<{ pedidoId: string }>();
  const [pedido, setPedido] = useState<PedidoSeguimiento | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = async () => {
    if (!pedidoId) return;
    const { data, error: err } = await supabase.rpc("get_seguimiento_pedido", { p_pedido_id: pedidoId });

    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    if (!data) {
      setError("No encontramos este pedido.");
      setLoading(false);
      return;
    }
    setPedido(data as PedidoSeguimiento);
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    if (!pedidoId) return;
    const id = setInterval(cargar, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidoId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando pedido…
      </div>
    );
  }

  if (error || !pedido) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-md w-full bg-card border border-border rounded-xl p-8 text-center space-y-2">
          <X className="h-10 w-10 text-destructive mx-auto" />
          <h1 className="font-display text-2xl">Pedido no disponible</h1>
          <p className="text-muted-foreground text-sm">{error ?? "Verificá el enlace de seguimiento."}</p>
        </div>
      </div>
    );
  }

  const info = estadoCliente(pedido);
  const tiempo = labelTiempo(pedido.tiempo_estimado_minutos);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-primary/10 px-6 py-4 border-b border-border">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">Seguimiento de pedido</p>
          <h1 className="font-display text-3xl text-foreground mt-1">
            {pedido.numero_pedido != null ? `#${pedido.numero_pedido}` : "Pedido online"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{pedido.cliente_nombre}</p>
        </div>

        <div className="p-6 space-y-5">
          <div className="flex items-start gap-3">
            {info.tone === "error" ? (
              <X className="h-6 w-6 text-destructive shrink-0 mt-0.5" />
            ) : info.tone === "pending" ? (
              <Clock className="h-6 w-6 text-warning shrink-0 mt-0.5" />
            ) : (
              <Check className="h-6 w-6 text-success shrink-0 mt-0.5" />
            )}
            <div>
              <h2 className="font-semibold text-lg">{info.titulo}</h2>
              {info.detalle && <p className="text-sm text-muted-foreground mt-1">{info.detalle}</p>}
            </div>
          </div>

          {pedido.estado_confirmacion === "confirmado" && tiempo && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary shrink-0" />
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Tiempo estimado</p>
                <p className="font-bold text-xl text-foreground">
                  {pedido.tiempo_estimado_minutos === 0 ? "⚡ Inmediato" : `${tiempo}`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {pedido.tipo === "retiro" || pedido.tipo === "local"
                    ? "Tiempo para retirar en sucursal."
                    : "Tiempo aproximado de preparación y despacho."}
                </p>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className="capitalize">{pedido.tipo}</Badge>
            <Badge variant="outline" className="capitalize">{pedido.estado.replace(/_/g, " ")}</Badge>
          </div>

          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <MapPin className="h-3 w-3" />
            Esta página se actualiza automáticamente cada pocos segundos.
          </div>
        </div>
      </div>
    </div>
  );
}
