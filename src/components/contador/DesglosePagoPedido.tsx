import { desglosePagoPedido, type PagoPedido } from "./agrupacionPagos";

const labels: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", cortesia: "Cortesía" };
const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);

export function DesglosePagoPedido({ pagos, pedidoId, total, metodo }: { pagos: PagoPedido[]; pedidoId: string; total: number; metodo: string | null }) {
  const amounts = desglosePagoPedido(pagos, pedidoId);
  if (!amounts) return metodo === "mixto" ? <p className="mt-2 text-xs text-warning">Sin desglose registrado</p> : null;
  const registered = Object.values(amounts).reduce((sum, amount) => sum + amount, 0);
  return <div className="mt-2 space-y-1 text-xs min-w-40" aria-label="Desglose del pago">
    {Object.entries(amounts).map(([method, amount]) => <div key={method} className="flex justify-between gap-3"><span className="text-muted-foreground">{labels[method] ?? method}</span><span className="font-mono tabular-nums whitespace-nowrap">{money(amount)}</span></div>)}
    {registered !== total && <p className="text-warning pt-1">Pagos registrados: {money(registered)} · Diferencia con el pedido: {money(total - registered)}</p>}
  </div>;
}
