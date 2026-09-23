import InputCajasUnidades from "@/components/InputCajasUnidades";
import StockDisplay from "@/components/StockDisplay";
import { formatearMl } from "@/lib/formatoCantidad";
import { agruparInventario, presentacionInventario, type ConfigInventarioFields } from "@/lib/inventarioOperativo";
import { formatearStockDisplay } from "@/utils/stockUtils";

export interface InventarioRow extends ConfigInventarioFields {
  insumo_id: string;
  nombre: string;
  unidad: string;
  tipo: string;
  formato_mayor: string | null;
  unidades_por_formato: number | null;
  ml_por_unidad: number | null;
  cantidadReal: number;
  contado: boolean;
  sistema?: number;
}

interface Props {
  inv: InventarioRow[];
  updateInv: (id: string, patch: Partial<Pick<InventarioRow, "cantidadReal" | "contado">>) => void;
  disabled?: boolean;
  mostrarSistema?: boolean;
}

export default function InventarioInsumosTable({ inv, updateInv, disabled, mostrarSistema }: Props) {
  if (inv.length === 0) {
    return <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">No hay insumos activos para inventariar</div>;
  }

  return (
    <div className="space-y-8">
      {agruparInventario(inv).map((seccion) => (
        <section key={seccion.seccion} aria-labelledby={`inventario-${seccion.seccion}`} className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <h2 id={`inventario-${seccion.seccion}`} className="font-display text-base uppercase tracking-widest text-foreground px-2">{seccion.seccion}</h2>
            <div className="h-px flex-1 bg-border" />
          </div>

          {seccion.grupos.map((grupo) => (
            <div key={grupo.nombre} className="rounded-xl border border-border bg-card overflow-hidden">
              <h3 className="border-b border-border bg-secondary/40 px-4 py-3 font-display text-lg">{grupo.nombre}</h3>
              <div className="divide-y divide-border">
                {grupo.items.map((r) => {
                  const ml = r.contado && r.cantidadReal > 0 ? formatearMl(r.cantidadReal, r) : null;
                  const presentacion = presentacionInventario(r);
                  return (
                    <div key={r.insumo_id} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(12rem,1fr)_auto] sm:items-center">
                      <div>
                        <div className="font-medium text-foreground">{presentacion ?? r.nombre}</div>
                        {mostrarSistema && r.sistema != null && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">Sistema: {formatearStockDisplay(r.sistema, r) ?? "Sin stock"}</div>
                        )}
                        <div className="mt-1 text-xs">
                          {r.contado
                            ? <span className="text-success">Conteo informado{r.cantidadReal === 0 ? ": cero confirmado" : ""}</span>
                            : <span className="text-muted-foreground">Sin contar</span>}
                        </div>
                      </div>
                      <div className="sm:min-w-72">
                        <InputCajasUnidades
                          insumo={r}
                          valorMl={r.contado ? r.cantidadReal : null}
                          disabled={disabled}
                          onChange={(value) => updateInv(r.insumo_id, { cantidadReal: value ?? 0, contado: value !== null })}
                        />
                        {ml && <div className="mt-1 text-right text-[10px] font-mono uppercase tracking-wider text-muted-foreground">= {ml}</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export { StockDisplay };
