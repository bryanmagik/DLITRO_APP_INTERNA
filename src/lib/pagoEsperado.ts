export type MetodoPagoEsperado = "efectivo" | "transferencia" | "tarjeta";

export interface PagoEsperadoDetalle {
  metodo: MetodoPagoEsperado;
  monto: number;
}

export interface MontosPagoEsperado {
  efectivo: number;
  transferencia: number;
  tarjeta: number;
}

export interface PedidoConPagoEsperado {
  pago_esperado_efectivo?: number | null;
  pago_esperado_transferencia?: number | null;
  pago_esperado_tarjeta?: number | null;
}

export const METODOS_PAGO_ESPERADO: MetodoPagoEsperado[] = [
  "efectivo",
  "transferencia",
  "tarjeta",
];

export function parseMontoPagoEsperado(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const monto = Number(trimmed);
  return Number.isSafeInteger(monto) ? monto : null;
}

export function buildPagoEsperadoDetalle(
  metodos: MetodoPagoEsperado[],
  montos: MontosPagoEsperado,
  total: number,
): PagoEsperadoDetalle[] {
  if (metodos.length === 0) return [];
  if (metodos.length === 1) return [{ metodo: metodos[0], monto: total }];
  return METODOS_PAGO_ESPERADO
    .filter((metodo) => metodos.includes(metodo))
    .map((metodo) => ({ metodo, monto: montos[metodo] }));
}

export function validarPagoEsperadoMixto(
  metodos: MetodoPagoEsperado[],
  montos: MontosPagoEsperado,
  total: number,
): string | null {
  if (metodos.length <= 1) return null;
  if (metodos.some((metodo) => !Number.isSafeInteger(montos[metodo]) || montos[metodo] <= 0)) {
    return "Ingresa un monto mayor a $0 para cada método seleccionado.";
  }
  const ingresado = metodos.reduce((sum, metodo) => sum + montos[metodo], 0);
  if (ingresado < total) return `Faltan $${(total - ingresado).toLocaleString("es-CL")}.`;
  if (ingresado > total) return `Sobran $${(ingresado - total).toLocaleString("es-CL")}.`;
  return null;
}

export function pagoEsperadoColumns(detalle: PagoEsperadoDetalle[]) {
  const monto = (metodo: MetodoPagoEsperado) => detalle.find((item) => item.metodo === metodo)?.monto ?? null;
  return {
    pago_esperado_efectivo: monto("efectivo"),
    pago_esperado_transferencia: monto("transferencia"),
    pago_esperado_tarjeta: monto("tarjeta"),
  };
}

export function pagoEsperadoDetalleFromPedido(pedido: PedidoConPagoEsperado): PagoEsperadoDetalle[] {
  return METODOS_PAGO_ESPERADO.flatMap((metodo) => {
    const value = pedido[`pago_esperado_${metodo}`];
    const monto = value == null ? 0 : Number(value);
    return Number.isFinite(monto) && monto > 0 ? [{ metodo, monto }] : [];
  });
}
