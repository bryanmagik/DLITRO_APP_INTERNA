export type MetodoPagoCorreccion = "efectivo" | "transferencia" | "tarjeta" | "cortesia";

export interface PagoCorreccion {
  metodo: MetodoPagoCorreccion;
  monto: number;
  referencia: string;
}

export interface PagoActualCorreccion {
  metodo: string;
  monto: number;
  referencia: string | null;
}

export interface PedidoCorregible {
  id: string;
  estado: string;
  total: number;
  notas: string | null;
  metodo_pago: string | null;
  referencia_pago: string | null;
}

export const METODOS_PAGO_CORRECCION: MetodoPagoCorreccion[] = [
  "efectivo",
  "transferencia",
  "tarjeta",
  "cortesia",
];

export function normalizarComposicionPagos(pagos: PagoCorreccion[]) {
  return pagos
    .map(({ metodo, monto, referencia }) => ({
      metodo,
      monto: Number(monto),
      referencia: referencia.trim() || null,
    }))
    .sort((a, b) => a.metodo.localeCompare(b.metodo));
}

export function crearComposicionInicial(
  pedido: Pick<PedidoCorregible, "total" | "metodo_pago" | "referencia_pago">,
  pagosActuales: PagoActualCorreccion[],
): PagoCorreccion[] {
  const existentes = pagosActuales
    .filter((pago) => Number(pago.monto) > 0 && METODOS_PAGO_CORRECCION.includes(pago.metodo as MetodoPagoCorreccion))
    .map((pago) => ({
      metodo: pago.metodo as MetodoPagoCorreccion,
      monto: Number(pago.monto),
      referencia: pago.referencia ?? "",
    }));

  if (existentes.length > 0) return existentes;

  const metodo = METODOS_PAGO_CORRECCION.includes(pedido.metodo_pago as MetodoPagoCorreccion)
    ? pedido.metodo_pago as MetodoPagoCorreccion
    : "efectivo";
  return [{ metodo, monto: Number(pedido.total), referencia: pedido.referencia_pago ?? "" }];
}

export function validarComposicionPagos(pagos: PagoCorreccion[], totalPedido: number): string | null {
  if (pagos.length === 0) return "Debes ingresar al menos un método de pago";
  if (pagos.some((pago) => !Number.isInteger(Number(pago.monto)) || Number(pago.monto) <= 0)) {
    return "Cada monto debe ser un entero mayor que cero";
  }
  if (new Set(pagos.map((pago) => pago.metodo)).size !== pagos.length) {
    return "No puedes repetir un método de pago";
  }
  const distribuido = pagos.reduce((sum, pago) => sum + Number(pago.monto), 0);
  if (distribuido !== Number(totalPedido)) {
    return "La distribución debe sumar exactamente el total del pedido";
  }
  return null;
}

export function validarMotivoCorreccion(motivo: string, detalle: string): string | null {
  if (!motivo) return "Selecciona el motivo de la corrección";
  if (motivo === "otro" && !detalle.trim()) return "Describe el motivo de la corrección";
  return null;
}
