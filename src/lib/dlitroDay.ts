/**
 * "Día dlitro": el turno abre a las 13:00 y puede cerrar entre las 03:00 y 05:00 AM
 * del día siguiente. Para reportes agrupamos con corte a las 06:00 AM (hora Chile).
 *
 * - 00:00 → 05:59  → pertenece al día ANTERIOR
 * - 06:00 → 23:59  → pertenece al día actual
 */
export function getDlitroDay(fecha: Date | string = new Date()): string {
  const d = typeof fecha === "string" ? new Date(fecha) : fecha;
  // Convertir a hora Santiago
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});
  const hour = parseInt(parts.hour, 10);
  const dateStr = `${parts.year}-${parts.month}-${parts.day}`;
  if (hour < 6) {
    const prev = new Date(`${dateStr}T12:00:00Z`);
    prev.setUTCDate(prev.getUTCDate() - 1);
    return prev.toISOString().slice(0, 10);
  }
  return dateStr;
}