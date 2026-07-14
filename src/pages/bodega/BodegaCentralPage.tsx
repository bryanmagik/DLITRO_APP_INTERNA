import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TIPOS_INSUMO, InsumoFull, estadoStock } from "@/lib/logistica";
import InputCajasUnidades from "@/components/InputCajasUnidades";
import StockColumnasCells from "@/components/StockColumnasCells";
import { Badge } from "@/components/ui/badge";
import {
  esInventarioDesactualizado,
  fmtUltimoCierre,
} from "@/lib/inventarioCierre";

interface BodegaRow { insumo_id: string; cantidad: number; stock_minimo: number | null }
interface Sucursal { id: string; nombre: string }

export default function BodegaCentralPage() {
  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState<InsumoFull[]>([]);
  const [stock, setStock] = useState<BodegaRow[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const [editValMl, setEditValMl] = useState(0);
  const [entradaOpen, setEntradaOpen] = useState(false);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [ultimosCierres, setUltimosCierres] = useState<Map<string, string>>(new Map());

  const cargar = async () => {
    setLoading(true);
    const [insR, stR, sucR, ciR] = await Promise.all([
      supabase.from("insumos").select("id,nombre,unidad,tipo,formato_mayor,unidades_por_formato,ml_por_unidad").eq("activo", true).order("nombre"),
      supabase.from("stock_bodega_central").select("insumo_id,cantidad,stock_minimo"),
      supabase.from("sucursales").select("id,nombre").eq("activo", true).order("nombre"),
      supabase
        .from("turnos")
        .select("sucursal_id,closed_at")
        .eq("estado", "cerrado")
        .not("closed_at", "is", null)
        .order("closed_at", { ascending: false }),
    ]);
    setInsumos((insR.data as InsumoFull[]) ?? []);
    setStock((stR.data as BodegaRow[]) ?? []);
    setSucursales((sucR.data as Sucursal[]) ?? []);
    const map = new Map<string, string>();
    for (const t of (ciR.data as { sucursal_id: string; closed_at: string }[]) ?? []) {
      if (!map.has(t.sucursal_id)) map.set(t.sucursal_id, t.closed_at);
    }
    setUltimosCierres(map);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const stockMap = useMemo(() => {
    const m = new Map<string, BodegaRow>();
    stock.forEach((s) => m.set(s.insumo_id, s));
    return m;
  }, [stock]);

  const insumosPorTipo = useMemo(() => {
    const out: Record<string, InsumoFull[]> = {};
    TIPOS_INSUMO.forEach((t) => (out[t] = []));
    insumos.forEach((i) => { if (out[i.tipo]) out[i.tipo].push(i); });
    return out;
  }, [insumos]);

  const guardarCantidad = async (insumoId: string) => {
    const cant = editValMl;
    if (cant < 0) return toast.error("Cantidad inválida");
    const existing = stockMap.get(insumoId);
    const { error } = existing
      ? await supabase.from("stock_bodega_central").update({ cantidad: cant }).eq("insumo_id", insumoId)
      : await supabase.from("stock_bodega_central").insert({ insumo_id: insumoId, cantidad: cant });
    if (error) return toast.error(error.message);
    toast.success("Stock actualizado");
    setEditId(null); setEditValMl(0);
    cargar();
  };

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Bodega central</h1>
          <p className="text-sm text-muted-foreground">Stock disponible para despachar a sucursales.</p>
        </div>
        <Button onClick={() => setEntradaOpen(true)} className="uppercase tracking-wider font-bold">
          <Plus className="h-4 w-4 mr-2" /> Registrar entrada de stock
        </Button>
      </div>

      {sucursales.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="font-display text-lg mb-3">Inventario contado por sucursal</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {sucursales.map((s) => {
              const ultimo = ultimosCierres.get(s.id) ?? null;
              const desact = esInventarioDesactualizado(ultimo);
              return (
                <div
                  key={s.id}
                  className={`rounded-lg border p-3 ${desact ? "border-destructive/40 bg-destructive/5" : "border-success/30 bg-success/5"}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium text-sm">{s.nombre}</span>
                    {desact && (
                      <Badge variant="outline" className="text-[10px] shrink-0 border-destructive/40 text-destructive">
                        Desactualizado
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    {fmtUltimoCierre(ultimo)}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 border-b border-border">
            <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
              <th className="px-4 py-3">Insumo</th>
              <th className="px-4 py-3 text-right">Cajas</th>
              <th className="px-4 py-3 text-right">Unidades</th>
              <th className="px-4 py-3 text-right">Total ML/GR</th>
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {TIPOS_INSUMO.map((tipo) => {
              const items = insumosPorTipo[tipo] ?? [];
              if (!items.length) return null;
              return (
                <>
                  <tr key={`h-${tipo}`} className="bg-muted/30">
                    <td colSpan={6} className="px-4 py-2 text-xs uppercase tracking-widest font-bold text-muted-foreground">{tipo}</td>
                  </tr>
                  {items.map((i) => {
                    const s = stockMap.get(i.id);
                    const cant = Number(s?.cantidad ?? 0);
                    const min = Number(s?.stock_minimo ?? 0);
                    const e = estadoStock(cant, min);
                    const editing = editId === i.id;
                    return (
                      <tr key={i.id} className={`border-b border-border last:border-0 ${e.bg}`}>
                        <td className={`px-4 py-2 ${e.cls}`}>{i.nombre}</td>
                        {editing ? (
                          <td colSpan={3} className="px-4 py-2">
                            <div className="flex items-center justify-end gap-1">
                              <InputCajasUnidades
                                insumo={i}
                                valorMl={editValMl}
                                onChange={setEditValMl}
                                compact
                              />
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => guardarCantidad(i.id)}><Save className="h-3 w-3" /></Button>
                              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditId(null)}><X className="h-3 w-3" /></Button>
                            </div>
                          </td>
                        ) : (
                          <StockColumnasCells
                            cantidad={cant}
                            insumo={i}
                            sinStock
                            className={e.cls}
                            onClick={() => { setEditId(i.id); setEditValMl(cant); }}
                          />
                        )}
                        <td className="px-4 py-2 text-right font-mono text-muted-foreground">{min.toFixed(2)}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-flex items-center gap-1.5 text-xs uppercase tracking-wider font-bold ${e.cls}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${e.dot}`} /> {e.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {entradaOpen && (
        <EntradaStockModal insumos={insumos} stockMap={stockMap} onClose={() => setEntradaOpen(false)} onSaved={() => { setEntradaOpen(false); cargar(); }} />
      )}
    </div>
  );
}

function EntradaStockModal({
  insumos, stockMap, onClose, onSaved,
}: {
  insumos: InsumoFull[];
  stockMap: Map<string, BodegaRow>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [insumoId, setInsumoId] = useState("");
  const [cantMl, setCantMl] = useState(0);
  const [proveedor, setProveedor] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [saving, setSaving] = useState(false);

  const insumo = insumos.find((i) => i.id === insumoId) ?? null;

  const guardar = async () => {
    if (!insumoId) return toast.error("Seleccioná un insumo");
    const cant = cantMl;
    if (!cant || cant <= 0) return toast.error("Cantidad inválida");
    setSaving(true);
    try {
      const existing = stockMap.get(insumoId);
      const nueva = Number(existing?.cantidad ?? 0) + cant;
      const { error } = existing
        ? await supabase.from("stock_bodega_central").update({ cantidad: nueva }).eq("insumo_id", insumoId)
        : await supabase.from("stock_bodega_central").insert({ insumo_id: insumoId, cantidad: cant });
      if (error) throw error;
      await supabase.from("stock_movimientos").insert({
        insumo_id: insumoId, es_bodega: true, tipo: "entrada", cantidad: cant,
        notas: `Entrada de proveedor ${proveedor || "—"} (${fecha})`,
      });
      toast.success("Entrada registrada");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-border">
        <DialogHeader><DialogTitle className="font-display text-2xl">Registrar entrada de stock</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="label-upper">Insumo</Label>
            <select
              value={insumoId}
              onChange={(e) => setInsumoId(e.target.value)}
              className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Seleccionar…</option>
              {TIPOS_INSUMO.map((tipo) => (
                <optgroup key={tipo} label={tipo}>
                  {insumos.filter((i) => i.tipo === tipo).map((i) => (
                    <option key={i.id} value={i.id}>{i.nombre} ({i.unidad ?? "—"})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div>
            <Label className="label-upper">Cantidad recibida</Label>
            <div className="mt-1">
              <InputCajasUnidades
                insumo={insumo}
                valorMl={cantMl}
                onChange={setCantMl}
              />
            </div>
          </div>
          <div>
            <Label className="label-upper">Proveedor</Label>
            <Input value={proveedor} onChange={(e) => setProveedor(e.target.value)} className="bg-background mt-1" />
          </div>
          <div>
            <Label className="label-upper">Fecha</Label>
            <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="bg-background mt-1" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="uppercase tracking-wider font-bold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar entrada"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}