import { Package, Send, UserCheck, Truck, CheckCircle2, FileEdit } from "lucide-react";

export type EstadoLogistica = "borrador" | "enviado" | "asignado" | "en_camino" | "entregado";

export const ESTADO_META: Record<EstadoLogistica, { label: string; cls: string; icon: typeof Package }> = {
  borrador:  { label: "BORRADOR",  cls: "bg-muted text-muted-foreground border-border",       icon: FileEdit },
  enviado:   { label: "ENVIADO",   cls: "bg-info/15 text-info border-info/30",                 icon: Send },
  asignado:  { label: "ASIGNADO",  cls: "bg-warning/15 text-warning border-warning/30",       icon: UserCheck },
  en_camino: { label: "EN CAMINO", cls: "bg-orange-500/15 text-orange-600 border-orange-500/30", icon: Truck },
  entregado: { label: "ENTREGADO", cls: "bg-success/15 text-success border-success/30",       icon: CheckCircle2 },
};

export const TIPOS_INSUMO = ["Preparación", "Toma de pedidos", "Aseo"] as const;
export type TipoInsumo = (typeof TIPOS_INSUMO)[number];

export interface InsumoFull {
  id: string;
  nombre: string;
  unidad: string | null;
  tipo: string;
  formato_mayor?: string | null;
  unidades_por_formato?: number | null;
  ml_por_unidad?: number | null;
  seccion_inventario?: string | null;
  grupo_inventario?: string | null;
  presentacion_inventario?: string | null;
  orden_visual?: number | null;
  orden_presentacion?: number | null;
  tipo_conteo?: string | null;
  paso_conteo?: number | null;
  maximo_conteo?: number | null;
}

export interface StockSucRow {
  insumo_id: string;
  cantidad: number;
  stock_minimo: number | null;
  stock_minimo_observacion?: number | null;
  stock_minimo_critico?: number | null;
}

export const estadoStock = (cantidad: number, observacion: number, critico = 0) => {
  const obs = Number(observacion) || 0;
  const crit = Number(critico) || 0;
  if (crit > 0 && cantidad <= crit)
    return { label: "CRÍTICO", cls: "text-destructive", bg: "bg-destructive/10", dot: "bg-destructive", level: 2 };
  if (obs > 0 && cantidad <= obs)
    return { label: "OBSERVACIÓN", cls: "text-warning", bg: "bg-warning/10", dot: "bg-warning", level: 1 };
  return { label: "OK", cls: "text-success", bg: "", dot: "bg-success", level: 0 };
};

/** Devuelve los mínimos efectivos para una fila, priorizando los nuevos campos. */
export const minimosDe = (row: { stock_minimo?: number | null; stock_minimo_observacion?: number | null; stock_minimo_critico?: number | null } | null | undefined) => {
  const obs = Number(row?.stock_minimo_observacion ?? row?.stock_minimo ?? 0) || 0;
  const crit = Number(row?.stock_minimo_critico ?? 0) || 0;
  return { obs, crit };
};

export const fmtFecha = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    " " + d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
};
