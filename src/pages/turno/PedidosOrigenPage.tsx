import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Check, X, Clock, MapPin, Phone, Bike, History as HistoryIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTurno } from "./TurnoPage";
import { usePedidosOrigenPendientes } from "@/hooks/usePedidosOrigenPendientes";
import { useAuthStore } from "@/stores/authStore";
import { buildPedidoImpresion } from "@/lib/pedidoImpresion";
import { imprimirAmbas } from "@/services/printer";
import { PromoPedidoBadge, DesglosePrecioPedido } from "@/lib/promoPedido";
import type { PedidosOrigenConfig } from "./pedidosOrigenConfig";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

interface Pedido {
  id: string;
  sucursal_id: string;
  turno_id: string;
  numero_pedido: number | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo: string;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  distancia_km: number | null;
  costo_despacho: number | null;
  subtotal: number;
  descuento: number | null;
  total: number;
  promo_tipo: string | null;
  cupon_id: string | null;
  jarros_entregados: number | null;
  metodo_pago: string | null;
  estado: string;
  estado_confirmacion: string;
  origen: string;
  tiempo_estimado_minutos: number | null;
  despachador_id: string | null;
  motivo_rechazo: string | null;
  created_at: string | null;
  notas: string | null;
  pedido_items?: Array<{
    id: string;
    pedido_id: string;
    cantidad: number;
    subtotal: number;
    producto_id: string;
    producto?: { id: string; nombre: string } | null;
    productos?: { id: string; nombre: string } | null;
  }>;
}
interface Item { id: string; pedido_id: string; cantidad: number; subtotal: number; producto_id: string }
interface Producto { id: string; nombre: string }
interface Despachador { id: string; nombre: string; nombre_completo: string | null }

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine"; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6);
    o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.65);
    setTimeout(() => { try { ctx.close(); } catch { /* ignore */ } }, 1000);
  } catch { /* ignore */ }
}

