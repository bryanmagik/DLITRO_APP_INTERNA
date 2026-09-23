import { useEffect, useMemo, useState } from "react";
import { Loader2, Truck, Eye, Plus, Printer, Send, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { ESTADO_META, EstadoLogistica, fmtFecha, InsumoFull, TIPOS_INSUMO } from "@/lib/logistica";
import { formatearCantidad, formatearMl } from "@/lib/formatoCantidad";
import StockColumnasCells from "@/components/StockColumnasCells";
import InputCajasUnidades from "@/components/InputCajasUnidades";
import { calcularCantidadBase } from "@/components/CantidadFormatoInput";
import { mlACajasUnidades } from "@/utils/stockUtils";

interface Pedido {
  id: string;
  sucursal_id: string;
  estado: string;
  notas: string | null;
  created_at: string | null;
  chofer_id: string | null;
  iniciado_por_bodega?: boolean | null;
}
interface Item {
  id: string;
  pedido_id: string;
  insumo_id: string;
  cantidad_solicitada: number;
  cantidad_enviada: number | null;
}
interface Sucursal { id: string; nombre: string; direccion?: string | null; activo?: boolean | null }
interface Chofer { id: string; nombre: string; nombre_completo: string | null }
interface StockBodega { insumo_id: string; cantidad: number }

export default function PedidosSucursalesPage() {
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [insumos, setInsumos] = useState<InsumoFull[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [stockBodega, setStockBodega] = useState<StockBodega[]>([]);
  const [filtroSuc, setFiltroSuc] = useState<string>("");
  const [filtroEstado, setFiltroEstado] = useState<string>("");
  const [filtroFecha, setFiltroFecha] = useState<string>("");
  const [verPedido, setVerPedido] = useState<Pedido | null>(null);
  const [nuevoOpen, setNuevoOpen] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const [peR, sucR, choR, insR, stkR] = await Promise.all([
      supabase.from("pedidos_logistica").select("*").in("estado", ["borrador", "enviado", "asignado", "en_camino", "entregado"]).order("created_at", { ascending: false }),
      supabase.from("sucursales").select("id,nombre,direccion,activo"),
      supabase.from("usuarios").select("id,nombre,nombre_completo,rol,activo").eq("activo", true),
      supabase.from("insumos").select("id,nombre,unidad,tipo,formato_mayor,unidades_por_formato,ml_por_unidad"),
      supabase.from("stock_bodega_central").select("insumo_id,cantidad"),
    ]);
    const peds = (peR.data as Pedido[]) ?? [];
    setPedidos(peds);
    if (peds.length) {
      const { data: its } = await supabase.from("pedidos_logistica_items").select("*").in("pedido_id", peds.map((p) => p.id));
      setItems((its as Item[]) ?? []);
    } else setItems([]);
    setSucursales((sucR.data as Sucursal[]) ?? []);
    setChoferes(((choR.data as (Chofer & { rol: string })[]) ?? []).filter((u) => u.rol === "logistica"));
    setInsumos((insR.data as InsumoFull[]) ?? []);
    setStockBodega(((stkR.data as StockBodega[]) ?? []).map((s) => ({ insumo_id: s.insumo_id, cantidad: Number(s.cantidad) })));
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const filtrados = useMemo(() => pedidos.filter((p) => {
    if (filtroSuc && p.sucursal_id !== filtroSuc) return false;
    if (filtroEstado && p.estado !== filtroEstado) return false;
    if (filtroFecha && p.created_at && !p.created_at.startsWith(filtroFecha)) return false;
    return true;
  }), [pedidos, filtroSuc, filtroEstado, filtroFecha]);

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-3xl">Pedidos de sucursales</h1>
        <p className="text-sm text-muted-foreground">Gestioná pedidos enviados desde sucursales y asigná choferes.</p>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => setNuevoOpen(true)} className="uppercase tracking-wider font-bold">
          <Plus className="h-4 w-4 mr-2" /> Nuevo envío
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <Label className="label-upper">Sucursal</Label>
          <select value={filtroSuc} onChange={(e) => setFiltroSuc(e.target.value)} className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm">
            <option value="">Todas</option>
            {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </div>
        <div>
          <Label className="label-upper">Estado</Label>
          <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm">
            <option value="">Todos</option>
            <option value="enviado">Enviado</option>
            <option value="asignado">Asignado</option>
            <option value="en_camino">En camino</option>
            <option value="entregado">Entregado</option>
          </select>
        </div>
        <div>
          <Label className="label-upper">Fecha</Label>
          <Input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} className="bg-background mt-1" />
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 border-b border-border">
            <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
              <th className="px-4 py-3">Sucursal</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3 text-right">Items</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3">Chofer</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No hay pedidos.</td></tr>
            ) : filtrados.map((p) => {
              const meta = ESTADO_META[(p.estado as EstadoLogistica)] ?? ESTADO_META.borrador;
              const suc = sucursales.find((s) => s.id === p.sucursal_id);
              const cho = choferes.find((c) => c.id === p.chofer_id);
              const cnt = items.filter((i) => i.pedido_id === p.id).length;
              return (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer" onClick={() => setVerPedido(p)}>
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span>{suc?.nombre ?? "—"}</span>
                      {p.iniciado_por_bodega && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30 uppercase tracking-wider">
                          Iniciado por bodega
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtFecha(p.created_at)}</td>
                  <td className="px-4 py-3 text-right font-mono">{cnt}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${meta.cls}`}>
                      <meta.icon className="h-3 w-3" /> {meta.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{cho ? (cho.nombre_completo || cho.nombre) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost" size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          imprimirManifiesto(p, items.filter((i) => i.pedido_id === p.id), insumos, suc, cho);
                        }}
                        title="Imprimir manifiesto"
                      >
                        <Printer className="h-4 w-4" />
                      </Button>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {verPedido && (
        <DespacharModal
          pedido={verPedido}
          items={items.filter((i) => i.pedido_id === verPedido.id)}
          insumos={insumos}
          choferes={choferes}
          sucursal={sucursales.find((s) => s.id === verPedido.sucursal_id)}
          onClose={() => setVerPedido(null)}
          onSaved={() => { setVerPedido(null); cargar(); }}
        />
      )}

      {nuevoOpen && (
        <NuevoEnvioModal
          sucursales={sucursales.filter((s) => s.activo !== false)}
          choferes={choferes}
          insumos={insumos}
          stockBodega={stockBodega}
          onClose={() => setNuevoOpen(false)}
          onSaved={() => { setNuevoOpen(false); cargar(); }}
        />
      )}
    </div>
  );
}

function DespacharModal({
  pedido, items, insumos, choferes, sucursal, onClose, onSaved,
}: {
  pedido: Pedido;
  items: Item[];
  insumos: InsumoFull[];
  choferes: Chofer[];
  sucursal?: Sucursal;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Mapas por item.id: formato mayor (cajas) y sueltas
  const [envFmt, setEnvFmt] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    items.forEach((it) => {
      const ins = insumos.find((i) => i.id === it.insumo_id);
      const upf = Number(ins?.unidades_por_formato ?? 0);
      const ml = Number(ins?.ml_por_unidad ?? 0);
      const base = Number(it.cantidad_enviada ?? it.cantidad_solicitada);
      const unidades = ml > 0 ? base / ml : base;
      if (upf > 0 && ins?.formato_mayor) o[it.id] = String(Math.floor(unidades / upf));
    });
    return o;
  });
  const [envSuel, setEnvSuel] = useState<Record<string, string>>(() => {
    const o: Record<string, string> = {};
    items.forEach((it) => {
      const ins = insumos.find((i) => i.id === it.insumo_id);
      const upf = Number(ins?.unidades_por_formato ?? 0);
      const ml = Number(ins?.ml_por_unidad ?? 0);
      const base = Number(it.cantidad_enviada ?? it.cantidad_solicitada);
      const unidades = ml > 0 ? base / ml : base;
      if (upf > 0 && ins?.formato_mayor) {
        o[it.id] = String(Math.round((unidades - Math.floor(unidades / upf) * upf) * 100) / 100);
      } else {
        o[it.id] = String(unidades);
      }
    });
    return o;
  });
  const [chofer, setChofer] = useState<string>(pedido.chofer_id ?? "");
  const [saving, setSaving] = useState(false);
  const yaEnRuta = pedido.estado === "en_camino" || pedido.estado === "entregado";

  const despachar = async () => {
    if (!chofer) return toast.error("Asigná un chofer");
    setSaving(true);
    try {
      for (const it of items) {
        const ins = insumos.find((i) => i.id === it.insumo_id) ?? null;
        const cant = calcularCantidadBase(
          parseFloat(envFmt[it.id] ?? "") || 0,
          parseFloat(envSuel[it.id] ?? "") || 0,
          ins,
        );
        await supabase.from("pedidos_logistica_items").update({ cantidad_enviada: cant }).eq("id", it.id);
      }
      const { error } = await supabase.from("pedidos_logistica")
        .update({ chofer_id: chofer, estado: "en_camino" }).eq("id", pedido.id);
      if (error) throw error;
      toast.success("Pedido despachado");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally { setSaving(false); }
  };

  const marcarEntregado = async () => {
    setSaving(true);
    const { error } = await supabase.from("pedidos_logistica").update({ estado: "entregado" }).eq("id", pedido.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Marcado como entregado · stock sumado a sucursal");
    onSaved();
  };

  const meta = ESTADO_META[(pedido.estado as EstadoLogistica)] ?? ESTADO_META.borrador;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl bg-background border-border max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl flex items-center gap-3">
            {sucursal?.nombre ?? "Pedido"}
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${meta.cls}`}>
              <meta.icon className="h-3 w-3" /> {meta.label}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground">{fmtFecha(pedido.created_at)}</div>
        {pedido.notas && <div className="text-sm bg-muted/40 p-3 rounded-md border border-border">{pedido.notas}</div>}

        <div className="flex-1 overflow-y-auto border border-border rounded-md">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border sticky top-0">
              <tr className="text-left text-muted-foreground uppercase text-xs">
                <th className="px-3 py-2">Insumo</th>
                <th className="px-3 py-2 text-right">Cajas sol.</th>
                <th className="px-3 py-2 text-right">Unid. sol.</th>
                <th className="px-3 py-2 text-right">Total sol.</th>
                <th className="px-3 py-2 text-right">A enviar</th>
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
                    <td className="px-3 py-2">
                      <InputCajasUnidades
                        insumo={ins}
                        valorMl={calcularCantidadBase(
                          parseFloat(envFmt[it.id] ?? "") || 0,
                          parseFloat(envSuel[it.id] ?? "") || 0,
                          ins,
                        )}
                        onChange={(v) => {
                          if (v === null) return;
                          const { cajas, unidades } = mlACajasUnidades(
                            v,
                            ins?.unidades_por_formato ?? null,
                            ins?.ml_por_unidad ?? null,
                          );
                          setEnvFmt((p) => ({ ...p, [it.id]: String(cajas) }));
                          setEnvSuel((p) => ({ ...p, [it.id]: String(unidades) }));
                        }}
                        disabled={yaEnRuta}
                        compact
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-end gap-3 pt-3 border-t border-border">
          <div className="flex-1">
            <Label className="label-upper">Asignar chofer</Label>
            <select
              value={chofer} onChange={(e) => setChofer(e.target.value)}
              disabled={yaEnRuta}
              className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Seleccionar…</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo || c.nombre}</option>)}
            </select>
          </div>
          {pedido.estado === "en_camino" ? (
            <Button onClick={marcarEntregado} disabled={saving} className="uppercase tracking-wider font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Marcar entregado"}
            </Button>
          ) : !yaEnRuta && (
            <Button onClick={despachar} disabled={saving} className="uppercase tracking-wider font-bold">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Truck className="h-4 w-4 mr-2" /> Despachar</>}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NuevoEnvioModal({
  sucursales, choferes, insumos, stockBodega, onClose, onSaved,
}: {
  sucursales: Sucursal[];
  choferes: Chofer[];
  insumos: InsumoFull[];
  stockBodega: StockBodega[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [sucursalId, setSucursalId] = useState("");
  const [choferId, setChoferId] = useState("");
  const [notas, setNotas] = useState("");
  const [cantFmt, setCantFmt] = useState<Record<string, string>>({});
  const [cantSuel, setCantSuel] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    stockBodega.forEach((s) => m.set(s.insumo_id, s.cantidad));
    return m;
  }, [stockBodega]);

  const insumosPorTipo = useMemo(() => {
    const o: Record<string, InsumoFull[]> = {};
    TIPOS_INSUMO.forEach((t) => (o[t] = []));
    insumos.forEach((i) => {
      if (!o[i.tipo]) o[i.tipo] = [];
      o[i.tipo].push(i);
    });
    return o;
  }, [insumos]);

  const guardar = async (estadoFinal: "borrador" | "en_camino") => {
    if (!sucursalId) return toast.error("Seleccioná una sucursal");
    if (estadoFinal === "en_camino" && !choferId) return toast.error("Asigná un chofer para despachar");
    const ids = new Set([...Object.keys(cantFmt), ...Object.keys(cantSuel)]);
    const its = Array.from(ids)
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
    if (its.length === 0) return toast.error("Agregá al menos un insumo");

    if (estadoFinal === "en_camino") {
      const insuficiente = its.find((it) => (stockMap.get(it.insumo_id) ?? 0) < it.cantidad_solicitada);
      if (insuficiente) {
        const ins = insumos.find((i) => i.id === insuficiente.insumo_id);
        return toast.error(`Stock insuficiente para ${ins?.nombre ?? "insumo"}`);
      }
    }

    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        sucursal_id: sucursalId,
        estado: estadoFinal,
        notas: notas.trim() || null,
        iniciado_por_bodega: true,
      };
      if (choferId) payload.chofer_id = choferId;

      const { data, error } = await supabase.from("pedidos_logistica")
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert(payload as any).select("id").single();
      if (error) throw error;
      const pedidoId = data.id;

      const { error: eIts } = await supabase.from("pedidos_logistica_items")
        .insert(its.map((it) => ({
          ...it,
          pedido_id: pedidoId,
          cantidad_enviada: estadoFinal === "en_camino" ? it.cantidad_solicitada : null,
        })));
      if (eIts) throw eIts;

      toast.success(estadoFinal === "en_camino" ? "Envío despachado · stock descontado" : "Borrador guardado");
      onSaved();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error guardando envío");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl bg-background border-border max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Crear envío a sucursal</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="label-upper">Sucursal destino</Label>
            <select
              value={sucursalId} onChange={(e) => setSucursalId(e.target.value)}
              className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Seleccionar…</option>
              {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
          <div>
            <Label className="label-upper">Chofer asignado</Label>
            <select
              value={choferId} onChange={(e) => setChoferId(e.target.value)}
              className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">Seleccionar…</option>
              {choferes.map((c) => <option key={c.id} value={c.id}>{c.nombre_completo || c.nombre}</option>)}
            </select>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 mt-2">
          {TIPOS_INSUMO.map((tipo) => {
            const items = (insumosPorTipo[tipo] ?? []);
            if (!items.length) return null;
            return (
              <div key={tipo} className="border border-border rounded-md overflow-hidden">
                <div className="px-3 py-2 bg-muted/40 text-xs uppercase tracking-widest font-bold text-muted-foreground">{tipo}</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground text-xs">
                      <th className="px-3 py-1">Insumo</th>
                      <th className="px-3 py-1 text-right">Cajas</th>
                      <th className="px-3 py-1 text-right">Unidades</th>
                      <th className="px-3 py-1 text-right">Total</th>
                      <th className="px-3 py-1 text-right">A enviar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((i) => {
                      const stock = stockMap.get(i.id) ?? 0;
                      const base = calcularCantidadBase(
                        parseFloat(cantFmt[i.id] ?? "") || 0,
                        parseFloat(cantSuel[i.id] ?? "") || 0,
                        i,
                      );
                      const insuficiente = base > 0 && base > stock;
                      return (
                        <tr key={i.id} className="border-t border-border">
                          <td className="px-3 py-2">{i.nombre}</td>
                          <StockColumnasCells
                            cantidad={stock}
                            insumo={i}
                            sinStock
                            className="text-muted-foreground"
                            padding="sm"
                          />
                          <td className="px-3 py-2">
                            <div className={insuficiente ? "ring-1 ring-destructive rounded-md" : ""}>
                              <InputCajasUnidades
                                insumo={i}
                                valorMl={base}
                                onChange={(v) => {
                                  if (v === null) return;
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
                            </div>
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
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} className="bg-background mt-1" placeholder="Observaciones del envío…" />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button variant="secondary" onClick={() => guardar("borrador")} disabled={saving} className="uppercase tracking-wider font-bold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" /> Guardar borrador</>}
          </Button>
          <Button onClick={() => guardar("en_camino")} disabled={saving} className="uppercase tracking-wider font-bold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Send className="h-4 w-4 mr-2" /> Despachar ahora</>}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function imprimirManifiesto(
  pedido: Pedido,
  items: Item[],
  insumos: InsumoFull[],
  sucursal: Sucursal | undefined,
  chofer: Chofer | undefined,
) {
  const fecha = pedido.created_at ? new Date(pedido.created_at) : new Date();
  const fechaCorta = fecha.toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
  const horaCorta = fecha.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  const ahora = new Date().toLocaleString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const corto = pedido.id.slice(0, 8).toUpperCase();
  const choferNombre = chofer ? (chofer.nombre_completo || chofer.nombre) : "—";

  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

  const grupos: Record<string, { nombre: string; cantidadTxt: string; mlTxt: string | null; unidad: string }[]> = {};
  items.forEach((it) => {
    const ins = insumos.find((i) => i.id === it.insumo_id);
    if (!ins) return;
    if (!grupos[ins.tipo]) grupos[ins.tipo] = [];
    const base = Number(it.cantidad_enviada ?? it.cantidad_solicitada);
    grupos[ins.tipo].push({
      nombre: ins.nombre,
      cantidadTxt: formatearCantidad(base, ins),
      mlTxt: formatearMl(base, ins),
      unidad: ins.unidad ?? "u",
    });
  });

  const seccionesHtml = Object.entries(grupos).map(([tipo, arr]) => `
    <h3 class="tipo">${esc(tipo).toUpperCase()}</h3>
    <table class="insumos">
      <thead>
        <tr>
          <th class="col-insumo">Insumo</th>
          <th class="col-cant">Cantidad</th>
          <th class="col-check">✓</th>
        </tr>
      </thead>
      <tbody>
        ${arr.map((a) => `
          <tr>
            <td>${esc(a.nombre)}</td>
            <td class="center mono">
              <div>${esc(a.cantidadTxt)}</div>
              ${a.mlTxt ? `<div style="font-size:8.5pt;color:#666;font-weight:400;margin-top:2px;">${esc(a.mlTxt)}</div>` : ""}
            </td>
            <td class="center"><span class="checkbox"></span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("");

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Manifiesto ${corto}</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: 'Inter', Arial, Helvetica, sans-serif;
    font-size: 11pt;
    color: #111;
    line-height: 1.45;
    background: #fff;
  }
  .wrap { max-width: 170mm; margin: 0 auto; }

  .header { display: flex; justify-content: space-between; align-items: flex-end; padding-bottom: 10px; }
  .logo { font-size: 28pt; font-weight: 900; color: #22C55E; letter-spacing: -1px; line-height: 1; }
  .envio-num { text-align: right; font-size: 10pt; color: #555; }
  .envio-num strong { display: block; font-size: 14pt; color: #111; font-family: 'Courier New', monospace; margin-top: 2px; }

  .rule { border: 0; border-top: 2px solid #111; margin: 6px 0 14px; }
  .rule-thin { border: 0; border-top: 1px solid #333; margin: 14px 0; }

  h1.titulo { font-size: 16pt; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; margin: 0 0 14px; text-align: center; }
  h2.seccion { font-size: 12pt; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin: 14px 0 8px; color: #111; }
  h3.tipo { font-size: 11pt; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin: 12px 0 4px; color: #22C55E; }

  table { width: 100%; border-collapse: collapse; }
  table.datos td { border: 1px solid #333; padding: 6px 10px; vertical-align: top; width: 50%; }
  table.datos .lbl { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.5px; color: #666; display: block; margin-bottom: 2px; }
  table.datos .val { font-size: 11pt; font-weight: 600; color: #111; }

  table.insumos th { background: #f0f0f0; border: 1px solid #333; padding: 6px 8px; font-size: 9.5pt; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
  table.insumos td { border: 1px solid #333; padding: 6px 8px; font-size: 11pt; }
  .col-unidad, .col-cant, .col-check { width: 70px; }
  .col-check { width: 50px; }
  .center { text-align: center; }
  .mono { font-family: 'Courier New', monospace; font-weight: 600; }
  .checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #333; vertical-align: middle; }

  .obs { border: 1px solid #333; padding: 10px; min-height: 60px; font-size: 10.5pt; white-space: pre-wrap; }

  table.firmas td { border: 1px solid #333; padding: 14px; vertical-align: top; width: 50%; }
  .firma-lbl { font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #111; margin-bottom: 30px; }
  .firma-linea { border-bottom: 1px solid #111; height: 0; margin-bottom: 8px; }
  .firma-campo { font-size: 9.5pt; color: #333; margin-top: 4px; }
  .firma-campo strong { display: inline-block; min-width: 50px; color: #555; font-weight: 600; }

  .footer { margin-top: 18px; padding-top: 8px; border-top: 1px solid #ccc; font-size: 8.5pt; color: #777; text-align: center; }

  @media print {
    body { margin: 0; }
    .no-print { display: none; }
  }
</style></head><body><div class="wrap">

  <div class="header">
    <div class="logo">dlitro</div>
    <div class="envio-num">N° Envío<strong>#${corto}</strong></div>
  </div>
  <hr class="rule" />

  <h1 class="titulo">Manifiesto de Despacho</h1>

  <table class="datos">
    <tr>
      <td><span class="lbl">Fecha de despacho</span><span class="val">${fechaCorta} · ${horaCorta}</span></td>
      <td><span class="lbl">Sucursal destino</span><span class="val">${esc(sucursal?.nombre ?? "—")}</span></td>
    </tr>
    <tr>
      <td><span class="lbl">Chofer</span><span class="val">${esc(choferNombre)}</span></td>
      <td><span class="lbl">Dirección</span><span class="val">${esc(sucursal?.direccion ?? "—")}</span></td>
    </tr>
  </table>

  <hr class="rule-thin" />
  <h2 class="seccion">Detalle de insumos</h2>

  ${seccionesHtml || '<p style="color:#777;font-style:italic;">Sin insumos.</p>'}

  <hr class="rule-thin" />
  <h2 class="seccion">Observaciones</h2>
  <div class="obs">${esc(pedido.notas ?? "") || "&nbsp;"}</div>

  <hr class="rule-thin" />

  <table class="firmas">
    <tr>
      <td>
        <div class="firma-lbl">Despachado por</div>
        <div class="firma-linea"></div>
        <div class="firma-campo"><strong>Nombre:</strong> ${esc(choferNombre)}</div>
        <div class="firma-campo"><strong>Fecha:</strong> ${fechaCorta}</div>
        <div class="firma-campo"><strong>Hora:</strong> ${horaCorta}</div>
      </td>
      <td>
        <div class="firma-lbl">Recibido por</div>
        <div class="firma-linea"></div>
        <div class="firma-campo"><strong>Nombre:</strong> ____________________</div>
        <div class="firma-campo"><strong>Fecha:</strong> ____________________</div>
        <div class="firma-campo"><strong>Hora:</strong> ____________________</div>
      </td>
    </tr>
  </table>

  <div class="footer">dlitro · Sistema de Gestión · Documento generado el ${ahora}</div>
</div>
<script>window.onload = () => { setTimeout(() => window.print(), 150); }</script>
</body></html>`;

  const w = window.open("", "_blank", "width=820,height=900");
  if (!w) { toast.error("Habilitá ventanas emergentes para imprimir"); return; }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
