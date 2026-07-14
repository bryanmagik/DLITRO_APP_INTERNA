import type { InsumoFull } from "./logistica";
import {
  cajasUnidadesAMl,
  calcStockColumnas,
  fmtNumCl,
  formatearStockDisplay,
  mlACajasUnidades,
  type InsumoStockFields,
} from "@/utils/stockUtils";

/** Insumo subset with the format-related fields. */
export type InsumoFormato = Pick<
  InsumoFull,
  "formato_mayor" | "unidades_por_formato" | "ml_por_unidad" | "unidad"
>;

export function formatearCantidad(cantidadBase: number, insumo: InsumoFormato | null | undefined): string {
  return formatearStockDisplay(cantidadBase, insumo) ?? `0 ${insumo?.unidad || "unidades"}`;
}

export function calcularCantidadBase(
  formato: number,
  sueltas: number,
  insumo: InsumoFormato | null | undefined,
): number {
  return cajasUnidadesAMl(
    Number(formato) || 0,
    Number(sueltas) || 0,
    insumo?.unidades_por_formato ?? null,
    insumo?.ml_por_unidad ?? null,
  );
}

export function nombreFormato(insumo: InsumoFormato | null | undefined): string {
  return insumo?.formato_mayor || "";
}

export function tieneFormatoMayor(insumo: InsumoFormato | null | undefined): boolean {
  return !!(insumo?.formato_mayor && insumo?.unidades_por_formato && insumo.unidades_por_formato > 0);
}

export function nombreUnidad(insumo: InsumoFormato | null | undefined): string {
  return insumo?.unidad || "unidades";
}

export function formatearStockLogistico(
  cantidad: number,
  insumo: InsumoFormato | null | undefined,
): string | null {
  return formatearStockDisplay(cantidad, insumo);
}

export function formatearMl(
  cantidadBase: number,
  insumo: InsumoFormato | null | undefined,
): string | null {
  if (!insumo?.ml_por_unidad || Number(insumo.ml_por_unidad) <= 0) return null;
  const n = Number(cantidadBase) || 0;
  const ml = Math.round(n);
  return `${new Intl.NumberFormat("es-CL").format(ml)} ml`;
}

export function formatearPackIndividual(
  cantidadBase: number,
  insumo: InsumoFormato | null | undefined,
): string {
  return formatearStockDisplay(cantidadBase, insumo) ?? "0 Individual";
}

export { mlACajasUnidades, cajasUnidadesAMl, formatearStockDisplay, calcStockColumnas, fmtNumCl };
export type { InsumoStockFields };
