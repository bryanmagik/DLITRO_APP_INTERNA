/** Descuento por jarros retornables: 4 jarros = 1 trago gratis (solo precio base, sin extras). */

export type ItemParaDescuentoJarros = {
  cantidad: number;
  /** Precio cobrado en la línea (puede incluir extras). */
  precio_unitario: number;
  /** Precio del producto en catálogo, sin extras. */
  precio_base?: number | null;
  notas?: string | null;
};

export function precioBaseJarros(it: ItemParaDescuentoJarros): number {
  const base = it.precio_base != null ? Number(it.precio_base) : NaN;
  if (Number.isFinite(base) && base > 0) return base;
  const pu = Number(it.precio_unitario) || 0;
  return pu > 0 ? pu : 0;
}

/**
 * Calcula descuento por jarros.
 * - Cada 4 jarros → 1 trago gratis = descuento del precio_base (sin extras)
 * - Sobrantes (jarros % 4) → $1.000 c/u (fijo)
 * Los tragos gratis se eligen por mayor precio_base.
 */
export function calcularDescuentoJarros(
  jarros: number,
  items: ItemParaDescuentoJarros[],
): {
  tragosGratis: number;
  sobrantes: number;
  descuentoTragos: number;
  descuentoSobrantes: number;
  total: number;
} {
  const j = Math.max(0, Math.floor(Number(jarros) || 0));
  if (j <= 0) {
    return { tragosGratis: 0, sobrantes: 0, descuentoTragos: 0, descuentoSobrantes: 0, total: 0 };
  }

  const itemsPagos = items.filter((it) => {
    if (/\[PROMO\s+JARROS\]/i.test(it.notas ?? "")) return false;
    return precioBaseJarros(it) > 0 && Number(it.precio_unitario) > 0;
  });

  const totalProductos = itemsPagos.reduce((acc, it) => acc + Math.max(0, Math.floor(Number(it.cantidad) || 0)), 0);
  const tragosGratis = Math.min(Math.floor(j / 4), totalProductos);
  const sobrantes = j % 4;

  const preciosBase: number[] = [];
  for (const it of itemsPagos) {
    const base = precioBaseJarros(it);
    const qty = Math.max(0, Math.floor(Number(it.cantidad) || 0));
    for (let i = 0; i < qty; i++) preciosBase.push(base);
  }
  preciosBase.sort((a, b) => b - a);

  const descuentoTragos = preciosBase.slice(0, tragosGratis).reduce((a, p) => a + p, 0);
  const descuentoSobrantes = sobrantes * 1000;

  return {
    tragosGratis,
    sobrantes,
    descuentoTragos,
    descuentoSobrantes,
    total: descuentoTragos + descuentoSobrantes,
  };
}
