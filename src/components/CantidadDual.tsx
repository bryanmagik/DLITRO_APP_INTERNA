import StockDisplay from "@/components/StockDisplay";
import type { InsumoFormato } from "@/lib/formatoCantidad";

interface Props {
  cantidad: number;
  insumo: InsumoFormato | null | undefined;
  align?: "right" | "left";
  className?: string;
  mlClassName?: string;
  sinStock?: boolean;
}

/** Muestra stock en formato cajas + unidades (delega en StockDisplay). */
export default function CantidadDual({
  cantidad,
  insumo,
  align = "right",
  className,
  mlClassName,
  sinStock = false,
}: Props) {
  return (
    <StockDisplay
      cantidad={cantidad}
      insumo={insumo}
      align={align}
      className={className}
      mlClassName={mlClassName}
      sinStock={sinStock}
    />
  );
}
