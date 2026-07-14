import InputCajasUnidades from "@/components/InputCajasUnidades";
import { calcularCantidadBase, mlACajasUnidades, type InsumoFormato } from "@/lib/formatoCantidad";

interface Props {
  insumo: InsumoFormato | null | undefined;
  formato: string;
  sueltas: string;
  onFormato: (v: string) => void;
  onSueltas: (v: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

/** Wrapper legacy: mantiene API formato/sueltas sobre InputCajasUnidades. */
export default function CantidadFormatoInput({
  insumo, formato, sueltas, onFormato, onSueltas, disabled, compact,
}: Props) {
  const valorMl = calcularCantidadBase(
    parseFloat(formato) || 0,
    parseFloat(sueltas) || 0,
    insumo,
  );

  return (
    <InputCajasUnidades
      insumo={insumo}
      valorMl={valorMl}
      disabled={disabled}
      compact={compact}
      onChange={(v) => {
        const { cajas, unidades } = mlACajasUnidades(
          v,
          insumo?.unidades_por_formato ?? null,
          insumo?.ml_por_unidad ?? null,
        );
        onFormato(String(cajas));
        onSueltas(String(unidades));
      }}
    />
  );
}

export { calcularCantidadBase };
