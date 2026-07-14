/** Porcentaje de diferencia entre contado y sistema. */
export function pctDiferencia(cantidadIdeal: number, cantidadReal: number): number {
  const ideal = Number(cantidadIdeal) || 0;
  const real = Number(cantidadReal) || 0;
  if (ideal === 0) return real !== 0 ? 100 : 0;
  return Math.abs((real - ideal) / ideal) * 100;
}

export type NivelDiferencia = "ok" | "warn" | "crit";

export function nivelDiferencia(pct: number): NivelDiferencia {
  if (pct < 0.5) return "ok";
  if (pct < 10) return "warn";
  return "crit";
}

export const ESTILO_NIVEL_DIF: Record<NivelDiferencia, { cls: string; bg: string; label: string }> = {
  ok: { cls: "text-success", bg: "bg-success/10", label: "Sin diferencia" },
  warn: { cls: "text-warning", bg: "bg-warning/10", label: "Diferencia < 10%" },
  crit: { cls: "text-destructive", bg: "bg-destructive/10", label: "Diferencia ≥ 10%" },
};

const MS_24H = 24 * 60 * 60 * 1000;

export function esInventarioDesactualizado(ultimoCierre: string | null | undefined): boolean {
  if (!ultimoCierre) return true;
  return Date.now() - new Date(ultimoCierre).getTime() > MS_24H;
}

export function fmtUltimoCierre(ultimoCierre: string | null | undefined): string {
  if (!ultimoCierre) return "Sin cierre registrado";
  return new Date(ultimoCierre).toLocaleString("es-CL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
