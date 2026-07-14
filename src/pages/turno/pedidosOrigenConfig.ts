import type { LucideIcon } from "lucide-react";
import { Globe, Smartphone } from "lucide-react";

export type PedidosOrigen = "online" | "nely";

export interface PedidosOrigenConfig {
  origen: PedidosOrigen;
  icon: LucideIcon;
  pedidoLabel: string;
  bannerNuevo: string;
  vacioBandeja: string;
  vacioHistorial: string;
  dialogCancelarTitulo: string;
}

export const PEDIDOS_ONLINE_CONFIG: PedidosOrigenConfig = {
  origen: "online",
  icon: Globe,
  pedidoLabel: "Pedido online",
  bannerNuevo: "🌐 Nuevo pedido online recibido",
  vacioBandeja: "No hay pedidos online pendientes. Cuando lleguen aparecerán aquí.",
  vacioHistorial: "Sin pedidos online procesados aún.",
  dialogCancelarTitulo: "Cancelar pedido online",
};

export const PEDIDOS_NELY_CONFIG: PedidosOrigenConfig = {
  origen: "nely",
  icon: Smartphone,
  pedidoLabel: "Pedido NELY",
  bannerNuevo: "📱 Nuevo pedido NELY recibido",
  vacioBandeja: "No hay pedidos NELY pendientes. Cuando lleguen aparecerán aquí.",
  vacioHistorial: "Sin pedidos NELY procesados aún.",
  dialogCancelarTitulo: "Cancelar pedido NELY",
};
