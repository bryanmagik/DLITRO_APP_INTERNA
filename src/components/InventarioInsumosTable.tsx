import InputCajasUnidades from "@/components/InputCajasUnidades";
import StockDisplay from "@/components/StockDisplay";
import { formatearMl } from "@/lib/formatoCantidad";
import { formatearStockDisplay } from "@/utils/stockUtils";
import { TIPOS_INSUMO } from "@/lib/logistica";

export interface InventarioRow {
  insumo_id: string;
  nombre: string;
  unidad: string;
  tipo: string;
  formato_mayor: string | null;
  unidades_por_formato: number | null;
  ml_por_unidad: number | null;
  cantidadReal: number;
  contado: boolean;
}

export const calcCantidadReal = (r: InventarioRow) => r.cantidadReal;

export const conteoTextoRow = (r: InventarioRow) =>
  formatearStockDisplay(r.cantidadReal, r) ?? "0";

export const filaCompleta = (r: InventarioRow) => r.contado;

interface Props {
  inv: InventarioRow[];
  updateInv: (id: string, patch: Partial<Pick<InventarioRow, "cantidadReal" | "contado">>) => void;
}

export default function InventarioInsumosTable({ inv, updateInv }: Props) {
  if (inv.length === 0) {
    return (
      <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
        No hay insumos de preparación con stock asignado
      </div>
    );
  }
  const grupos = TIPOS_INSUMO.map((t) => ({ tipo: t, items: inv.filter((r) => r.tipo === t) })).filter((g) => g.items.length > 0);
  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <div key={g.tipo} className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <h3 className="font-display text-sm uppercase tracking-widest text-muted-foreground px-2">{g.tipo}</h3>
            <div className="h-px flex-1 bg-border" />
          </div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                  <th className="px-4 py-3">Insumo</th>
                  <th className="px-4 py-3 text-right">Conteo</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((r) => {
                  const ml = r.cantidadReal > 0 ? formatearMl(r.cantidadReal, r) : null;
                  return (
                    <tr key={r.insumo_id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-foreground font-medium">{r.nombre}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col items-end gap-1">
                          <InputCajasUnidades
                            insumo={r}
                            valorMl={r.cantidadReal}
                            onChange={(v) => updateInv(r.insumo_id, { cantidadReal: v, contado: true })}
                          />
                          {ml && (
                            <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                              = {ml}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

export { StockDisplay };
