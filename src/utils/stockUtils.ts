export interface InsumoStockFields {
  unidades_por_formato?: number | null;
  ml_por_unidad?: number | null;
  formato_mayor?: string | null;
  unidad?: string | null;
}

/** DB (ml/gr) → UI (cajas + unidades) */
export function mlACajasUnidades(
  cantidad: number,
  unidades_por_formato: number | null,
  ml_por_unidad: number | null,
): { cajas: number; unidades: number; sobrante: number } {
  const upf = unidades_por_formato ? Number(unidades_por_formato) : 0;
  const ml = ml_por_unidad ? Number(ml_por_unidad) : 0;

  if (!upf && !ml) {
    return { cajas: 0, unidades: Math.floor(cantidad), sobrante: 0 };
  }
  if (!ml) {
    const cajas = Math.floor(cantidad / upf);
    const unidades = cantidad % upf;
    return { cajas, unidades, sobrante: 0 };
  }
  const totalUnidades = Math.floor(cantidad / ml);
  const cajas = upf > 0 ? Math.floor(totalUnidades / upf) : 0;
  const unidades = upf > 0 ? totalUnidades % upf : totalUnidades;
  const sobrante = cantidad % ml;
  return { cajas, unidades, sobrante };
}

/** UI (cajas + unidades) → DB (ml/gr) */
export function cajasUnidadesAMl(
  cajas: number,
  unidades: number,
  unidades_por_formato: number | null,
  ml_por_unidad: number | null,
): number {
  const upf = unidades_por_formato ? Number(unidades_por_formato) : 0;
  const ml = ml_por_unidad ? Number(ml_por_unidad) : 0;

  if (!upf && !ml) {
    return unidades;
  }
  if (!ml) {
    return cajas * upf + unidades;
  }
  return (cajas * upf + unidades) * ml;
}

export function tieneFormatoDual(insumo: InsumoStockFields | null | undefined): boolean {
  return !!(insumo?.unidades_por_formato && Number(insumo.unidades_por_formato) > 0);
}

export function fmtNumCl(n: number): string {
  return new Intl.NumberFormat("es-CL").format(Math.round(n));
}

export interface StockColumnasData {
  cajas: string;
  unidades: string;
  total: string;
  sinStock: boolean;
}

/** Descompone cantidad DB en valores para columnas Cajas / Unidades / Total. */
export function calcStockColumnas(
  cantidad: number,
  insumo: InsumoStockFields | null | undefined,
): StockColumnasData {
  const n = Number(cantidad) || 0;
  const upf = insumo?.unidades_por_formato ? Number(insumo.unidades_por_formato) : 0;
  const ml = insumo?.ml_por_unidad ? Number(insumo.ml_por_unidad) : 0;
  const unidad = insumo?.unidad || "unid";

  if (n <= 0) {
    return { cajas: "—", unidades: "—", total: "Sin stock", sinStock: true };
  }

  if (!upf && !ml) {
    return { cajas: "—", unidades: "—", total: `${fmtNumCl(n)} ${unidad}`, sinStock: false };
  }

  if (!ml && upf) {
    const cajas = Math.floor(n / upf);
    const unidades = n % upf;
    return {
      cajas: cajas > 0 ? String(cajas) : "—",
      unidades: String(unidades),
      total: `${fmtNumCl(n)} unid`,
      sinStock: false,
    };
  }

  const { cajas, unidades } = mlACajasUnidades(n, upf, ml);

  if (!upf) {
    return {
      cajas: "—",
      unidades: String(unidades),
      total: `${fmtNumCl(n)} ${unidad}`,
      sinStock: false,
    };
  }

  return {
    cajas: cajas > 0 ? String(cajas) : "—",
    unidades: String(unidades),
    total: `${fmtNumCl(n)} ${unidad}`,
    sinStock: false,
  };
}

function pluralFormato(fmt: string, count: number): string {
  const lower = fmt.toLowerCase();
  if (count === 1) return lower;
  return /s$/i.test(lower) ? lower : `${lower}s`;
}

/**
 * Formato de display: "2 cajas + 3 unidades".
 * Retorna null si cantidad ≤ 0 (mostrar "Sin stock" en rojo).
 */
export function formatearStockDisplay(
  cantidad: number,
  insumo: InsumoStockFields | null | undefined,
): string | null {
  const n = Number(cantidad) || 0;
  if (n <= 0) return null;

  const upf = insumo?.unidades_por_formato ? Number(insumo.unidades_por_formato) : 0;
  const ml = insumo?.ml_por_unidad ? Number(insumo.ml_por_unidad) : 0;
  const unidad = insumo?.unidad || "unidades";

  if (!upf && !ml) {
    return `${Math.floor(n)} ${unidad}`;
  }

  if (!upf) {
    if (ml) return `${Math.round(n)} ${unidad}`;
    return `${Math.floor(n)} ${unidad}`;
  }

  const { cajas, unidades } = mlACajasUnidades(n, upf, ml);
  const fmt = insumo?.formato_mayor || "cajas";

  if (cajas === 0 && unidades === 0) return null;
  if (cajas === 0) return `${unidades} ${unidad}`;
  if (unidades === 0) return `${cajas} ${pluralFormato(fmt, cajas)}`;
  return `${cajas} ${pluralFormato(fmt, cajas)} + ${unidades} ${unidad}`;
}

/** Texto informativo del formato, ej: "Caja · 750ml/unid" */
export function textoInfoFormato(insumo: InsumoStockFields | null | undefined): string {
  if (!insumo) return "";
  const upf = insumo.unidades_por_formato ? Number(insumo.unidades_por_formato) : 0;
  const ml = insumo.ml_por_unidad ? Number(insumo.ml_por_unidad) : 0;
  const unidad = insumo.unidad || "unidad";

  if (!upf) return unidad;

  const partes: string[] = [insumo.formato_mayor || "Caja"];
  if (ml > 0) partes.push(`${ml}${unidad}/unid`);
  else if (upf > 0) partes.push(`${upf} unid/${(insumo.formato_mayor || "pack").toLowerCase()}`);
  return partes.join(" · ");
}
