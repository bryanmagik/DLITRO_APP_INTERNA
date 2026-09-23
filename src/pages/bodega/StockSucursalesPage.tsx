import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, CheckCircle2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { TIPOS_INSUMO, InsumoFull, estadoStock, minimosDe } from "@/lib/logistica";
import StockColumnasCells from "@/components/StockColumnasCells";
import { calcStockColumnas } from "@/utils/stockUtils";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  esInventarioDesactualizado,
  fmtUltimoCierre,
} from "@/lib/inventarioCierre";
import { INVENTARIO_SELECT, compararInventario } from "@/lib/inventarioOperativo";

interface Sucursal { id: string; nombre: string }
interface StockRow {
  sucursal_id: string;
  insumo_id: string;
  cantidad: number;
  stock_minimo: number | null;
  stock_minimo_observacion: number;
  stock_minimo_critico: number;
}

export default function StockSucursalesPage() {
  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState<InsumoFull[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [openSuc, setOpenSuc] = useState<Sucursal | null>(null);
  const [ultimosCierres, setUltimosCierres] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [insR, sucR, stR, ciR] = await Promise.all([
        supabase.from("insumos").select(INVENTARIO_SELECT).eq("activo", true)
          .order("orden_visual", { ascending: true, nullsFirst: false })
          .order("orden_presentacion", { ascending: true }).order("nombre"),
        supabase.from("sucursales").select("id,nombre").eq("activo", true).order("nombre"),
        supabase
          .from("stock_sucursal")
          .select("sucursal_id,insumo_id,cantidad,stock_minimo,stock_minimo_observacion,stock_minimo_critico"),
        supabase
          .from("turnos")
          .select("sucursal_id,closed_at")
          .eq("estado", "cerrado")
          .not("closed_at", "is", null)
          .order("closed_at", { ascending: false }),
      ]);
      setInsumos((insR.data as InsumoFull[]) ?? []);
      setSucursales((sucR.data as Sucursal[]) ?? []);
      setStock((stR.data as StockRow[]) ?? []);
      const map = new Map<string, string>();
      for (const t of (ciR.data as { sucursal_id: string; closed_at: string }[]) ?? []) {
        if (!map.has(t.sucursal_id)) map.set(t.sucursal_id, t.closed_at);
      }
      setUltimosCierres(map);
      setLoading(false);
    })();
  }, []);

  const insumoMap = useMemo(() => {
    const m = new Map<string, InsumoFull>();
    insumos.forEach((i) => m.set(i.id, i));
    return m;
  }, [insumos]);

  const criticosPorSucursal = useMemo(() => {
    const out = new Map<string, Array<{ insumo: InsumoFull; cantidad: number; minimo: number }>>();
    sucursales.forEach((s) => out.set(s.id, []));
    stock.forEach((r) => {
      const { obs, crit } = minimosDe(r);
      const st = estadoStock(r.cantidad, obs, crit);
      if (st.level === 2) {
        const ins = insumoMap.get(r.insumo_id);
        if (!ins) return;
        out.get(r.sucursal_id)?.push({ insumo: ins, cantidad: r.cantidad, minimo: crit || obs });
      }
    });
    out.forEach((arr) => arr.sort((a, b) => compararInventario(a.insumo, b.insumo)));
    return out;
  }, [stock, sucursales, insumoMap]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Stock Sucursales</h1>
        <p className="text-sm text-muted-foreground">Resumen de insumos bajo el stock mínimo por sucursal</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {sucursales.map((suc) => {
          const criticos = criticosPorSucursal.get(suc.id) ?? [];
          const ok = criticos.length === 0;
          const ultimoCierre = ultimosCierres.get(suc.id) ?? null;
          const desactualizado = esInventarioDesactualizado(ultimoCierre);
          return (
            <button
              key={suc.id}
              onClick={() => setOpenSuc(suc)}
              className={cn(
                "text-left rounded-lg border bg-card p-5 transition-all hover:shadow-md hover:-translate-y-0.5",
                ok ? "border-success/40" : "border-destructive/40",
              )}
            >
              <div className="flex items-start justify-between mb-2 gap-2">
                <h2 className="text-xl font-bold">{suc.nombre}</h2>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border",
                      ok
                        ? "bg-success/10 text-success border-success/30"
                        : "bg-destructive/10 text-destructive border-destructive/30",
                    )}
                  >
                    {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                    {ok ? "Stock OK" : `${criticos.length} críticos`}
                  </span>
                  {desactualizado && (
                    <Badge variant="outline" className="text-[10px] border-destructive/40 text-destructive bg-destructive/5">
                      Inventario desactualizado
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3">
                Último inventario: {fmtUltimoCierre(ultimoCierre)}
              </p>

              {ok ? (
                <div className="text-sm text-success flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  Todos los insumos sobre el mínimo
                </div>
              ) : (
                <ul className="space-y-1.5 max-h-64 overflow-auto">
                  {criticos.map((c) => (
                    <li
                      key={c.insumo.id}
                      className="flex items-center justify-between text-sm bg-destructive/5 rounded px-2.5 py-1.5"
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <AlertTriangle className="h-3.5 w-3.5 text-destructive shrink-0" />
                        <span className="truncate">{c.insumo.nombre}</span>
                      </span>
                      <span className="text-xs tabular-nums shrink-0 ml-2 font-semibold text-destructive text-right leading-tight">
                        {(() => {
                          const cols = calcStockColumnas(c.cantidad, c.insumo);
                          if (cols.sinStock) return <span>Sin stock</span>;
                          return (
                            <span className="font-mono">
                              {cols.cajas !== "—" && <span>{cols.cajas}c </span>}
                              {cols.unidades !== "—" && <span>{cols.unidades}u </span>}
                              <span>{cols.total}</span>
                            </span>
                          );
                        })()}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </button>
          );
        })}
      </div>

      <Dialog open={!!openSuc} onOpenChange={(v) => !v && setOpenSuc(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center gap-2 flex-wrap">
              {openSuc?.nombre}
              {openSuc && esInventarioDesactualizado(ultimosCierres.get(openSuc.id)) && (
                <Badge variant="outline" className="text-xs border-destructive/40 text-destructive">
                  Inventario desactualizado
                </Badge>
              )}
            </DialogTitle>
            {openSuc && (
              <p className="text-xs text-muted-foreground">
                Último cierre con inventario: {fmtUltimoCierre(ultimosCierres.get(openSuc.id))}
              </p>
            )}
          </DialogHeader>
          {openSuc && <InventarioCompleto sucursalId={openSuc.id} insumos={insumos} stock={stock} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InventarioCompleto({
  sucursalId,
  insumos,
  stock,
}: {
  sucursalId: string;
  insumos: InsumoFull[];
  stock: StockRow[];
}) {
  const stockMap = useMemo(() => {
    const m = new Map<string, StockRow>();
    stock.filter((s) => s.sucursal_id === sucursalId).forEach((s) => m.set(s.insumo_id, s));
    return m;
  }, [stock, sucursalId]);

  const grupos = useMemo(() => {
    const out: Record<string, InsumoFull[]> = {};
    TIPOS_INSUMO.forEach((t) => (out[t] = []));
    insumos.forEach((i) => { if (out[i.tipo]) out[i.tipo].push(i); });
    return out;
  }, [insumos]);

  return (
    <div className="overflow-auto -mx-6 px-6">
      <div className="space-y-5">
        {TIPOS_INSUMO.map((tipo) => {
          const rows = grupos[tipo];
          if (!rows?.length) return null;
          return (
            <div key={tipo}>
              <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-2">{tipo === "Aseo" ? "Útiles de aseo" : tipo}</h3>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Insumo</th>
                      <th className="text-right px-3 py-2 font-medium w-16">Cajas</th>
                      <th className="text-right px-3 py-2 font-medium w-16">Unidades</th>
                      <th className="text-right px-3 py-2 font-medium w-28">Total ML/GR</th>
                      <th className="text-right px-3 py-2 font-medium w-24">Mínimo</th>
                      <th className="text-center px-3 py-2 font-medium w-24">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((ins) => {
                      const row = stockMap.get(ins.id);
                      const cant = row?.cantidad ?? 0;
                      const { obs, crit } = minimosDe(row);
                      const st = estadoStock(cant, obs, crit);
                      return (
                        <tr key={ins.id} className="border-t">
                          <td className="px-3 py-2">{ins.nombre}</td>
                          {row ? (
                            <StockColumnasCells
                              cantidad={cant}
                              insumo={ins}
                              sinStock
                              className={st.cls}
                              padding="sm"
                            />
                          ) : (
                            <>
                              <td className="px-3 py-2 text-right font-mono">—</td>
                              <td className="px-3 py-2 text-right font-mono">—</td>
                              <td className="px-3 py-2 text-right font-mono">—</td>
                            </>
                          )}
                          <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {crit ? `🔴 ${crit}` : obs ? `🟡 ${obs}` : "—"}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", st.bg, st.cls)}>
                              {st.label}
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
    </div>
  );
}
