export const COSTO_DESPACHO_MAXIMO = 100_000;

export const MOTIVOS_AJUSTE_DESPACHO = [
  "Desvío o calle cerrada",
  "Ruta real más larga",
  "Acceso complejo",
  "Tarifa acordada con el cliente",
  "Corrección de digitación",
  "Otro",
] as const;

export type MotivoAjusteDespacho = typeof MOTIVOS_AJUSTE_DESPACHO[number];

export function validarCostoDespacho(valor: string): number | null {
  if (!/^\d+$/.test(valor.trim())) return null;
  const costo = Number(valor);
  return Number.isSafeInteger(costo) && costo <= COSTO_DESPACHO_MAXIMO ? costo : null;
}

export function construirMotivoAjuste(motivo: string, detalle: string): string {
  const limpio = motivo.trim();
  const detalleLimpio = detalle.trim();
  if (!limpio) return "";
  if (limpio === "Otro") return detalleLimpio;
  return detalleLimpio ? `${limpio}: ${detalleLimpio}` : limpio;
}

export function validarMotivoAjuste(
  costo: number,
  costoCalculado: number,
  motivo: string,
  detalle: string,
): string | null {
  if (costo === costoCalculado) return null;
  if (!motivo) return "Selecciona el motivo del ajuste.";
  if (motivo === "Otro" && !detalle.trim()) return "Describe el motivo del ajuste.";
  if (construirMotivoAjuste(motivo, detalle).length > 500) return "El motivo no puede superar 500 caracteres.";
  return null;
}
