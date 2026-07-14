import { calcStockColumnas, type InsumoStockFields } from "@/utils/stockUtils";
import { cn } from "@/lib/utils";

interface Props {
  cantidad: number;
  insumo: InsumoStockFields | null | undefined;
  sinStock?: boolean;
  className?: string;
  cellClassName?: string;
  padding?: "sm" | "md";
  onClick?: () => void;
}

const pad = { sm: "px-3 py-2", md: "px-4 py-2" };

/** Tres celdas de tabla: Cajas | Unidades | Total ML/GR */
export default function StockColumnasCells({
  cantidad,
  insumo,
  sinStock = false,
  className,
  cellClassName,
  padding = "md",
  onClick,
}: Props) {
  const n = Number(cantidad) || 0;
  const cols = sinStock && n <= 0
    ? { cajas: "—", unidades: "—", total: "Sin stock", sinStock: true }
    : calcStockColumnas(n, insumo);

  const p = pad[padding];
  const base = cn("tabular-nums font-mono text-right", p, cellClassName, className);
  const totalCls = cols.sinStock ? cn(base, "text-destructive font-semibold text-xs") : base;

  const render = (value: string, cls: string) =>
    onClick ? (
      <button type="button" onClick={onClick} className={cn(cls, "hover:bg-muted rounded w-full")}>
        {value}
      </button>
    ) : (
      <td className={cls}>{value}</td>
    );

  return (
    <>
      {render(cols.cajas, base)}
      {render(cols.unidades, base)}
      {render(cols.total, totalCls)}
    </>
  );
}
