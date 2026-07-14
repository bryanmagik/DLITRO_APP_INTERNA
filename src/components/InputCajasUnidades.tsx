import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  cajasUnidadesAMl,
  calcStockColumnas,
  mlACajasUnidades,
  tieneFormatoDual,
  textoInfoFormato,
  type InsumoStockFields,
} from "@/utils/stockUtils";

export interface InputCajasUnidadesProps {
  insumo: InsumoStockFields | null | undefined;
  valorMl: number;
  onChange: (nuevoValorMl: number) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  /** Mostrar preview del total ML/GR debajo de los inputs. */
  mostrarTotal?: boolean;
}

export default function InputCajasUnidades({
  insumo,
  valorMl,
  onChange,
  disabled,
  compact,
  className,
  mostrarTotal = true,
}: InputCajasUnidadesProps) {
  const dual = tieneFormatoDual(insumo);
  const upf = insumo?.unidades_por_formato ?? null;
  const ml = insumo?.ml_por_unidad ?? null;
  const unidad = insumo?.unidad || "unidades";

  const [cajas, setCajas] = useState(0);
  const [unidades, setUnidades] = useState(0);
  const [raw, setRaw] = useState(0);

  useEffect(() => {
    if (dual) {
      const { cajas: c, unidades: u } = mlACajasUnidades(valorMl, upf, ml);
      setCajas(c);
      setUnidades(u);
    } else {
      const { unidades: u } = mlACajasUnidades(valorMl, upf, ml);
      setRaw(u);
    }
  }, [valorMl, upf, ml, dual]);

  const hSize = compact ? "h-8" : "h-10";
  const wSize = compact ? "w-16" : "w-20";
  const info = textoInfoFormato(insumo);
  const totalPreview = valorMl > 0 ? calcStockColumnas(valorMl, insumo).total : null;

  const emitDual = (c: number, u: number) => {
    onChange(cajasUnidadesAMl(c, u, upf, ml));
  };

  if (!dual) {
    return (
      <div className={className}>
        <div className="flex items-center gap-2 justify-end">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Total:</span>
          <Input
            type="number"
            min={0}
            step={1}
            disabled={disabled}
            value={raw}
            onChange={(e) => {
              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
              setRaw(v);
              onChange(ml ? v * (ml || 1) : v);
            }}
            className={`bg-background font-mono text-right ${hSize} ${wSize}`}
            placeholder="0"
          />
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground min-w-[2.5rem]">
            {unidad}
          </span>
        </div>
        {info && !mostrarTotal && (
          <p className="text-[10px] text-muted-foreground text-right mt-0.5">{info}</p>
        )}
        {mostrarTotal && totalPreview && (
          <p className="text-[10px] font-mono text-muted-foreground text-right mt-0.5">= {totalPreview}</p>
        )}
      </div>
    );
  }

  return (
    <div className={className}>
      <div className="flex items-center gap-2 justify-end flex-wrap">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Cajas:</span>
          <Input
            type="number"
            min={0}
            step={1}
            disabled={disabled}
            value={cajas}
            onChange={(e) => {
              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
              setCajas(v);
              emitDual(v, unidades);
            }}
            className={`bg-background font-mono text-right ${hSize} ${wSize}`}
            placeholder="0"
          />
        </div>
        <span className="text-muted-foreground text-xs">+</span>
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Unidades:</span>
          <Input
            type="number"
            min={0}
            step={1}
            disabled={disabled}
            value={unidades}
            onChange={(e) => {
              const v = Math.max(0, parseInt(e.target.value, 10) || 0);
              setUnidades(v);
              emitDual(cajas, v);
            }}
            className={`bg-background font-mono text-right ${hSize} ${wSize}`}
            placeholder="0"
          />
        </div>
      </div>
      {info && (
        <p className="text-[10px] text-muted-foreground text-right mt-0.5">({info})</p>
      )}
      {mostrarTotal && totalPreview && (
        <p className="text-[10px] font-mono text-muted-foreground text-right mt-0.5">= {totalPreview}</p>
      )}
    </div>
  );
}
