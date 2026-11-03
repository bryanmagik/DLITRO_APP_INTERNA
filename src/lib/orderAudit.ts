export const AUDIT_EVENTS: Record<string, string> = {
  pedido_creado: "Pedido creado", pedido_modificado: "Pedido modificado",
  pedido_cancelado: "Pedido cancelado", pedido_eliminado: "Pedido eliminado",
  producto_agregado: "Producto agregado", producto_modificado: "Producto modificado",
  producto_retirado: "Producto retirado", pago_registrado: "Pago registrado",
  pago_modificado: "Pago modificado", pago_eliminado: "Pago eliminado",
  pedido_corregido_post_cierre: "Corrección después de entrega",
  pagos_corregidos_post_cierre: "Corrección de pagos después de entrega",
};

export interface OrderAuditEvent {
  id: string; pedido_ref: string | null; pedido_id: string | null;
  turno_id: string | null; numero_pedido: number | null; tomador_id: string | null;
  usuario_id: string | null; actor_nombre: string | null;
  sucursal_id: string | null; sucursal_nombre: string | null;
  sucursal_resuelta_id?: string | null; sucursal_resuelta_nombre?: string | null; sucursal_recuperada?: boolean;
  estado_pedido: string | null; campo: string; campos: string[] | null;
  tipo_evento: string | null; valor_anterior: string | null; valor_nuevo: string | null;
  motivo: string | null; origen_evento: string; created_at: string;
}
export interface OrderAuditResult {
  total: number; creados: number; cancelados: number; modificados: number;
  eventos: OrderAuditEvent[]; cobertura_desde: string | null;
}
export interface OrderAuditCard {
  tarjeta_id: string; pedido_ref: string | null; jornada: string | null;
  numero_pedido: number | null; sucursal_nombre: string;
  ultimo_movimiento: string; eventos_coincidentes: number;
  jornada_recuperada: boolean; jornada_estimada: boolean;
}
export interface OrderAuditCardsResult extends Omit<OrderAuditResult, "eventos"> {
  total_pedidos: number; pedidos: OrderAuditCard[];
}

const LABELS: Record<string, string> = {
  estado: "Estado", promo_tipo: "Promoción", descuento: "Descuento", jarros_prometidos: "Jarros declarados",
  jarros_entregados: "Jarros informados al entregar", es_jarra_dorada: "Jarra dorada", cupon_id: "Cupón",
  cantidad: "Cantidad", precio_unitario: "Precio unitario", descuento_item: "Descuento del producto",
  producto_id: "Producto", total: "Total", subtotal: "Subtotal", metodo: "Método de pago",
  metodo_pago: "Método de pago", monto: "Monto", costo_despacho: "Costo de despacho",
  costo_despacho_calculado: "Tarifa calculada", notas: "Observaciones", despachador_id: "Despachador",
  tomador_id: "Tomador original", turno_id: "Turno", sucursal_id: "Sucursal",
  cliente_nombre: "Nombre del cliente", cliente_telefono: "Teléfono del cliente",
  direccion_entrega: "Dirección", referencia_entrega: "Referencia de entrega",
  linea_id: "Línea", pago_registrado: "Pago registrado", estado_auto_revision: "Revisión automática de cocina",
  composicion_pago: "Composición de pagos", distancia_km: "Distancia (km)",
};
export const auditFieldLabel = (key: string) => LABELS[key] ?? key.replace(/_/g, " ");

export function auditValue(value: unknown): string {
  if (value == null) return "Sin dato";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  if (Array.isArray(value) && value.every((entry) => entry && typeof entry === "object" && typeof entry.metodo === "string" && typeof entry.monto === "number")) {
    return value.length === 0 ? "Sin pagos" : value.map((entry) => `${entry.metodo}: ${new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(entry.monto)}${entry.referencia ? ` · Referencia: ${entry.referencia}` : ""}`).join("\n");
  }
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function auditChanges(event: Pick<OrderAuditEvent, "campo" | "valor_anterior" | "valor_nuevo" | "campos">) {
  const parse = (value: string | null): Record<string, unknown> => {
    if (value == null) return {};
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
      if (Array.isArray(parsed)) return { [event.campo]: parsed };
    } catch { /* Legacy values are plain text. */ }
    return { [event.campo]: value };
  };
  const before = parse(event.valor_anterior), after = parse(event.valor_nuevo);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys.filter((key) => key !== "linea_id").map((key) => ({
    field: key, label: auditFieldLabel(key), before: auditValue(before[key]), after: auditValue(after[key]),
  }));
}

export function auditDate(value: string) {
  return new Date(value).toLocaleString("es-CL", { timeZone: "America/Santiago" });
}

// Resolve midnight in Santiago, including seasonal offsets, independently of
// the workstation time zone. The end filter is the next day's exclusive start.
export function auditDayBoundary(day: string, nextDay = false): string {
  const target = new Date(`${day}T00:00:00Z`);
  if (!Number.isFinite(target.getTime())) throw new Error("Fecha inválida");
  if (nextDay) target.setUTCDate(target.getUTCDate() + 1);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  });
  let candidate = target.getTime();
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
    const localAsUTC = Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`);
    const adjustment = target.getTime() - localAsUTC;
    candidate += adjustment;
    if (!adjustment) break;
  }
  return new Date(candidate).toISOString();
}
