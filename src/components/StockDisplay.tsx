import { formatearMl } from "@/lib/formatoCantidad";
import { formatearStockDisplay, type InsumoStockFields } from "@/utils/stockUtils";
import { cn } from "@/lib/utils";

interface Props {
  cantidad: number;
  insumo: InsumoStockFields | null | undefined;
  align?: "right" | "left";
  className?: string;
  mlClassName?: string;
  /** Si true y cantidad ≤ 0, muestra "Sin stock" en rojo. */
  sinStock?: boolean;
  /** Mostrar línea secundaria con ml/gr base. */
  mostrarBase?: boolean;
}

export default function StockDisplay({
  cantidad,
  insumo,
  align = "right",
  className,
  mlClassName,
  sinStock = false,
  mostrarBase = true,
}: Props) {
  const n = Number(cantidad) || 0;
  const alignCls = align === "right" ? "text-right" : "text-left";

  if (sinStock && n <= 0) {
    return (
      <div className={cn("leading-tight", alignCls)}>
        <span className="text-destructive font-semibold text-xs">Sin stock</span>
      </div>
    );
  }

  const texto = formatearStockDisplay(n, insumo) ?? (sinStock ? null : `0 ${insumo?.unidad || "unidades"}`);
  const ml = mostrarBase ? formatearMl(n, insumo) : null;

  return (
    <div className={cn("leading-tight", alignCls)}>
      {texto ? (
        <div className={cn("font-mono", className)}>{texto}</div>
      ) : (
        <span className="text-destructive font-semibold text-xs">Sin stock</span>
      )}
      {ml && (
        <div className={cn("font-mono text-[10px] uppercase tracking-wider text-muted-foreground", mlClassName)}>
          {ml}
        </div>
      )}
    </div>
  );
}
