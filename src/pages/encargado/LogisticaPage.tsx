import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Send, FileEdit, Eye, Boxes } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  ESTADO_META, EstadoLogistica, TIPOS_INSUMO, InsumoFull, StockSucRow, estadoStock, fmtFecha,
} from "@/lib/logistica";
import InputCajasUnidades from "@/components/InputCajasUnidades";
import { calcularCantidadBase } from "@/components/CantidadFormatoInput";
import { mlACajasUnidades } from "@/utils/stockUtils";

interface PedidoRow {
  id: string;
  estado: string;
  notas: string | null;
  created_at: string | null;
  chofer_id: string | null;
}
interface PedidoItem {
  id: string;
  pedido_id: string;
  insumo_id: string;
  cantidad_solicitada: number;
  cantidad_enviada: number | null;
}

export default function LogisticaPage() {
  const { perfil } = useAuthStore();
  const sucursalId = perfil?.sucursal_id ?? null;

  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState<InsumoFull[]>([]);
  const [stock, setStock] = useState<StockSucRow[]>([]);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [items, setItems] = useState<PedidoItem[]>([]);
  const [verPedido, setVerPedido] = useState<PedidoRow | null>(null);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [editPedido, setEditPedido] = useState<PedidoRow | null>(null);

  const cargar = async () => {
    if (!sucursalId) { setLoading(false); return; }
    setLoading(true);
    const [insR, stR, peR] = await Promise.all([
      supabase.from("insumos").select("id,nombre,unidad,tipo,formato_mayor,unidades_por_formato,ml_por_unidad").eq("activo", true).order("nombre"),
      supabase
        .from("stock_sucursal")
        .select("insumo_id,cantidad,stock_minimo,stock_minimo_observacion,stock_minimo_critico")
        .eq("sucursal_id", sucursalId),
      supabase.from("pedidos_logistica").select("id,estado,notas,created_at,chofer_id").eq("sucursal_id", sucursalId).order("created_at", { ascending: false }),
    ]);
    setInsumos((insR.data as InsumoFull[]) ?? []);
    setStock((stR.data as StockSucRow[]) ?? []);
    const peds = (peR.data as PedidoRow[]) ?? [];
    setPedidos(peds);
    if (peds.length) {
      const { data: its } = await supabase
        .from("pedidos_logistica_items")
        .select("id,pedido_id,insumo_id,cantidad_solicitada,cantidad_enviada")
        .in("pedido_id", peds.map((p) => p.id));
      setItems((its as PedidoItem[]) ?? []);
    } else setItems([]);
    setLoading(false);
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [sucursalId]);

  const stockMap = useMemo(() => {
    const m = new Map<string, StockSucRow>();
    stock.forEach((s) => m.set(s.insumo_id, s));
    return m;
  }, [stock]);

  const insumosPorTipo = useMemo(() => {
    const out: Record<string, InsumoFull[]> = {};
    TIPOS_INSUMO.forEach((t) => (out[t] = []));
    insumos.forEach((i) => {
      if (out[i.tipo]) out[i.tipo].push(i);
    });
    return out;
  }, [insumos]);

  const enviarPedido = async (id: string) => {
    const { error } = await supabase.from("pedidos_logistica").update({ estado: "enviado" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Pedido enviado a bodega central");
    setVerPedido(null);
    cargar();
  };

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-3xl">Logística</h1>
        <p className="text-sm text-muted-foreground">Stock de la sucursal y pedidos de reposición a bodega central.</p>
      </div>

      {/* INVENTARIO COMPLETO */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <Boxes className="h-5 w-5 text-primary" />
          <h2 className="font-display text-xl">Inventario de la sucursal</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border">
              <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                <th className="px-4 py-3">Insumo</th>
                <th className="px-4 py-3">Unidad</th>
                <th className="px-4 py-3 text-right">Cajas</th>
                <th className="px-4 py-3 text-right">Unidades</th>
                <th className="px-4 py-3 text-right">Total ML/GR</th>
                <th className="px-4 py-3 text-right">Stock mínimo</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {TIPOS_INSUMO.map((tipo) => (
                <RowsTipo key={tipo} tipo={tipo} insumos={insumosPorTipo[tipo] ?? []} stockMap={stockMap} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* PEDIDOS */}
      <section className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <h2 className="font-display text-xl">Mis pedidos de reposición</h2>
          <Button onClick={() => setNuevoOpen(true)} className="uppercase tracking-wider font-bold">
            <Plus className="h-4 w-4 mr-2" /> Nuevo pedido
          </Button>
        </div>
        {pedidos.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Aún no hay pedidos de reposición.</div>
        ) : (
          <div className="divide-y divide-border">
            {pedidos.map((p) => {
              const meta = ESTADO_META[(p.estado as EstadoLogistica)] ?? ESTADO_META.borrador;
              const itemsP = items.filter((i) => i.pedido_id === p.id);
              return (
                <div key={p.id} className="px-5 py-3 flex items-center justify-between hover:bg-muted/40 cursor-pointer" onClick={() => setVerPedido(p)}>
                  <div className="flex items-center gap-4">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold uppercase tracking-wider border ${meta.cls}`}>
                      <meta.icon className="h-3 w-3" /> {meta.label}
                    </span>
                    <div>
                      <div className="font-medium text-foreground">{itemsP.length} insumo{itemsP.length === 1 ? "" : "s"}</div>
                      <div className="text-xs text-muted-foreground">{fmtFecha(p.created_at)}</div>
                    </div>
                  </div>
                  <Eye className="h-4 w-4 text-muted-foreground" />
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* MODAL VER */}
      <DetallePedidoModal
        pedido={verPedido}
        items={verPedido ? items.filter((i) => i.pedido_id === verPedido.id) : []}
        insumos={insumos}
        onClose={() => setVerPedido(null)}
        onEnviar={enviarPedido}
        onEditar={(p) => { setVerPedido(null); setEditPedido(p); }}
      />

      {/* NUEVO / EDITAR */}
      {(nuevoOpen || editPedido) && sucursalId && (
        <NuevoPedidoModal
          sucursalId={sucursalId}
          insumos={insumos}
          stockMap={stockMap}
          insumosPorTipo={insumosPorTipo}
          editPedido={editPedido}
          editItems={editPedido ? items.filter((i) => i.pedido_id === editPedido.id) : []}
          onClose={() => { setNuevoOpen(false); setEditPedido(null); }}
          onSaved={() => { setNuevoOpen(false); setEditPedido(null); cargar(); }}
        />
      )}
    </div>
  );
}

function RowsTipo({ tipo, insumos, stockMap }: { tipo: string; insumos: InsumoFull[]; stockMap: Map<string, StockSucRow> }) {
  if (!insumos.length) return null;
  const ordenados = [...insumos].sort((a, b) => {
    const sa = stockMap.get(a.id); const sb = stockMap.get(b.id);
    const la = estadoStock(Number(sa?.cantidad ?? 0), Number(sa?.stock_minimo_observacion ?? sa?.stock_minimo ?? 0), Number(sa?.stock_minimo_critico ?? 0)).level;
    const lb = estadoStock(Number(sb?.cantidad ?? 0), Number(sb?.stock_minimo_observacion ?? sb?.stock_minimo ?? 0), Number(sb?.stock_minimo_critico ?? 0)).level;
    return lb - la;
  });
  return (
    <>
      <tr className="bg-muted/30">
        <td colSpan={7} className="px-4 py-2 text-xs uppercase tracking-widest font-bold text-muted-foreground">{tipo}</td>
      </tr>
      {ordenados.map((i) => {
        const s = stockMap.get(i.id);
        const cant = Number(s?.cantidad ?? 0);
        const obs = Number(s?.stock_minimo_observacion ?? s?.stock_minimo ?? 0);
        const crit = Number(s?.stock_minimo_critico ?? 0);
        const e = estadoStock(cant, obs, crit);
        return (
          <tr key={i.id} className={`border-b border-border last:border-0 ${e.bg}`}>
            <td className={`px-4 py-2 ${e.level > 0 ? "font-medium" : ""} ${e.cls}`}>{i.nombre}</td>
            <td className="px-4 py-2 text-muted-foreground uppercase text-xs">{i.unidad ?? "—"}</td>
            <StockColumnasCells cantidad={cant} insumo={i} sinStock className={e.cls} />
            <td className="px-4 py-2 text-right font-mono text-muted-foreground">
              {crit > 0 ? `🔴 ${crit}` : obs > 0 ? `🟡 ${obs}` : "—"}
            </td>
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
}

function DetallePedidoModal({
  pedido, items, insumos, onClose, onEnviar, onEditar,
}: {
  pedido: PedidoRow | null;
  items: PedidoItem[];
  insumos: InsumoFull[];
  onClose: () => void;
  onEnviar: (id: string) => void;
  onEditar: (p: PedidoRow) => void;
}) {
  if (!pedido) return null;
  const meta = ESTADO_META[(pedido.estado as EstadoLogistica)] ?? ESTADO_META.borrador;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl bg-background border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-3">
            Pedido de reposición
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${meta.cls}`}>
              <meta.icon className="h-3 w-3" /> {meta.label}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">{fmtFecha(pedido.created_at)}</div>
        {pedido.notas && <div className="text-sm bg-muted/40 p-3 rounded-md border border-border">{pedido.notas}</div>}
        <div className="border border-border rounded-md overflow-hidden max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border sticky top-0">
              <tr className="text-left text-muted-foreground uppercase text-xs">
                <th className="px-3 py-2">Insumo</th>
                <th className="px-3 py-2 text-right">Cajas sol.</th>
                <th className="px-3 py-2 text-right">Unid. sol.</th>
                <th className="px-3 py-2 text-right">Total sol.</th>
                <th className="px-3 py-2 text-right">Cajas env.</th>
                <th className="px-3 py-2 text-right">Unid. env.</th>
                <th className="px-3 py-2 text-right">Total env.</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const ins = insumos.find((i) => i.id === it.insumo_id);
                return (
                  <tr key={it.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{ins?.nombre ?? "—"}</td>
                    <StockColumnasCells
                      cantidad={Number(it.cantidad_solicitada)}
                      insumo={ins}
                      padding="sm"
                    />
                    {it.cantidad_enviada !== null ? (
                      <StockColumnasCells
                        cantidad={Number(it.cantidad_enviada)}
                        insumo={ins}
                        className="text-success"
                        padding="sm"
                      />
                    ) : (
                      <>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">—</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">—</td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {pedido.estado === "borrador" && (
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onEditar(pedido)}><FileEdit className="h-4 w-4 mr-2" /> Editar</Button>
            <Button onClick={() => onEnviar(pedido.id)} className="uppercase tracking-wider font-bold"><Send className="h-4 w-4 mr-2" /> Enviar pedido</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function NuevoPedidoModal({
  sucursalId, insumos, stockMap, insumosPorTipo, editPedido, editItems, onClose, onSaved,
}: {
  sucursalId: string;
  insumos: InsumoFull[];
  stockMap: Map<string, StockSucRow>;
  insumosPorTipo: Record<string, InsumoFull[]>;
  editPedido: PedidoRow | null;
  editItems: PedidoItem[];
  onClose: () => void;
  onSaved: () => void;
}) {
  // Cantidades por insumo separadas: formato mayor (cajas) + sueltas
  const [cantFmt, setCantFmt] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (editPedido) {
      editItems.forEach((it) => {
        const ins = insumos.find((i) => i.id === it.insumo_id);
        const upf = Number(ins?.unidades_por_formato ?? 0);
        const ml = Number(ins?.ml_por_unidad ?? 0);
        const unidades = ml > 0 ? Number(it.cantidad_solicitada) / ml : Number(it.cantidad_solicitada);
        if (upf > 0 && ins?.formato_mayor) {
          init[it.insumo_id] = String(Math.floor(unidades / upf));
        }
      });
    }
    return init;
  });
  const [cantSuel, setCantSuel] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    if (editPedido) {
      editItems.forEach((it) => {
        const ins = insumos.find((i) => i.id === it.insumo_id);
        const upf = Number(ins?.unidades_por_formato ?? 0);
        const ml = Number(ins?.ml_por_unidad ?? 0);
        const unidades = ml > 0 ? Number(it.cantidad_solicitada) / ml : Number(it.cantidad_solicitada);
        if (upf > 0 && ins?.formato_mayor) {
          const s = Math.round((unidades - Math.floor(unidades / upf) * upf) * 100) / 100;
          init[it.insumo_id] = String(s);
        } else {
          init[it.insumo_id] = String(unidades);
        }
      });
    } else {
      insumos.forEach((i) => {
        const s = stockMap.get(i.id);
        const cant = Number(s?.cantidad ?? 0);
        const min = Number(s?.stock_minimo_observacion ?? s?.stock_minimo ?? 0);
        if (min > 0 && cant < min) {
          init[i.id] = String(Math.max(1, Math.ceil(min * 2 - cant)));
        }
      });
    }
    return init;
  });
  const [notas, setNotas] = useState(editPedido?.notas ?? "");
  const [saving, setSaving] = useState(false);

  const itemsToSave = () => {
    const ids = new Set([...Object.keys(cantFmt), ...Object.keys(cantSuel)]);
    return Array.from(ids)
      .map((insumo_id) => {
        const ins = insumos.find((i) => i.id === insumo_id) ?? null;
        const base = calcularCantidadBase(
          parseFloat(cantFmt[insumo_id] ?? "") || 0,
          parseFloat(cantSuel[insumo_id] ?? "") || 0,
          ins,
        );
        return { insumo_id, cantidad_solicitada: base };
      })
      .filter((it) => it.cantidad_solicitada > 0);
  };

  const guardar = async (estadoFinal: "borrador" | "enviado") => {
    const its = itemsToSave();
    if (its.length === 0) return toast.error("Agregá al menos un insumo");
    setSaving(true);
    try {
      let pedidoId = editPedido?.id;
      if (editPedido) {
        const { error } = await supabase.from("pedidos_logistica")
          .update({ estado: estadoFinal, notas: notas.trim() || null }).eq("id", editPedido.id);
        if (error) throw error;
        await supabase.from("pedidos_logistica_items").delete().eq("pedido_id", editPedido.id);
      } else {
        const { data, error } = await supabase.from("pedidos_logistica").insert({
          sucursal_id: sucursalId, estado: estadoFinal, notas: notas.trim() || null,
        }).select("id").single();
        if (error) throw error;
        pedidoId = data.id;
      }
      const { error: eIts } = await supabase.from("pedidos_logistica_items")
        .insert(its.map((it) => ({ ...it, pedido_id: pedidoId! })));
      if (eIts) throw eIts;
      toast.success(estadoFinal === "enviado" ? "Pedido enviado" : "Borrador guardado");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error guardando pedido");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl bg-background border-border max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{editPedido ? "Editar pedido" : "Nuevo pedido de reposición"}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {TIPOS_INSUMO.map((tipo) => {
            const items = (insumosPorTipo[tipo] ?? []).slice().sort((a, b) => {
              const sa = stockMap.get(a.id); const sb = stockMap.get(b.id);
              const la = estadoStock(Number(sa?.cantidad ?? 0), Number(sa?.stock_minimo_observacion ?? sa?.stock_minimo ?? 0), Number(sa?.stock_minimo_critico ?? 0)).level;
              const lb = estadoStock(Number(sb?.cantidad ?? 0), Number(sb?.stock_minimo_observacion ?? sb?.stock_minimo ?? 0), Number(sb?.stock_minimo_critico ?? 0)).level;
              return lb - la;
            });
            if (!items.length) return null;
            return (
              <div key={tipo} className="border border-border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs uppercase tracking-widest font-bold text-muted-foreground">{tipo}</div>
                <table className="w-full text-sm">
                  <thead className="bg-secondary/30 border-b border-border">
                    <tr className="text-left text-muted-foreground uppercase text-[10px]">
                      <th className="px-3 py-1.5">Insumo</th>
                      <th className="px-3 py-1.5 text-right">Cajas</th>
                      <th className="px-3 py-1.5 text-right">Unidades</th>
                      <th className="px-3 py-1.5 text-right">Total</th>
                      <th className="px-3 py-1.5 text-right">Pedir</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const s = stockMap.get(i.id);
                      const cant = Number(s?.cantidad ?? 0);
                      const obs = Number(s?.stock_minimo_observacion ?? s?.stock_minimo ?? 0);
                      const crit = Number(s?.stock_minimo_critico ?? 0);
                      const e = estadoStock(cant, obs, crit);
                      const baseSolicitado = calcularCantidadBase(
                        parseFloat(cantFmt[i.id] ?? "") || 0,
                        parseFloat(cantSuel[i.id] ?? "") || 0,
                        i,
                      );
                      return (
                        <tr key={i.id} className={`border-b border-border last:border-0 ${e.bg}`}>
                          <td className={`px-3 py-2 ${e.level > 0 ? "font-medium " + e.cls : ""}`}>{i.nombre}</td>
                          <StockColumnasCells
                            cantidad={cant}
                            insumo={i}
                            sinStock
                            className="text-muted-foreground"
                            padding="sm"
                          />
                          <td className="px-3 py-2">
                            <InputCajasUnidades
                              insumo={i}
                              valorMl={baseSolicitado}
                              onChange={(v) => {
                                const { cajas, unidades } = mlACajasUnidades(
                                  v,
                                  i.unidades_por_formato ?? null,
                                  i.ml_por_unidad ?? null,
                                );
                                setCantFmt((p) => ({ ...p, [i.id]: String(cajas) }));
                                setCantSuel((p) => ({ ...p, [i.id]: String(unidades) }));
                              }}
                              compact
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
          <div>
            <Label className="label-upper">Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} className="bg-background mt-1" placeholder="Notas para bodega central…" />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="secondary" onClick={() => guardar("borrador")} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar borrador"}
          </Button>
          <Button onClick={() => guardar("enviado")} disabled={saving} className="uppercase tracking-wider font-bold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Enviar directamente</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}