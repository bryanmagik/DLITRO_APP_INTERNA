import { formatearStockDisplay, type InsumoStockFields } from "@/utils/stockUtils";

export type TipoConteoInventario = "entero" | "decimal" | "porcentaje";

export interface ConfigInventarioFields {
  nombre: string;
  tipo?: string | null;
  seccion_inventario?: string | null;
  grupo_inventario?: string | null;
  presentacion_inventario?: string | null;
  orden_visual?: number | null;
  orden_presentacion?: number | null;
  tipo_conteo?: string | null;
  paso_conteo?: number | null;
  maximo_conteo?: number | null;
}

export const SECCION_GENERAL = "Inventario general";
export const SECCION_ASEO = "Útiles de aseo";

export function seccionInventario(item: ConfigInventarioFields): string {
  if (item.seccion_inventario?.trim()) return item.seccion_inventario.trim();
  return item.tipo === "Aseo" ? SECCION_ASEO : SECCION_GENERAL;
}

export function grupoInventario(item: ConfigInventarioFields): string {
  return item.grupo_inventario?.trim() || item.nombre;
}

export function presentacionInventario(item: ConfigInventarioFields): string | null {
  return item.presentacion_inventario?.trim() || null;
}

const numeroOrden = (value: number | null | undefined) =>
  Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : Number.MAX_SAFE_INTEGER;

export function compararInventario<T extends ConfigInventarioFields>(a: T, b: T): number {
  const seccionA = seccionInventario(a) === SECCION_ASEO ? 1 : 0;
  const seccionB = seccionInventario(b) === SECCION_ASEO ? 1 : 0;
  return seccionA - seccionB
    || numeroOrden(a.orden_visual) - numeroOrden(b.orden_visual)
    || numeroOrden(a.orden_presentacion) - numeroOrden(b.orden_presentacion)
    || grupoInventario(a).localeCompare(grupoInventario(b), "es")
    || a.nombre.localeCompare(b.nombre, "es");
}

export function ordenarInventario<T extends ConfigInventarioFields>(items: readonly T[]): T[] {
  return [...items].sort(compararInventario);
}

export interface GrupoInventario<T> {
  seccion: string;
  grupos: Array<{ nombre: string; items: T[] }>;
}

export function agruparInventario<T extends ConfigInventarioFields>(items: readonly T[]): GrupoInventario<T>[] {
  const secciones = new Map<string, Map<string, T[]>>();
  for (const item of ordenarInventario(items)) {
    const seccion = seccionInventario(item);
    const grupo = grupoInventario(item);
    if (!secciones.has(seccion)) secciones.set(seccion, new Map());
    const grupos = secciones.get(seccion)!;
    if (!grupos.has(grupo)) grupos.set(grupo, []);
    grupos.get(grupo)!.push(item);
  }
  return [...secciones].map(([seccion, grupos]) => ({
    seccion,
    grupos: [...grupos].map(([nombre, groupedItems]) => ({ nombre, items: groupedItems })),
  }));
}

export interface ResultadoCantidad {
  valor: number | null;
  error: string | null;
}

export function validarCantidadInventario(
  raw: string,
  tipo: TipoConteoInventario = "entero",
  maximo?: number | null,
): ResultadoCantidad {
  const texto = raw.trim().replace(",", ".");
  if (texto === "") return { valor: null, error: null };
  const valor = Number(texto);
  if (!Number.isFinite(valor)) return { valor: null, error: "Ingresa una cantidad válida" };
  if (valor < 0) return { valor: null, error: "La cantidad no puede ser negativa" };
  if (tipo === "entero" && !Number.isInteger(valor)) {
    return { valor: null, error: "Esta presentación requiere un número entero" };
  }
  const limite = tipo === "porcentaje" ? 100 : maximo;
  if (limite != null && valor > limite) {
    return { valor: null, error: `El máximo permitido es ${limite}` };
  }
  return { valor, error: null };
}

export const calcCantidadReal = (row: { cantidadReal: number }) => row.cantidadReal;
export const filaCompleta = (row: { contado: boolean }) => row.contado;
export const conteoTextoRow = (row: { cantidadReal: number } & InsumoStockFields) =>
  formatearStockDisplay(row.cantidadReal, row) ?? "0";

export const INVENTARIO_SELECT = "id,nombre,unidad,tipo,formato_mayor,unidades_por_formato,ml_por_unidad,seccion_inventario,grupo_inventario,presentacion_inventario,orden_visual,orden_presentacion,tipo_conteo,paso_conteo,maximo_conteo" as const;
