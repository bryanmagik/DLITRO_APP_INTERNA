import { cn } from "@/lib/utils";

export type TipoPromo =
  | "sabor_del_dia"
  | "jarra_dorada"
  | "cumpleanos"
  | "cupon"
  | "canje";

export interface PedidoPromoFields {
  descuento?: number | null;
  subtotal?: number | null;
  total?: number | null;
  costo_despacho?: number | null;
  promo_tipo?: TipoPromo | string | null;
  cupon_id?: string | null;
  jarros_entregados?: number | null;
}

const PROMO_TIPO_LABEL: Record<string, string> = {
  sabor_del_dia: "Sabor del día",
  jarra_dorada: "Jarra dorada",
  cumpleanos: "Cumpleaños",
  cupon: "Cupón",
  canje: "Canje",
};

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

export function tienePromo(pedido: PedidoPromoFields): boolean {
  return (pedido.descuento ?? 0) > 0;
}

export function labelPromoTipo(
  promo_tipo?: TipoPromo | string | null,
  cupon_id?: string | null,
): string | null {
  if (promo_tipo) return PROMO_TIPO_LABEL[promo_tipo] ?? promo_tipo.replace(/_/g, " ");
  if (cupon_id) return "Cupón";
  return null;
}

/** Badge verde lima para pedidos con descuento/promo */
export function PromoPedidoBadge({
  pedido,
  className,
  compact = false,
}: {
  pedido: PedidoPromoFields;
  className?: string;
  compact?: boolean;
}) {
  if (!tienePromo(pedido)) return null;
  const tipoLabel = labelPromoTipo(pedido.promo_tipo, pedido.cupon_id);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-bold uppercase tracking-wider border rounded-full",
        compact ? "text-[9px] px-1.5 py-0.5" : "text-[10px] px-2 py-0.5",
        className,
      )}
      style={{ backgroundColor: "#7FFF00", color: "#1a4d1a", borderColor: "#5cb800" }}
    >
      🏷️ Con promoción
      {tipoLabel && (
        <span className="normal-case font-semibold opacity-90">· {tipoLabel}</span>
      )}
    </span>
  );
}

/** Desglose subtotal / descuento / despacho / total + jarros entregados */
export function DesglosePrecioPedido({
  pedido,
  className,
  totalOverride,
  subtotalOverride,
  costoDespachoOverride,
}: {
  pedido: PedidoPromoFields;
  className?: string;
  /** Total calculado en edición (Mis Pedidos); si no se pasa, usa pedido.total */
  totalOverride?: number;
  subtotalOverride?: number;
  costoDespachoOverride?: number;
}) {
  const subtotal = subtotalOverride ?? pedido.subtotal ?? 0;
  const descuento = pedido.descuento ?? 0;
  const despacho = costoDespachoOverride ?? pedido.costo_despacho ?? 0;
  const total = totalOverride ?? pedido.total ?? 0;
  const tipoLabel = labelPromoTipo(pedido.promo_tipo, pedido.cupon_id);
  const conPromo = tienePromo(pedido);

  if (!conPromo && (pedido.jarros_entregados ?? 0) <= 0) {
    return (
      <div className={cn("flex justify-between items-center", className)}>
        <span className="text-xs text-muted-foreground uppercase">Total</span>
        <span className="font-bold text-lg tabular-nums">{fmtCLP(total)}</span>
      </div>
    );
  }

  return (
    <div className={cn("space-y-1 text-sm", className)}>
      {tipoLabel && (
        <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "#1a4d1a" }}>
          Promo: {tipoLabel}
        </div>
      )}
      <div className="flex justify-between">
        <span className="text-muted-foreground">Subtotal</span>
        <span className="font-mono tabular-nums">{fmtCLP(subtotal)}</span>
      </div>
      {descuento > 0 && (
        <div className="flex justify-between font-medium" style={{ color: "#1a4d1a" }}>
          <span>Descuento</span>
          <span className="font-mono tabular-nums">−{fmtCLP(descuento)}</span>
        </div>
      )}
      {despacho > 0 && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">Despacho</span>
          <span className="font-mono tabular-nums">{fmtCLP(despacho)}</span>
        </div>
      )}
      <div className="flex justify-between pt-1 border-t border-border font-bold">
        <span>Total</span>
        <span className="font-mono tabular-nums text-lg">{fmtCLP(total)}</span>
      </div>
      {(pedido.jarros_entregados ?? 0) > 0 && (
        <div className="flex justify-between text-xs pt-1" style={{ color: "#1a4d1a" }}>
          <span>🫙 Jarros entregados</span>
          <span className="font-mono font-semibold">{pedido.jarros_entregados}</span>
        </div>
      )}
    </div>
  );
}
