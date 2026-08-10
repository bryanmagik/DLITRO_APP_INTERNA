import { useEffect, useRef, useState } from "react";
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
  /** null/undefined = campo vacío (aún no contado). 0 es un valor válido. */
  valorMl: number | null | undefined;
  onChange: (nuevoValorMl: number) => void;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
  /** Mostrar preview del total ML/GR debajo de los inputs. */
  mostrarTotal?: boolean;
}

/** Parsea entero ≥ 0. Vacío → null (inválido/pendiente). 0 es válido. */
function parseCantidadNoNegativa(raw: string): number | null {
  const t = raw.trim();
  if (t === "") return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
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

  const [cajas, setCajas] = useState("");
  const [unidades, setUnidades] = useState("");
  const [raw, setRaw] = useState("");
  /** Evita renormalizar cajas/unidades con % upf tras un onChange propio (permite 0 cajas + 12 u). */
  const lastEmittedMl = useRef<number | null>(null);

  useEffect(() => {
    if (valorMl === null || valorMl === undefined) {
      lastEmittedMl.current = null;
      setCajas("");
      setUnidades("");
      setRaw("");
      return;
    }
    // Si el valor viene de nuestro propio emit, no rearmar con módulo
    if (lastEmittedMl.current !== null && lastEmittedMl.current === valorMl) {
      return;
    }
    lastEmittedMl.current = null;
    if (dual) {
      const { cajas: c, unidades: u } = mlACajasUnidades(valorMl, upf, ml);
      setCajas(String(c));
      setUnidades(String(u));
    } else {
      const { unidades: u } = mlACajasUnidades(valorMl, upf, ml);
      setRaw(String(u));
    }
  }, [valorMl, upf, ml, dual]);

  const hSize = compact ? "h-8" : "h-10";
  const wSize = compact ? "w-16" : "w-20";
  const info = textoInfoFormato(insumo);
  const totalPreview =
    valorMl !== null && valorMl !== undefined && valorMl >= 0
      ? calcStockColumnas(valorMl, insumo).total
      : null;

  const emitDual = (cStr: string, uStr: string) => {
    const c = parseCantidadNoNegativa(cStr);
    const u = parseCantidadNoNegativa(uStr);
    // Ambos vacíos → aún no hay conteo; no emitir
    if (c === null && u === null) return;
    // Uno vacío se interpreta como 0 para poder guardar "0 cajas + 0 unidades"
    const cajasN = c ?? 0;
    const unidadesN = u ?? 0;
    // Sin tope: unidades puede ser ≥ unidades_por_formato
    const nuevoMl = cajasUnidadesAMl(cajasN, unidadesN, upf, ml);
    lastEmittedMl.current = nuevoMl;
    onChange(nuevoMl);
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
              const next = e.target.value;
              setRaw(next);
              const v = parseCantidadNoNegativa(next);
              if (v === null) return;
              const nuevoMl = ml ? v * (ml || 1) : v;
              lastEmittedMl.current = nuevoMl;
              onChange(nuevoMl);
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
              const next = e.target.value;
              setCajas(next);
              emitDual(next, unidades);
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
              const next = e.target.value;
              setUnidades(next);
              emitDual(cajas, next);
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