function tiempoRel(iso: string | null) {
  if (!iso) return "";
  const diff = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (diff < 60) return `hace ${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  return `hace ${h}h ${m % 60}m`;
}

export default function PedidosOrigenPage({ config }: { config: PedidosOrigenConfig }) {
  const { origen, icon: OrigenIcon, pedidoLabel, bannerNuevo, vacioBandeja, vacioHistorial, dialogCancelarTitulo } = config;
  const { turno } = useTurno();
  const { perfil } = useAuthStore();
  const sucursalId = turno.sucursal_id;
  const [sucursalNombre, setSucursalNombre] = useState("");
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [productos, setProductos] = useState<Record<string, Producto>>({});
  const [despachadores, setDespachadores] = useState<Despachador[]>([]);
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const [bannerOn, setBannerOn] = useState(false);
  const firstLoadRef = useRef(true);

  const { count: pendientesCount, nuevoTick } = usePedidosOrigenPendientes(sucursalId, origen);

  const [rechazarFor, setRechazarFor] = useState<Pedido | null>(null);
  const [motivo, setMotivo] = useState("");
  const [tiempos, setTiempos] = useState<Record<string, number>>({});
  const [asignados, setAsignados] = useState<Record<string, string>>({});

  const cargar = async () => {
    const { data, error } = await supabase
      .from("pedidos")
      .select("*, pedido_items(*, producto:producto_id(id, nombre))")
      .eq("sucursal_id", sucursalId)
      .eq("origen", origen)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(`[pedidos ${origen}] query error:`, error);
      toast.error(error.message);
      setLoading(false);
      return;
    }

    const peds = (data ?? []) as Pedido[];
    setPedidos(peds);

    const itRows: Item[] = [];
    const map: Record<string, Producto> = {};
    for (const p of peds) {
      for (const it of p.pedido_items ?? []) {
        itRows.push({
          id: it.id,
          pedido_id: it.pedido_id,
          cantidad: it.cantidad,
          subtotal: it.subtotal,
          producto_id: it.producto_id,
        });
        const prod = it.producto ?? it.productos;
        if (prod) map[prod.id] = prod;
      }
    }
    setItems(itRows);
    setProductos(map);

    const { data: suc } = await supabase.from("sucursales").select("nombre").eq("id", sucursalId).maybeSingle();
    setSucursalNombre((suc as { nombre?: string } | null)?.nombre ?? "");

    const { data: dRes } = await supabase
      .from("turno_despachadores")
      .select("despachador_id")
      .eq("turno_id", turno.id)
      .eq("activo", true);

    const ids = ((dRes ?? []) as { despachador_id: string }[]).map((x) => x.despachador_id);
    if (ids.length) {
      const { data: us } = await supabase.from("usuarios").select("id,nombre,nombre_completo").in("id", ids);
      setDespachadores(((us ?? []) as Despachador[]));
    } else {
      setDespachadores([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, turno.id, origen]);

  useEffect(() => {
    if (firstLoadRef.current) { firstLoadRef.current = false; return; }
    cargar();
    beep();
    setBannerOn(true);
    const t = setTimeout(() => setBannerOn(false), 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nuevoTick]);

  useEffect(() => {
    const ch = supabase
      .channel(`pedidos-${origen}-sucursal-${sucursalId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `origen=eq.${origen}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { sucursal_id?: string } | undefined;
          if (row?.sucursal_id !== sucursalId) return;
          cargar();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sucursalId, origen]);

  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const itemsPorPedido = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const it of items) (m[it.pedido_id] ??= []).push(it);
    return m;
  }, [items]);

  const pendientes = pedidos.filter((p) => p.estado_confirmacion === "pendiente_confirmacion");
  const historial = pedidos.filter((p) => p.estado_confirmacion !== "pendiente_confirmacion");

  const aceptar = async (p: Pedido) => {
    const minutos = tiempos[p.id];
    if (minutos === undefined || minutos === null || minutos < 0) {
      toast.error("Indicá tiempo estimado");
      return;
    }
    const esDespacho = p.tipo === "despacho" || p.tipo === "delivery";
    const despachadorId = esDespacho ? (asignados[p.id] ?? null) : null;

    const { data: turnoActivo, error: turnoErr } = await supabase
      .from("turnos")
      .select("id")
      .eq("sucursal_id", p.sucursal_id ?? sucursalId)
      .eq("estado", "abierto")
      .maybeSingle();

    if (turnoErr || !turnoActivo) {
      toast.error("No hay turno activo en esta sucursal");
      return;
    }

    const updatePayload = {
      estado_confirmacion: "confirmado" as const,
      estado: "en_preparacion" as const,
      tiempo_estimado_minutos: minutos,
      despachador_id: despachadorId,
      turno_id: turnoActivo.id,
    };
    console.log("payload UPDATE:", JSON.stringify(updatePayload));

    const { data, error } = await supabase
      .from("pedidos")
      .update(updatePayload)
      .eq("id", p.id)
      .select("id");

    if (error) {
      console.error("error aceptar pedido:", error);
      const detalle = [error.message, error.details, error.hint, error.code].filter(Boolean).join(" · ");
      toast.error(detalle || "Error al aceptar el pedido");
      return;
    }
    if (!data?.length) {
      toast.error("No se actualizó el pedido (0 filas). Revisá permisos RLS o que el pedido exista.");
      return;
    }

    const { data: pedidoCompleto, error: fetchErr } = await supabase
      .from("pedidos")
      .select("*, pedido_items(*, productos(*))")
      .eq("id", p.id)
      .single();

    if (!fetchErr && pedidoCompleto) {
      try {
        const desp = despachadorId ? despachadores.find((d) => d.id === despachadorId) : null;
        await imprimirAmbas(buildPedidoImpresion(pedidoCompleto, {
          sucursalNombre,
          tomadorNombre: perfil?.nombre_completo ?? perfil?.nombre ?? null,
          despachadorNombre: desp ? (desp.nombre_completo ?? desp.nombre) : null,
        }));
      } catch (e) {
        console.warn("No se pudo imprimir comandas:", e);
      }
    }

    toast.success("Pedido aceptado");
    cargar();
  };

  const confirmarRechazo = async () => {
    if (!rechazarFor) return;
    if (!motivo.trim()) { toast.error("Indicá el motivo"); return; }
    const { error } = await supabase.from("pedidos")
      .update({ estado_confirmacion: "rechazado", estado: "cancelado", motivo_rechazo: motivo.trim() })
      .eq("id", rechazarFor.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido cancelado");
    setRechazarFor(null); setMotivo("");
    cargar();
  };

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="space-y-4">
      {bannerOn && (
        <div className="fixed inset-x-0 top-0 z-50 bg-green-600 text-white text-center py-3 font-bold uppercase tracking-wider shadow-lg animate-pulse">
          {bannerNuevo}
        </div>
      )}

      <Tabs defaultValue="bandeja" className="space-y-4">
        <TabsList className="bg-card border border-border h-auto p-1">
          <TabsTrigger value="bandeja" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <OrigenIcon className="h-4 w-4" /> Bandeja
            {pendientesCount > 0 && (
              <Badge className="bg-destructive text-destructive-foreground ml-1">{pendientesCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="historial" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <HistoryIcon className="h-4 w-4" /> Historial ({historial.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="bandeja" className="space-y-4">
          {pendientes.length === 0 ? (
            <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
              {vacioBandeja}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendientes.map((p) => {
                const its = itemsPorPedido[p.id] ?? [];
                return (
                  <div key={p.id} className="bg-card border border-border rounded-xl overflow-hidden">
                    <div className="bg-primary/10 px-4 py-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider min-w-0">
                        <OrigenIcon className="h-4 w-4 text-primary shrink-0" /> {pedidoLabel}
                        {p.numero_pedido != null && <span className="text-muted-foreground">#{p.numero_pedido}</span>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PromoPedidoBadge pedido={p} compact />
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {tiempoRel(p.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="p-4 space-y-3">
                      <div>
                        <div className="font-bold uppercase">{p.cliente_nombre}</div>
                        {p.cliente_telefono && (
                          <div className="text-sm text-muted-foreground flex items-center gap-1">
                            <Phone className="h-3 w-3" /> {p.cliente_telefono}
                          </div>
                        )}
                        {p.direccion_entrega && (
                          <div className="text-sm text-muted-foreground flex items-start gap-1 mt-1">
                            <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                            <span>
                              {p.direccion_entrega}
                              {p.referencia_entrega && <span className="opacity-70"> · ref: {p.referencia_entrega}</span>}
                            </span>
                          </div>
                        )}
                        {(p.distancia_km != null || p.costo_despacho != null) && (
                          <div className="text-xs text-muted-foreground mt-1">
                            {p.distancia_km != null && <>Distancia: {Number(p.distancia_km).toFixed(1)} km · </>}
                            Despacho: {fmtCLP(p.costo_despacho ?? 0)}
                          </div>
                        )}
                      </div>

                      <div className="border-t border-border pt-2 space-y-1">
                        {its.map((it) => (
                          <div key={it.id} className="flex justify-between text-sm">
                            <span>{it.cantidad}× {productos[it.producto_id]?.nombre ?? "—"}</span>
                            <span className="tabular-nums">{fmtCLP(it.subtotal)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="border-t border-border pt-2">
                        <div className="mb-2">
                          <span className="text-xs text-muted-foreground uppercase">
                            💵 {p.metodo_pago ?? "efectivo"}
                          </span>
                        </div>
                        <DesglosePrecioPedido pedido={p} />
                      </div>

                      <div className="border-t border-border pt-3 space-y-2">
                        <div>
                          <div className="text-xs uppercase text-muted-foreground mb-1">Tiempo estimado</div>
                          <div className="flex gap-1 flex-wrap">
                            <Button
                              size="sm"
                              variant={tiempos[p.id] === 0 ? "default" : "outline"}
                              onClick={() => setTiempos((s) => ({ ...s, [p.id]: 0 }))}
                            >
                              ⚡ Inmediato
                            </Button>
                            {[15, 20, 30, 45].map((m) => (
                              <Button
                                key={m}
                                size="sm"
                                variant={tiempos[p.id] === m ? "default" : "outline"}
                                onClick={() => setTiempos((s) => ({ ...s, [p.id]: m }))}
                              >
                                {m} min
                              </Button>
                            ))}
                            <Input
                              type="number"
                              min={0}
                              className="w-20 h-8"
                              placeholder="min"
                              value={tiempos[p.id] ?? ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                setTiempos((s) => {
                                  const next = { ...s };
                                  if (v === "") delete next[p.id];
                                  else next[p.id] = Number(v);
                                  return next;
                                });
                              }}
                            />
                          </div>
                        </div>

                        {(p.tipo === "despacho" || p.tipo === "delivery") && (
                          <div>
                            <div className="text-xs uppercase text-muted-foreground mb-1 flex items-center gap-1">
                              <Bike className="h-3 w-3" /> Despachador <span className="normal-case">(opcional)</span>
                            </div>
                            <Select
                              value={asignados[p.id] ?? "__none__"}
                              onValueChange={(v) => setAsignados((s) => {
                                const next = { ...s };
                                if (v === "__none__") delete next[p.id];
                                else next[p.id] = v;
                                return next;
                              })}
                            >
                              <SelectTrigger><SelectValue placeholder="Sin asignar" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">Sin asignar</SelectItem>
                                {despachadores.length === 0 && (
                                  <div className="px-2 py-1 text-xs text-muted-foreground">No hay despachadores activos</div>
                                )}
                                {despachadores.map((d) => (
                                  <SelectItem key={d.id} value={d.id}>{d.nombre_completo ?? d.nombre}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        <div className="flex gap-2 pt-1">
                          <Button variant="outline" className="flex-1" onClick={() => setRechazarFor(p)}>
                            <X className="h-4 w-4 mr-1" /> Cancelar
                          </Button>
                          <Button className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => aceptar(p)}>
                            <Check className="h-4 w-4 mr-1" /> Aceptar
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historial">
          {historial.length === 0 ? (
            <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
              {vacioHistorial}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl divide-y divide-border">
              {historial.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-semibold">
                      #{p.numero_pedido ?? "—"} · {p.cliente_nombre}
                      <Badge
                        variant="outline"
                        className={`ml-2 ${
                          p.estado_confirmacion === "rechazado"
                            ? "border-destructive text-destructive"
                            : "border-green-600 text-green-700"
                        }`}
                      >
                        {p.estado_confirmacion === "rechazado" ? "Cancelado" : "Aceptado"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {tiempoRel(p.created_at)} · {fmtCLP(p.total)}
                      {p.motivo_rechazo && <> · motivo: {p.motivo_rechazo}</>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={!!rechazarFor} onOpenChange={(o) => { if (!o) { setRechazarFor(null); setMotivo(""); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialogCancelarTitulo}</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              Indicá el motivo. El cliente será notificado.
            </div>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej: sin stock, fuera de horario…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRechazarFor(null); setMotivo(""); }}>Volver</Button>
            <Button variant="destructive" onClick={confirmarRechazo}>Confirmar cancelación</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
