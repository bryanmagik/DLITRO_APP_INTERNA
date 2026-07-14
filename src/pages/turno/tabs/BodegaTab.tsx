import { useEffect, useState } from "react";
import { Loader2, ClipboardCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Turno } from "../TurnoPage";
import { Button } from "@/components/ui/button";
import RealizarInventarioModal from "@/components/RealizarInventarioModal";
import StockColumnasCells from "@/components/StockColumnasCells";
import { TIPOS_INSUMO } from "@/lib/logistica";

interface Insumo {
  id: string; nombre: string; unidad: string | null; tipo: string;
  formato_mayor: string | null; unidades_por_formato: number | null; ml_por_unidad: number | null;
}
interface Stock {
  insumo_id: string;
  cantidad: number;
  stock_minimo: number | null;
  stock_minimo_observacion: number;
  stock_minimo_critico: number;
}
interface Row { insumo: Insumo; stock: Stock }

export default function BodegaTab({ turno }: { turno: Turno }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [openInv, setOpenInv] = useState(false);

  useEffect(() => {
    let alive = true;
    const cargar = async () => {
      const { data: insumos } = await supabase
        .from("insumos")
        .select("id,nombre,unidad,tipo,formato_mayor,unidades_por_formato,ml_por_unidad")
        .eq("activo", true).order("nombre");
      const { data: stock } = await supabase
        .from("stock_sucursal")
        .select("insumo_id,cantidad,stock_minimo,stock_minimo_observacion,stock_minimo_critico")
        .eq("sucursal_id", turno.sucursal_id);
      if (!alive) return;
      const stMap = new Map<string, Stock>();
      ((stock as Stock[]) ?? []).forEach((s) => stMap.set(s.insumo_id, s));
      const merged = ((insumos as Insumo[]) ?? []).map((i) => ({
        insumo: i,
        stock: stMap.get(i.id) ?? { insumo_id: i.id, cantidad: 0, stock_minimo: 0, stock_minimo_observacion: 0, stock_minimo_critico: 0 },
      }));
      setRows(merged);
      setLoading(false);
    };
    cargar();
    const ch = supabase
      .channel(`bodega-stock-${turno.sucursal_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "stock_sucursal", filter: `sucursal_id=eq.${turno.sucursal_id}` },
        () => cargar(),
      )
      .subscribe();
    return () => { alive = false; supabase.removeChannel(ch); };
  }, [turno.sucursal_id]);

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  const estado = (r: Row) => {
    const obs = Number(r.stock.stock_minimo_observacion ?? r.stock.stock_minimo ?? 0);
    const crit = Number(r.stock.stock_minimo_critico ?? 0);
    const c = Number(r.stock.cantidad ?? 0);
    if (crit > 0 && c <= crit) return { cls: "text-destructive", dot: "bg-destructive", label: "Crítico" };
    if (obs > 0 && c <= obs) return { cls: "text-warning", dot: "bg-warning", label: "Observación" };
    return { cls: "text-success", dot: "bg-success", label: "OK" };
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          onClick={() => setOpenInv(true)}
          className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold"
        >
          <ClipboardCheck className="h-4 w-4 mr-2" /> Realizar inventario
        </Button>
      </div>
      {rows.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">No hay insumos.</div>
      ) : (
      <div className="space-y-6">
        {TIPOS_INSUMO.map((tipo) => {
          const items = rows.filter((r) => r.insumo.tipo === tipo);
          if (items.length === 0) return null;
          return (
            <div key={tipo} className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <h3 className="font-display text-sm uppercase tracking-widest text-muted-foreground px-2">{tipo}</h3>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 border-b border-border">
                    <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                      <th className="px-4 py-3">Insumo</th>
                      <th className="px-4 py-3 text-right">Cajas</th>
                      <th className="px-4 py-3 text-right">Unidades</th>
                      <th className="px-4 py-3 text-right">Total ML/GR</th>
                      <th className="px-4 py-3">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => {
                      const e = estado(r);
                      return (
                        <tr key={r.insumo.id} className="border-b border-border last:border-0">
                          <td className="px-4 py-3 text-foreground">{r.insumo.nombre}</td>
                          <StockColumnasCells
                            cantidad={Number(r.stock.cantidad ?? 0)}
                            insumo={r.insumo}
                            sinStock
                          />
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wider ${e.cls}`}>
                              <span className={`h-1.5 w-1.5 rounded-full ${e.dot}`} />
                              {e.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          );
        })}
      </div>
      )}
      <RealizarInventarioModal
        open={openInv}
        onOpenChange={setOpenInv}
        turnoId={turno.id}
        sucursalId={turno.sucursal_id}
      />
    </div>
  );
}
