import { Store, Truck, Car, Bike, DoorOpen } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TipoPedido = "local" | "delivery" | "uber" | "rappi" | "puerta" | "despacho" | "retiro";

export const TIPO_META: Record<TipoPedido, {
  label: string; short: string; icon: LucideIcon;
  pillCls: string; badgeCls: string;
  esExterno: boolean; conDireccion: boolean; conPago: boolean;
}> = {
  local:    { label: "Local",    short: "LOC", icon: Store, pillCls: "bg-blue-500 text-white",   badgeCls: "bg-blue-500/15 text-blue-400 border-blue-500/40",   esExterno: false, conDireccion: false, conPago: true },
  retiro:   { label: "Local",    short: "LOC", icon: Store, pillCls: "bg-blue-500 text-white",   badgeCls: "bg-blue-500/15 text-blue-400 border-blue-500/40",   esExterno: false, conDireccion: false, conPago: true },
  delivery: { label: "Delivery", short: "DEL", icon: Truck, pillCls: "bg-success text-white",    badgeCls: "bg-success/15 text-success border-success/40",      esExterno: false, conDireccion: true,  conPago: true },
  despacho: { label: "Delivery", short: "DEL", icon: Truck, pillCls: "bg-success text-white",    badgeCls: "bg-success/15 text-success border-success/40",      esExterno: false, conDireccion: true,  conPago: true },
  uber:     { label: "Uber",     short: "UBR", icon: Car,   pillCls: "bg-zinc-900 text-white border border-white/20", badgeCls: "bg-zinc-900 text-white border-white/20",    esExterno: true,  conDireccion: false, conPago: false },
  rappi:    { label: "Rappi",    short: "RAP", icon: Bike,  pillCls: "bg-orange-500 text-white", badgeCls: "bg-orange-500/15 text-orange-400 border-orange-500/40", esExterno: true,  conDireccion: false, conPago: false },
  puerta:   { label: "Puerta",   short: "PUE", icon: DoorOpen, pillCls: "bg-purple-500 text-white", badgeCls: "bg-purple-500/15 text-purple-400 border-purple-500/40", esExterno: false, conDireccion: false, conPago: true },
};

export const tipoMeta = (t: string | null | undefined) => TIPO_META[(t as TipoPedido) ?? "local"] ?? TIPO_META.local;
