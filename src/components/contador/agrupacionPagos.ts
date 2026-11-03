export interface PagoPedido { pedido_id?: string | null; metodo: string; monto: number }

export function desglosePagoPedido(pagos: PagoPedido[], pedidoId: string): Record<string, number> | null {
  const rows = pagos.filter((pago) => pago.pedido_id === pedidoId);
  if (rows.length === 0) return null;
  return rows.reduce<Record<string, number>>((totals, pago) => {
    totals[pago.metodo] = (totals[pago.metodo] ?? 0) + pago.monto;
    return totals;
  }, {});
}
