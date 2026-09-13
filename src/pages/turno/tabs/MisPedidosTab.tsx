import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Loader2, Truck, Store, Search, X, Plus, Minus, Trash2, Banknote, Landmark, CreditCard, Printer, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import type { Turno } from "../TurnoPage";
import { formatSaborExtra } from "@/lib/printComanda";
import SeleccionImpresionModal from "@/components/SeleccionImpresionModal";
import type { ComandaItem } from "@/lib/printComanda";
import {
  buildEditedItemNotes,
  comandaItemFromPedidoItem,
  parseItemNotas,
  saboresCatalogoFromItemNotes,
} from "@/lib/pedidoImpresion";
import { referenciaPagoTransferencia } from "@/lib/referenciaPago";
import { calcularDescuentoJarros } from "@/lib/descuentoJarros";
import { TIPO_META, type TipoPedido } from "@/lib/tiposPedido";
import { PromoPedidoBadge, DesglosePrecioPedido, tienePromo, esPedidoTrabajador } from "@/lib/promoPedido";
import { cn } from "@/lib/utils";
import {
  cobraRecargoPorSabor,
  precioSaborParaProducto,
  precioSinSabores,
  precioTotalSabores,
} from "@/lib/precioSaboresExtra";
import { CorreccionPedidoEntregado } from "@/components/pedidos/CorreccionPedidoEntregado";
import { AjusteCostoDespacho } from "@/components/pedidos/AjusteCostoDespacho";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { loadGoogleMaps } from "@/lib/googleMaps";
import {
  buildDeliveryLocationFields,
  calculateDeliveryCost,
  hasValidDeliveryCoordinates,
  haversineDistanceKm,
  type TarifaDespacho,
} from "@/lib/deliveryQuote";

type Estado = "en_preparacion" | "listo" | "en_despacho" | "entregado" | "cancelado";

const ESTADOS_MANUAL: Estado[] = ["en_preparacion", "listo", "en_despacho", "entregado"];

function normalizarEstado(estado: string): Estado {
  if (estado === "tomado") return "en_preparacion";
  return estado as Estado;
}

interface Pedido {
  id: string;
  numero_pedido: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo: TipoPedido;
  estado: Estado;
  total: number;
  subtotal: number;
  descuento: number | null;
  costo_despacho: number | null;
  costo_despacho_calculado: number | null;
  distancia_km: number | null;
  latitud_entrega: number | null;
  longitud_entrega: number | null;
  metodo_pago: string | null;
  pago_esperado_efectivo: number | null;
  pago_esperado_transferencia: number | null;
  pago_esperado_tarjeta: number | null;
  monto_recibido: number | null;
  vuelto: number | null;
  referencia_pago: string | null;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  despachador_id: string | null;
  notas: string | null;
  created_at: string | null;
  hora_agendada: string | null;
  jarros_prometidos: number | null;
  jarros_entregados: number | null;
  promo_tipo: string | null;
  cupon_id: string | null;
  pago_registrado: boolean | null;
  updated_at: string | null;
}
interface Despachador { id: string; nombre: string; nombre_completo: string | null }
interface Item { id: string; cantidad: number; precio_unitario: number; subtotal: number; producto: { nombre: string } | null }
interface ProductoCat { id: string; nombre: string; precio: number; categoria_id: string | null; activo: boolean | null }
interface CategoriaCat { id: string; nombre: string; orden: number | null }
interface SaborExtra { id: string; nombre: string; precio: number }
interface SucursalUbicacion { latitud: number | null; longitud: number | null }
interface EditItem {
  id?: string;            // existing pedido_items.id
  producto_id: string;
  nombre: string;
  precio_unitario: number;
  /** Precio catálogo sin extras (para descuento jarros). */
  precio_base?: number | null;
  /** Importe realmente cobrado antes de sabores; puede incluir una promoción. */
  precio_sin_sabores: number;
  sabor_extra_ids: string[];
  cantidad: number;
  descuento_item?: number | null;
  notas?: string | null;
}

const ESTADO_META: Record<Estado, { label: string; cls: string; col: string; siguiente?: Estado }> = {
  en_preparacion: { label: "En preparación", cls: "bg-warning/15 text-warning border-warning/30",       col: "border-t-warning",      siguiente: "listo" },
  listo:          { label: "Listo",          cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",     col: "border-t-blue-500",   siguiente: "en_despacho" },
  en_despacho:    { label: "En despacho",    cls: "bg-orange-500/15 text-orange-400 border-orange-500/30", col: "border-t-orange-500", siguiente: "entregado" },
  entregado:      { label: "Entregado",      cls: "bg-success/15 text-success border-success/30",       col: "border-t-success" },
  cancelado:      { label: "Cancelado",      cls: "bg-muted text-muted-foreground border-border",       col: "border-t-muted-foreground" },
};

const esPedidoExterno = (tipo: string) => tipo === "uber" || tipo === "rappi";
const esTipoDespacho = (tipo: string) => tipo === "despacho" || tipo === "delivery";

const LABEL_METODO_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  mixto: "Mixto",
  cortesia: "Cortesía",
};

function labelMetodoPago(m: string | null | undefined): string {
  if (!m) return "Pendiente";
  return LABEL_METODO_PAGO[m] ?? m;
}

interface PagoTurnoDetalle {
  metodo: string;
  monto: number;
  referencia: string | null;
}

function labelAccionEstado(tipo: string, estado: Estado): string {
  if (estado === "entregado" && esPedidoExterno(tipo)) return "Marcar entregado";
  return ESTADO_META[estado].label;
}

function jarrosDeclaradosDePedido(p: { jarros_prometidos: number | null; notas: string | null }): number {
  let n = p.jarros_prometidos ?? 0;
  if (!n) {
    const m = (p.notas ?? "").match(/\[JARROS DEVUELTOS\]\s*(\d+)/i);
    n = m ? parseInt(m[1], 10) || 0 : 0;
  }
  return n;
}

interface ItemJarrosCalc {
  precio_unitario: number;
  cantidad: number;
  precio_base?: number | null;
  notas?: string | null;
}

function calcularDescuentoJarrosEntrega(jarros: number, pedidoItems: ItemJarrosCalc[]) {
  return calcularDescuentoJarros(jarros, pedidoItems);
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);
const fmtHora = (s: string | null) => s ? new Date(s).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "—";

type TipoFamilia = "local" | "delivery" | "uber" | "rappi" | "puerta";
const familia = (t: string): TipoFamilia => {
  if (t === "despacho") return "delivery";
  if (t === "retiro") return "local";
  if (t === "uber" || t === "rappi" || t === "delivery" || t === "local" || t === "puerta") return t;
  return "local";
};

type TipoFiltro = "despacho" | "retiro" | "uber" | "rappi";
type PagoFiltro = "efectivo" | "transferencia" | "tarjeta" | "cortesia";

const ESTADOS_ACTIVOS_DEFAULT: Estado[] = ["en_preparacion", "listo", "en_despacho"];
const ESTADO_FILTRO_OPTS: { id: Estado; label: string }[] = [
  { id: "en_preparacion", label: "Prep" },
  { id: "listo", label: "Listo" },
  { id: "en_despacho", label: "Despacho" },
  { id: "entregado", label: "Entregado" },
  { id: "cancelado", label: "Cancelado" },
];
const TIPO_FILTRO_OPTS: { id: TipoFiltro; label: string }[] = [
  { id: "despacho", label: "Despacho" },
  { id: "retiro", label: "Retiro" },
  { id: "uber", label: "Uber" },
  { id: "rappi", label: "Rappi" },
];
const PAGO_FILTRO_OPTS: { id: PagoFiltro; label: string }[] = [
  { id: "efectivo", label: "Efectivo" },
  { id: "transferencia", label: "Transfer" },
  { id: "tarjeta", label: "Tarjeta" },
  { id: "cortesia", label: "Cortesía" },
];

const PAGO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cortesia: "Cortesía",
  mixto: "Mixto",
};

function matchTipoFiltro(tipo: string, f: TipoFiltro): boolean {
  if (f === "despacho") return tipo === "despacho" || tipo === "delivery";
  if (f === "retiro") return tipo === "retiro" || tipo === "local";
  return tipo === f;
}

function labelTipoLista(tipo: string): string {
  if (tipo === "despacho" || tipo === "delivery") return "DESPACHO";
  if (tipo === "retiro" || tipo === "local") return "RETIRO";
  if (tipo === "uber") return "UBER";
  if (tipo === "rappi") return "RAPPI";
  if (tipo === "puerta") return "PUERTA";
  return (TIPO_META[tipo as TipoPedido]?.short ?? tipo).toUpperCase();
}

function toggleEnSet<T>(set: Set<T>, value: T): Set<T> {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterPill({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider border transition",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

export default function MisPedidosTab({ turno }: { turno: Turno }) {
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [despachadores, setDespachadores] = useState<Despachador[]>([]);
  const [loading, setLoading] = useState(true);
  const [busquedaNumero, setBusquedaNumero] = useState("");
  const [busquedaCliente, setBusquedaCliente] = useState("");
  const [estadosSel, setEstadosSel] = useState<Set<Estado>>(() => new Set(ESTADOS_ACTIVOS_DEFAULT));
  const [tiposSel, setTiposSel] = useState<Set<TipoFiltro>>(new Set());
  const [pagosSel, setPagosSel] = useState<Set<PagoFiltro>>(new Set());
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [sucursalNombre, setSucursalNombre] = useState<string>("");
  const [pedidoParaReimprimir, setPedidoParaReimprimir] = useState<Pedido | null>(null);
  const [reimprimirEdicion, setReimprimirEdicion] = useState<{
    pedido: Pedido;
    items: ComandaItem[];
    removed: ComandaItem[];
  } | null>(null);

  const cargar = async () => {
    const { data } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, cliente_nombre, cliente_telefono, tipo, estado, total, subtotal, descuento, costo_despacho, costo_despacho_calculado, distancia_km, latitud_entrega, longitud_entrega, metodo_pago, pago_esperado_efectivo, pago_esperado_transferencia, pago_esperado_tarjeta, monto_recibido, vuelto, referencia_pago, direccion_entrega, referencia_entrega, despachador_id, notas, created_at, updated_at, hora_agendada, jarros_prometidos, jarros_entregados, promo_tipo, cupon_id, pago_registrado")
      .eq("turno_id", turno.id)
      .order("numero_pedido", { ascending: false });
    setPedidos(((data as Pedido[]) ?? []).map((p) => ({ ...p, estado: normalizarEstado(p.estado) })));
    setLoading(false);
  };

  useEffect(() => {
    cargar();
    (async () => {
      const { data } = await supabase
        .from("turno_despachadores")
        .select("despachador_id, usuarios:despachador_id(id,nombre,nombre_completo)")
        .eq("turno_id", turno.id)
        .eq("activo", true);
      const map = (data as { usuarios: Despachador }[] | null) ?? [];
      setDespachadores(map.map((r) => r.usuarios).filter(Boolean));
    })();
    (async () => {
      const { data } = await supabase.from("sucursales").select("nombre").eq("id", turno.sucursal_id).maybeSingle();
      setSucursalNombre((data as { nombre?: string } | null)?.nombre ?? "");
    })();

    const ch = supabase
      .channel(`pedidos-turno-${turno.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `turno_id=eq.${turno.id}` }, () => cargar())
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos", filter: `sucursal_id=eq.${turno.sucursal_id}` },
        (payload) => {
          const row = payload.new as { turno_id?: string };
          if (row.turno_id === turno.id) cargar();
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno.id]);

  const numeroBuscado = useMemo(() => {
    const raw = busquedaNumero.trim().replace(/^#/, "");
    if (!raw) return null;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : null;
  }, [busquedaNumero]);

  const textoCliente = useMemo(() => busquedaCliente.trim().toLowerCase(), [busquedaCliente]);

  const matchCliente = (p: Pedido, q: string) =>
    p.cliente_nombre.toLowerCase().includes(q) ||
    (p.cliente_telefono ?? "").toLowerCase().includes(q) ||
    (p.direccion_entrega ?? "").toLowerCase().includes(q);

  const filtrados = useMemo(() => {
    // Búsqueda por # tiene prioridad: ignora estado/tipo/pago y texto cliente
    if (numeroBuscado !== null) {
      return pedidos
        .filter((p) => p.numero_pedido === numeroBuscado)
        .slice()
        .sort((a, b) => b.numero_pedido - a.numero_pedido);
    }

    const estadoTodos = estadosSel.size === 0;
    const tipoTodos = tiposSel.size === 0;
    const pagoTodos = pagosSel.size === 0;

    return pedidos
      .filter((p) => {
        if (textoCliente && !matchCliente(p, textoCliente)) return false;
        if (!estadoTodos && !estadosSel.has(p.estado)) return false;
        if (!tipoTodos && ![...tiposSel].some((t) => matchTipoFiltro(p.tipo, t))) return false;
        if (!pagoTodos) {
          const metodo = (p.metodo_pago ?? "").toLowerCase();
          if (!metodo || ![...pagosSel].some((m) => metodo === m)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => b.numero_pedido - a.numero_pedido);
  }, [pedidos, numeroBuscado, textoCliente, estadosSel, tiposSel, pagosSel]);

  const contadores = useMemo(() => {
    const prep = filtrados.filter((p) => p.estado === "en_preparacion").length;
    const listos = filtrados.filter((p) => p.estado === "listo").length;
    const despacho = filtrados.filter((p) => p.estado === "en_despacho").length;
    return { prep, listos, despacho };
  }, [filtrados]);

  const detalle = useMemo(() => pedidos.find((p) => p.id === detalleId) ?? null, [pedidos, detalleId]);

  const reimprimir = (p: Pedido) => {
    setPedidoParaReimprimir(p);
  };

  const reimprimirEditado = (
    p: Pedido,
    items: ComandaItem[],
    removed: ComandaItem[],
  ) => {
    setReimprimirEdicion({ pedido: p, items, removed });
  };

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  const estadoTodosActivo = estadosSel.size === 0;
  const tipoTodosActivo = tiposSel.size === 0;
  const pagoTodosActivo = pagosSel.size === 0;

  const partesContador: string[] = [];
  if (contadores.prep > 0) partesContador.push(`${contadores.prep} en preparación`);
  if (contadores.listos > 0) partesContador.push(`${contadores.listos} listo${contadores.listos === 1 ? "" : "s"}`);
  if (contadores.despacho > 0) partesContador.push(`${contadores.despacho} en despacho`);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-3 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <span className="label-upper text-[10px] text-muted-foreground">N° pedido</span>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                value={busquedaNumero}
                onChange={(e) => {
                  setBusquedaNumero(e.target.value);
                  if (e.target.value) setBusquedaCliente("");
                }}
                placeholder="Ej: 15"
                className="bg-background pl-9 font-mono"
              />
              {busquedaNumero && (
                <button
                  type="button"
                  onClick={() => setBusquedaNumero("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar N° pedido"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <div className="space-y-1.5">
            <span className="label-upper text-[10px] text-muted-foreground">Buscar cliente</span>
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                value={busquedaCliente}
                onChange={(e) => {
                  setBusquedaCliente(e.target.value);
                  if (e.target.value) setBusquedaNumero("");
                }}
                placeholder="Nombre, teléfono, dirección..."
                className="bg-background pl-9"
              />
              {busquedaCliente && (
                <button
                  type="button"
                  onClick={() => setBusquedaCliente("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-6 w-6 inline-flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                  aria-label="Limpiar búsqueda cliente"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="label-upper text-[10px] text-muted-foreground">Estado</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill active={estadoTodosActivo} onClick={() => setEstadosSel(new Set())}>Todos</FilterPill>
            {ESTADO_FILTRO_OPTS.map((o) => (
              <FilterPill
                key={o.id}
                active={!estadoTodosActivo && estadosSel.has(o.id)}
                onClick={() => setEstadosSel((prev) => {
                  if (prev.size === 0) return new Set<Estado>([o.id]);
                  return toggleEnSet(prev, o.id);
                })}
              >
                {o.label}
              </FilterPill>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="label-upper text-[10px] text-muted-foreground">Tipo</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill active={tipoTodosActivo} onClick={() => setTiposSel(new Set())}>Todos</FilterPill>
            {TIPO_FILTRO_OPTS.map((o) => (
              <FilterPill
                key={o.id}
                active={!tipoTodosActivo && tiposSel.has(o.id)}
                onClick={() => setTiposSel((prev) => {
                  if (prev.size === 0) return new Set<TipoFiltro>([o.id]);
                  return toggleEnSet(prev, o.id);
                })}
              >
                {o.label}
              </FilterPill>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="label-upper text-[10px] text-muted-foreground">Pago</span>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill active={pagoTodosActivo} onClick={() => setPagosSel(new Set())}>Todos</FilterPill>
            {PAGO_FILTRO_OPTS.map((o) => (
              <FilterPill
                key={o.id}
                active={!pagoTodosActivo && pagosSel.has(o.id)}
                onClick={() => setPagosSel((prev) => {
                  if (prev.size === 0) return new Set<PagoFiltro>([o.id]);
                  return toggleEnSet(prev, o.id);
                })}
              >
                {o.label}
              </FilterPill>
            ))}
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        Mostrando <span className="font-mono text-foreground font-semibold">{filtrados.length}</span> pedido{filtrados.length === 1 ? "" : "s"}
        {partesContador.length > 0 && (
          <span>{"  |  "}{partesContador.join(" · ")}</span>
        )}
      </div>

      {filtrados.length === 0 ? (
        <div className="p-10 text-center text-muted-foreground text-sm bg-card border border-border rounded-xl">
          {numeroBuscado !== null
            ? `No se encontró el pedido #${numeroBuscado}`
            : "No hay pedidos con estos filtros."}
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {filtrados.map((p) => {
            const tcfg = TIPO_META[p.tipo] ?? TIPO_META.local;
            const emeta = ESTADO_META[p.estado];
            const pagoTxt = p.metodo_pago
              ? (PAGO_LABEL[p.metodo_pago.toLowerCase()] ?? p.metodo_pago)
              : "—";
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetalleId(p.id)}
                className="bg-card border border-border rounded-lg p-2.5 text-left hover:border-primary transition flex flex-col gap-1.5 min-w-0"
              >
                <div className="flex items-start justify-between gap-1">
                  <span className="font-display text-2xl font-bold text-primary leading-none">
                    #{p.numero_pedido}
                  </span>
                  <Badge className={`${tcfg.badgeCls} border text-[9px] px-1.5 py-0 font-bold shrink-0`} variant="outline">
                    {labelTipoLista(p.tipo)}
                  </Badge>
                </div>

                <div className="text-xs font-medium text-foreground truncate leading-tight">
                  {p.cliente_nombre}
                </div>

                {(p.tipo === "despacho" || p.tipo === "delivery") && p.direccion_entrega && (
                  <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">
                    📍 {p.direccion_entrega}
                  </p>
                )}

                <Badge
                  className={`${emeta.cls} border w-full justify-center text-[9px] px-1 py-0.5 font-bold uppercase tracking-wider`}
                  variant="outline"
                >
                  {emeta.label}
                </Badge>

                <div className="font-mono text-base font-bold leading-none" style={{ color: "#7FFF00" }}>
                  {fmtCLP(p.total)}
                </div>

                <div className="flex items-center justify-between gap-1 text-[10px] text-muted-foreground">
                  <span className="truncate uppercase tracking-wider">{pagoTxt}</span>
                  <span className="font-mono shrink-0">{fmtHora(p.created_at)}</span>
                </div>

                {(tienePromo(p) || p.pago_registrado || p.tipo === "uber" || p.tipo === "rappi") && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {esPedidoTrabajador(p) ? (
                      <Badge
                        className="text-[8px] px-1 py-0 font-bold border"
                        variant="outline"
                        style={{ backgroundColor: "#7FFF00", color: "#1a4d1a", borderColor: "#5cb800" }}
                      >
                        👷 TRABAJADOR
                      </Badge>
                    ) : tienePromo(p) ? (
                      <Badge
                        className="text-[8px] px-1 py-0 font-bold border"
                        variant="outline"
                        style={{ backgroundColor: "#7FFF00", color: "#1a4d1a", borderColor: "#5cb800" }}
                      >
                        🏷️ PROMO
                      </Badge>
                    ) : null}
                    {p.pago_registrado && (
                      <Badge className="bg-success/15 text-success border-success/40 text-[8px] px-1 py-0 font-bold" variant="outline">
                        ✓ PAGADO
                      </Badge>
                    )}
                    {p.tipo === "uber" && (
                      <Badge className="bg-zinc-900 text-white border-white/20 text-[8px] px-1 py-0 font-bold" variant="outline">
                        UBER
                      </Badge>
                    )}
                    {p.tipo === "rappi" && (
                      <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/40 text-[8px] px-1 py-0 font-bold" variant="outline">
                        RAPPI
                      </Badge>
                    )}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      <PedidoDetalleModal
        pedido={detalle}
        despachadores={despachadores}
        open={!!detalleId}
        onClose={() => setDetalleId(null)}
        onChanged={cargar}
        onReimprimir={reimprimir}
        onReimprimirEditado={reimprimirEditado}
        sucursalId={turno.sucursal_id}
      />
      <SeleccionImpresionModal
        pedido={pedidoParaReimprimir}
        despachadores={despachadores}
        sucursalNombre={sucursalNombre}
        open={!!pedidoParaReimprimir}
        onClose={() => setPedidoParaReimprimir(null)}
      />
      <SeleccionImpresionModal
        pedido={reimprimirEdicion?.pedido ?? null}
        despachadores={despachadores}
        sucursalNombre={sucursalNombre}
        open={!!reimprimirEdicion}
        onClose={() => setReimprimirEdicion(null)}
        itemsOverride={reimprimirEdicion?.items}
        removedItems={reimprimirEdicion?.removed}
        editado
      />
    </div>
  );
}

function PedidoDetalleModal({
  pedido, despachadores, open, onClose, onChanged, onReimprimir, onReimprimirEditado, sucursalId,
}: {
  pedido: Pedido | null;
  despachadores: Despachador[];
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  onReimprimir: (p: Pedido) => void;
  onReimprimirEditado: (p: Pedido, items: ComandaItem[], removed: ComandaItem[]) => void;
  sucursalId: string;
}) {
  const [items, setItems] = useState<EditItem[]>([]);
  const [originalItemIds, setOriginalItemIds] = useState<string[]>([]);
  const [originalItemsTotal, setOriginalItemsTotal] = useState<number>(0);
  const [originalItemsSnapshot, setOriginalItemsSnapshot] = useState<EditItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [productos, setProductos] = useState<ProductoCat[]>([]);
  const [categorias, setCategorias] = useState<CategoriaCat[]>([]);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [catBusqueda, setCatBusqueda] = useState("");
  const [catSel, setCatSel] = useState<string>("__all__");
  const [sabores, setSabores] = useState<SaborExtra[]>([]);
  const [extrasFor, setExtrasFor] = useState<ProductoCat | null>(null);
  const [extrasSel, setExtrasSel] = useState<Set<string>>(new Set());
  const [editingItemIndex, setEditingItemIndex] = useState<number | null>(null);
  const [editingExtrasSel, setEditingExtrasSel] = useState<Set<string>>(new Set());
  const [editingItemNote, setEditingItemNote] = useState("");

  const [cNombre, setCNombre] = useState("");
  const [cTel, setCTel] = useState("");
  const [dir, setDir] = useState("");
  const [ref, setRef] = useState("");
  const [latitud, setLatitud] = useState<number | null>(null);
  const [longitud, setLongitud] = useState<number | null>(null);
  const [ubicacionModificada, setUbicacionModificada] = useState(false);
  const [distanciaApi, setDistanciaApi] = useState<number | null>(null);
  const [sucursalUbicacion, setSucursalUbicacion] = useState<SucursalUbicacion | null>(null);
  const [tarifasDespacho, setTarifasDespacho] = useState<TarifaDespacho[]>([]);
  const [despId, setDespId] = useState<string>("__none__");
  const [notas, setNotas] = useState("");
  const [tipo, setTipo] = useState<"despacho" | "retiro">("despacho");

  const [cancelarOpen, setCancelarOpen] = useState(false);
  const [motivo, setMotivo] = useState("");

  // Modal pago al entregar
  const [pagoOpen, setPagoOpen] = useState(false);
  const [pagoEfectivo, setPagoEfectivo] = useState<string>("");
  const [pagoTransfer, setPagoTransfer] = useState<string>("");
  const [pagoTransferRef, setPagoTransferRef] = useState<string>("");
  const [pagoTarjeta, setPagoTarjeta] = useState<string>("");
  const [pagoObs, setPagoObs] = useState<string>("");
  const [pagoSaving, setPagoSaving] = useState(false);
  const [pasoEntrega, setPasoEntrega] = useState<"jarros" | "jarros_cantidad" | "pago">("jarros");
  const [jarrosComprometidos, setJarrosComprometidos] = useState<number>(0);
  const [jarrosRealesInput, setJarrosRealesInput] = useState("0");
  const [jarrosEntregadosFinal, setJarrosEntregadosFinal] = useState(0);
  const [totalEntrega, setTotalEntrega] = useState(0);
  const [entregoJarros, setEntregoJarros] = useState<boolean | null>(null);
  const [alertaSinDespachador, setAlertaSinDespachador] = useState(false);
  const [cambiandoDespachador, setCambiandoDespachador] = useState(false);
  const [guardandoDespachador, setGuardandoDespachador] = useState(false);
  const pagoTransferRefTouched = useRef(false);
  const [pagosDetalle, setPagosDetalle] = useState<PagoTurnoDetalle[]>([]);

  useEffect(() => {
    if (!pedido) return;
    setCNombre(pedido.cliente_nombre);
    setCTel(pedido.cliente_telefono ?? "");
    setDir(pedido.direccion_entrega ?? "");
    setRef(pedido.referencia_entrega ?? "");
    setLatitud(pedido.latitud_entrega);
    setLongitud(pedido.longitud_entrega);
    setUbicacionModificada(false);
    setDistanciaApi(null);
    setEditingItemIndex(null);
    setEditingExtrasSel(new Set());
    setEditingItemNote("");
    setDespId(pedido.despachador_id ?? "__none__");
    setNotas(pedido.notas ?? "");
    setTipo(familia(pedido.tipo) === "delivery" ? "despacho" : "retiro");
    setCancelarOpen(false);
    setMotivo("");
    setPagosDetalle([]);
    // Jarros prometidos al tomar el pedido (fallback a notas antiguas)
    let compr = pedido.jarros_prometidos ?? 0;
    if (!compr) {
      const m = (pedido.notas ?? "").match(/\[JARROS DEVUELTOS\]\s*(\d+)/i);
      compr = m ? parseInt(m[1], 10) || 0 : 0;
    }
    setJarrosComprometidos(compr);
    setCambiandoDespachador(false);
    setLoading(true);
    (async () => {
      const entregado = normalizarEstado(pedido.estado) === "entregado";
      const [itemsRes, prodRes, catRes, sxRes, pagosRes, sucursalRes, tarifasRes] = await Promise.all([
        supabase
          .from("pedido_items")
          .select("id, cantidad, precio_unitario, descuento_item, notas, producto_id, producto:producto_id(nombre, precio)")
          .eq("pedido_id", pedido.id),
        supabase.from("productos").select("id,nombre,precio,categoria_id,activo").eq("activo", true).order("nombre"),
        supabase.from("categorias").select("id,nombre,orden").order("orden"),
        supabase.from("sabores_extra").select("id,nombre,precio").eq("activo", true).order("nombre"),
        entregado
          ? supabase
              .from("pagos_turno")
              .select("metodo, monto, referencia")
              .eq("pedido_id", pedido.id)
          : Promise.resolve({ data: null }),
        supabase
          .from("sucursales")
          .select("latitud,longitud")
          .eq("id", sucursalId)
          .maybeSingle(),
        supabase
          .from("tarifas_despacho")
          .select("tramo,distancia_desde,distancia_hasta,precio")
          .order("tramo"),
      ]);
      const prods = (prodRes.data as ProductoCat[]) ?? [];
      const saboresDisponibles = (sxRes.data as SaborExtra[]) ?? [];
      const its = ((itemsRes.data as unknown as Array<{
        id: string;
        cantidad: number;
        precio_unitario: number;
        descuento_item: number | null;
        notas: string | null;
        producto_id: string;
        producto: { nombre: string; precio: number } | null;
      }>) ?? []).map((r) => {
        const nombreProducto = r.producto?.nombre ?? "—";
        const extrasPersistidos = parseItemNotas(r.notas).extras;
        const saboresPersistidos = saboresCatalogoFromItemNotes(r.notas, saboresDisponibles);
        const saboresParaPrecio = saboresPersistidos.length === extrasPersistidos.length
          ? saboresPersistidos
          : extrasPersistidos;
        const precioBase =
          r.producto?.precio != null
            ? Number(r.producto.precio)
            : (prods.find((p) => p.id === r.producto_id)?.precio ?? r.precio_unitario);
        return {
          id: r.id,
          producto_id: r.producto_id,
          nombre: nombreProducto,
          precio_unitario: r.precio_unitario,
          precio_base: precioBase,
          precio_sin_sabores: precioSinSabores({ nombre: nombreProducto }, r.precio_unitario, saboresParaPrecio),
          sabor_extra_ids: saboresPersistidos.map((sabor) => sabor.id),
          cantidad: r.cantidad,
          descuento_item: r.descuento_item,
          notas: r.notas,
        };
      });
      setItems(its);
      setOriginalItemIds(its.map((i) => i.id!).filter(Boolean));
      setOriginalItemsTotal(its.reduce((acc, it) => acc + it.precio_unitario * it.cantidad, 0));
      setOriginalItemsSnapshot(its.map((i) => ({ ...i })));
      setProductos(prods);
      setCategorias((catRes.data as CategoriaCat[]) ?? []);
      setSabores(saboresDisponibles);
      const pagosActuales = ((pagosRes.data as PagoTurnoDetalle[] | null) ?? [])
        .filter((p) => Number(p.monto) > 0);
      setPagosDetalle(pagosActuales);
      setSucursalUbicacion((sucursalRes.data as SucursalUbicacion | null) ?? null);
      setTarifasDespacho((tarifasRes.data as unknown as TarifaDespacho[] | null) ?? []);
      setLoading(false);
    })();
  }, [pedido, sucursalId]);

  useEffect(() => {
    if (
      tipo !== "despacho"
      || !ubicacionModificada
      || !hasValidDeliveryCoordinates(latitud, longitud)
      || sucursalUbicacion?.latitud == null
      || sucursalUbicacion?.longitud == null
    ) {
      setDistanciaApi(null);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const googleMaps = await loadGoogleMaps();
        const service = new googleMaps.maps.DistanceMatrixService();
        service.getDistanceMatrix(
          {
            origins: [{ lat: Number(sucursalUbicacion.latitud), lng: Number(sucursalUbicacion.longitud) }],
            destinations: [{ lat: latitud!, lng: longitud! }],
            travelMode: googleMaps.maps.TravelMode.DRIVING,
          },
          (response: google.maps.DistanceMatrixResponse | null, status: google.maps.DistanceMatrixStatus) => {
            if (cancelled) return;
            const element = response?.rows?.[0]?.elements?.[0];
            setDistanciaApi(status === "OK" && element?.status === "OK"
              ? element.distance.value / 1000
              : null);
          },
        );
      } catch (error) {
        if (!cancelled) {
          console.error("[distance matrix edición pedido]", error);
          setDistanciaApi(null);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tipo, ubicacionModificada, latitud, longitud, sucursalUbicacion]);

  if (!pedido) return null;
  const meta = ESTADO_META[normalizarEstado(pedido.estado)];
  const estadoActual = normalizarEstado(pedido.estado);
  const pedidoCerrado = estadoActual === "entregado" || estadoActual === "cancelado";
  // La comanda (pedido_items) se congela al entrar a despacho -- el resto del
  // pedido (cliente, dirección, despachador, notas) sigue editable ahí, ver
  // guard_pedido_items_lifecycle_v2 en 20260817164101_order_modification_lifecycle_rule.sql.
  const itemsLocked = pedidoCerrado || estadoActual === "en_despacho";

  const subtotal = items.reduce((acc, it) => acc + it.precio_unitario * it.cantidad, 0);
  // NO recalcular promos al editar. Total editado = pedido.total original + delta de items.
  // Si cambia el tipo o la ubicación, se incorpora la nueva tarifa sin recalcular promociones.
  const costoDespachoOriginal = pedido.costo_despacho ?? 0;
  const necesitaNuevaCotizacion = tipo === "despacho"
    && (ubicacionModificada || !esTipoDespacho(pedido.tipo));
  const distanciaEntrega = tipo !== "despacho"
    ? null
    : necesitaNuevaCotizacion && hasValidDeliveryCoordinates(latitud, longitud)
      ? distanciaApi ?? (
        sucursalUbicacion?.latitud != null && sucursalUbicacion?.longitud != null
          ? haversineDistanceKm(
            Number(sucursalUbicacion.latitud),
            Number(sucursalUbicacion.longitud),
            latitud!,
            longitud!,
          )
          : null
      )
      : pedido.distancia_km;
  const costoDespachoCalculado = distanciaEntrega != null && distanciaEntrega > 0
    ? calculateDeliveryCost(distanciaEntrega, tarifasDespacho)
    : 0;
  const costoDespacho = tipo === "despacho"
    ? (necesitaNuevaCotizacion ? costoDespachoCalculado : costoDespachoOriginal)
    : 0;
  const deltaItems = subtotal - originalItemsTotal;
  const ajusteDespacho = costoDespacho - costoDespachoOriginal; // 0 salvo cambio a retiro
  const totalCalc = Math.max(0, pedido.total + deltaItems + ajusteDespacho);
  const editingItem = editingItemIndex == null ? null : items[editingItemIndex] ?? null;
  const editingItemExtras = editingItem == null
    ? []
    : sabores.filter((sabor) => editingExtrasSel.has(sabor.id));
  const editingItemPrice = editingItem == null
    ? 0
    : editingItem.precio_sin_sabores + precioTotalSabores(editingItem, editingItemExtras);

  const cambiarCant = (idx: number, delta: number) => {
    setItems((prev) => prev
      .map((it, i) => i === idx ? { ...it, cantidad: it.cantidad + delta } : it)
      .filter((it) => it.cantidad > 0));
  };
  const eliminarItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));
  const agregarProducto = (p: ProductoCat) => {
    if (sabores.length > 0) { setExtrasFor(p); setExtrasSel(new Set()); return; }
    pushItem(p, []);
  };
  const pushItem = (p: ProductoCat, extras: SaborExtra[]) => {
    const extrasPrecio = precioTotalSabores(p, extras);
    const precio = p.precio + extrasPrecio;
    const nota = extras.length > 0 ? `Extras: ${extras.map((e) => formatSaborExtra(e.nombre)).join(", ")}` : null;
    setItems((prev) => [...prev, {
      producto_id: p.id,
      nombre: p.nombre,
      precio_unitario: precio,
      precio_base: p.precio,
      precio_sin_sabores: p.precio,
      sabor_extra_ids: extras.map((extra) => extra.id),
      cantidad: 1,
      notas: nota,
    }]);
  };
  const confirmarExtras = (conExtras: boolean) => {
    if (!extrasFor) return;
    const sel = conExtras ? sabores.filter((s) => extrasSel.has(s.id)) : [];
    pushItem(extrasFor, sel);
    setExtrasFor(null);
    setExtrasSel(new Set());
  };
  const productosFiltrados = productos.filter((p) => {
    if (catSel !== "__all__" && p.categoria_id !== catSel) return false;
    if (catBusqueda && !p.nombre.toLowerCase().includes(catBusqueda.toLowerCase())) return false;
    return true;
  });

  const iniciarFlujoEntrega = async () => {
    if (!pedido?.id) { toast.error("Pedido sin ID, recargá la página"); return; }
    if (esPedidoExterno(pedido.tipo)) {
      const { error, data } = await supabase
        .from("pedidos")
        .update({
          estado: "entregado",
          metodo_pago: "cortesia",
          pago_registrado: true,
        })
        .eq("id", pedido.id)
        .select("id");
      if (error) { console.error("[pedidos] update entregado externo error:", error); toast.error(error.message); return; }
      if (!data?.length) { toast.error("No se pudo actualizar el pedido"); return; }
      toast.success("Pedido marcado como entregado");
      onChanged();
      return;
    }
    if (pedido.pago_registrado) {
      const { error, data } = await supabase
        .from("pedidos")
        .update({ estado: "entregado" })
        .eq("id", pedido.id)
        .select("id");
      if (error) { console.error("[pedidos] update entregado error:", error); toast.error(error.message); return; }
      if (!data?.length) { toast.error("No se pudo actualizar el pedido"); return; }
      toast.success("Pedido entregado (pago ya registrado)");
      onChanged();
      return;
    }
    // abrir modal de confirmación de pago (solo si aún no hay pago)
    setPagoEfectivo("");
    setPagoTransfer("");
    setPagoTransferRef("");
    pagoTransferRefTouched.current = false;
    setPagoTarjeta("");
    setPagoObs("");
    const declarados = jarrosDeclaradosDePedido(pedido);
    setTotalEntrega(pedido.total);
    setEntregoJarros(null);
    setJarrosRealesInput("0");
    setJarrosEntregadosFinal(0);
    setPasoEntrega(declarados > 0 ? "jarros" : "pago");
    setPagoOpen(true);
  };

  const cambiarEstado = async (nuevo: Estado) => {
    if (!pedido?.id) { toast.error("Pedido sin ID, recargá la página"); return; }
    const actual = normalizarEstado(pedido.estado);
    if (actual === "entregado" || actual === "cancelado") {
      toast.error(actual === "entregado"
        ? "Pedido entregado — no se puede modificar"
        : "Pedido cancelado — no se puede modificar");
      return;
    }
    if (nuevo === "entregado") {
      if (esTipoDespacho(pedido.tipo) && !pedido.despachador_id) {
        setAlertaSinDespachador(true);
        return;
      }
      await iniciarFlujoEntrega();
      return;
    }
    const { error, data } = await supabase
      .from("pedidos")
      .update({ estado: nuevo })
      .eq("id", pedido.id)
      .select("id");
    if (error) { console.error("[pedidos] update estado error:", error); toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error("No se encontró el pedido o no tenés permisos para actualizarlo"); return; }
    toast.success(`Estado: ${ESTADO_META[nuevo].label}`);
    onChanged();
  };

  const guardarDespachadorCerrado = async (nuevoId: string) => {
    if (!pedido?.id) return;
    const despachadorId = nuevoId === "__none__" ? null : nuevoId;
    setGuardandoDespachador(true);
    const { error } = await supabase
      .from("pedidos")
      .update({ despachador_id: despachadorId })
      .eq("id", pedido.id);
    setGuardandoDespachador(false);
    if (error) { toast.error(error.message); return; }
    setDespId(nuevoId);
    setCambiandoDespachador(false);
    toast.success(despachadorId ? "Despachador actualizado" : "Despachador quitado");
    onChanged();
  };

  const pagoEf = parseInt(pagoEfectivo || "0", 10) || 0;
  const pagoTr = parseInt(pagoTransfer || "0", 10) || 0;
  const pagoTa = parseInt(pagoTarjeta || "0", 10) || 0;
  const pagoIngresado = pagoEf + pagoTr + pagoTa;
  const subtotalPedido = pedido.subtotal ?? subtotal;
  const costoDespachoPedido = pedido.costo_despacho ?? 0;
  const descuentoJarrosAplicado = pedido.descuento ?? 0;
  const sinJarrosDeclarados = jarrosComprometidos <= 0;
  const jarrosRealesParcial = Math.min(
    jarrosComprometidos,
    Math.max(0, parseInt(jarrosRealesInput || "0", 10) || 0),
  );
  const jarrosAlEntregarInput = Math.max(0, parseInt(jarrosRealesInput || "0", 10) || 0);
  const descuentoParcialCalc = calcularDescuentoJarrosEntrega(jarrosRealesParcial, items);
  const descuentoParcialPreview = jarrosRealesParcial === 0 ? 0 : descuentoParcialCalc.total;
  const totalParcialPreview = Math.max(
    0,
    subtotalPedido + costoDespachoPedido - descuentoParcialPreview,
  );
  const descuentoAlEntregarCalc = calcularDescuentoJarrosEntrega(jarrosAlEntregarInput, items);
  const descuentoAlEntregarPreview = jarrosAlEntregarInput === 0 ? 0 : descuentoAlEntregarCalc.total;
  const descuentoBasePedido = pedido.descuento ?? 0;
  const totalAlEntregarPreview = Math.max(
    0,
    subtotalPedido + costoDespachoPedido - (descuentoBasePedido + descuentoAlEntregarPreview),
  );
  const totalACobrar = sinJarrosDeclarados && pasoEntrega === "pago"
    ? totalAlEntregarPreview
    : totalEntrega;
  const pagoDiferencia = pagoIngresado - totalACobrar;
  const esEntregaGratuita = totalACobrar === 0;

  const notaJarrosEntrega = (): string | null => {
    if (sinJarrosDeclarados) {
      if (jarrosAlEntregarInput <= 0) return null;
      const desc = descuentoAlEntregarPreview;
      return `[JARROS ENTREGADOS] ${jarrosAlEntregarInput}${desc > 0 ? ` · descuento jarros −${fmtCLP(desc)}` : ""}`;
    }
    if (entregoJarros === true) {
      return `[JARROS ENTREGADOS] ${jarrosComprometidos} (declarados: ${jarrosComprometidos})`;
    }
    if (jarrosEntregadosFinal === 0) {
      return "[JARROS ENTREGADOS] 0 — sin jarros, descuento eliminado";
    }
    const desc = calcularDescuentoJarrosEntrega(jarrosEntregadosFinal, items).total;
    return `[JARROS ENTREGADOS] ${jarrosEntregadosFinal} (declarados: ${jarrosComprometidos}${desc > 0 ? ` · descuento jarros −${fmtCLP(desc)}` : ""})`;
  };

  const cantidadJarrosEntrega = (): number => {
    if (sinJarrosDeclarados) return jarrosAlEntregarInput;
    return entregoJarros === true ? jarrosComprometidos : jarrosEntregadosFinal;
  };

  const sumarJarrosAlStock = async (sucursalId: string | undefined, cantidad: number) => {
    if (cantidad <= 0 || !sucursalId) return;
    try {
      const { data: insumoJarro } = await supabase
        .from("insumos")
        .select("id")
        .ilike("nombre", "Jarro de vidrio")
        .maybeSingle();
      const jarroId = (insumoJarro as { id?: string } | null)?.id;
      if (!jarroId) return;
      const { data: existente } = await supabase
        .from("stock_sucursal")
        .select("id,cantidad")
        .eq("sucursal_id", sucursalId)
        .eq("insumo_id", jarroId)
        .maybeSingle();
      const row = existente as { id?: string; cantidad?: number } | null;
      if (row?.id) {
        await supabase
          .from("stock_sucursal")
          .update({ cantidad: (row.cantidad ?? 0) + cantidad, updated_at: new Date().toISOString() })
          .eq("id", row.id);
      } else {
        await supabase
          .from("stock_sucursal")
          .insert({ sucursal_id: sucursalId, insumo_id: jarroId, cantidad });
      }
      await supabase.from("stock_movimientos").insert({
        insumo_id: jarroId,
        sucursal_id: sucursalId,
        cantidad,
        tipo: "recepcion",
        referencia_tipo: "pedido",
        referencia_id: pedido!.id,
        notas: `Devolución jarros — Pedido #${pedido!.numero_pedido}`,
      });
    } catch (err) {
      console.error("[pedidos] error sumando jarros al stock:", err);
    }
  };

  const notasEntrega = (): string | null => {
    const extraNotas: string[] = [];
    const notaJarros = notaJarrosEntrega();
    if (notaJarros) extraNotas.push(notaJarros);
    if (!esEntregaGratuita && pagoDiferencia > 0) extraNotas.push(`[PROPINA] ${fmtCLP(pagoDiferencia)}`);
    if (!esEntregaGratuita && pagoDiferencia < 0) extraNotas.push(`[FALTANTE ${fmtCLP(Math.abs(pagoDiferencia))}] ${pagoObs.trim()}`);
    return [pedido!.notas, ...extraNotas].filter(Boolean).join("\n") || null;
  };

  const confirmarJarrosSi = async () => {
    if (!pedido?.id) { toast.error("Pedido sin ID"); return; }
    // No recalcular: pedido.total ya trae el descuento desde el INSERT
    setPagoSaving(true);
    const { error } = await supabase
      .from("pedidos")
      .update({ jarros_entregados: jarrosComprometidos })
      .eq("id", pedido.id);
    setPagoSaving(false);
    if (error) { toast.error(error.message); return; }
    setEntregoJarros(true);
    setJarrosEntregadosFinal(jarrosComprometidos);
    setTotalEntrega(pedido.total);
    setPasoEntrega("pago");
  };

  const confirmarJarrosNo = () => {
    if (!pedido?.id) { toast.error("Pedido sin ID"); return; }
    setEntregoJarros(false);
    setJarrosRealesInput("0");
    setPasoEntrega("jarros_cantidad");
  };

  const onJarrosRealesChange = (raw: string) => {
    const n = Math.max(0, parseInt(raw || "0", 10) || 0);
    if (sinJarrosDeclarados) {
      setJarrosRealesInput(String(n));
      setJarrosEntregadosFinal(n);
      return;
    }
    setJarrosRealesInput(String(Math.min(n, jarrosComprometidos)));
  };

  /** Persiste jarros agregados al entregar (pedido sin jarros declarados). */
  const aplicarJarrosAlEntregar = async (): Promise<{ ok: boolean; total: number; jarros: number }> => {
    const jarros = jarrosAlEntregarInput;
    if (!sinJarrosDeclarados || jarros <= 0) {
      return { ok: true, total: totalACobrar, jarros: cantidadJarrosEntrega() };
    }
    const nuevoDescuento = descuentoBasePedido + descuentoAlEntregarCalc.total;
    const nuevoTotal = Math.max(0, subtotalPedido + costoDespachoPedido - nuevoDescuento);
    const { error } = await supabase
      .from("pedidos")
      .update({
        jarros_entregados: jarros,
        descuento: nuevoDescuento,
        total: nuevoTotal,
      })
      .eq("id", pedido!.id);
    if (error) {
      toast.error(error.message);
      return { ok: false, total: totalACobrar, jarros };
    }
    setJarrosEntregadosFinal(jarros);
    setTotalEntrega(nuevoTotal);
    return { ok: true, total: nuevoTotal, jarros };
  };

  const confirmarJarrosCantidad = async () => {
    if (!pedido?.id) { toast.error("Pedido sin ID"); return; }
    const jarrosReales = jarrosRealesParcial;
    const nuevoDescuento = jarrosReales === 0 ? 0 : descuentoParcialCalc.total;
    const nuevoTotal = Math.max(0, subtotalPedido + costoDespachoPedido - nuevoDescuento);

    setPagoSaving(true);
    const { error } = await supabase
      .from("pedidos")
      .update({
        descuento: nuevoDescuento,
        total: nuevoTotal,
        jarros_entregados: jarrosReales,
      })
      .eq("id", pedido.id);
    setPagoSaving(false);
    if (error) { toast.error(error.message); return; }

    setJarrosEntregadosFinal(jarrosReales);
    setTotalEntrega(nuevoTotal);
    setPasoEntrega("pago");
    toast.success(jarrosReales === 0 ? "Descuento eliminado — registrá el pago" : "Total actualizado — registrá el pago");
  };

  const confirmarEntregaGratuita = async () => {
    if (!pedido?.id) { toast.error("Pedido sin ID"); return; }
    setPagoSaving(true);

    const aplicado = await aplicarJarrosAlEntregar();
    if (!aplicado.ok) { setPagoSaving(false); return; }

    const { data: pedDb } = await supabase.from("pedidos").select("turno_id,sucursal_id").eq("id", pedido.id).maybeSingle();
    const sucursalId = (pedDb as { turno_id?: string; sucursal_id?: string } | null)?.sucursal_id;

    const { error, data } = await supabase
      .from("pedidos")
      .update({
        estado: "entregado",
        notas: notasEntrega(),
        metodo_pago: "cortesia",
        pago_registrado: true,
        jarros_entregados: aplicado.jarros,
      })
      .eq("id", pedido.id)
      .select("id");
    setPagoSaving(false);
    if (error) { console.error("[pedidos] update entrega gratuita error:", error); toast.error(error.message); return; }
    if (!data?.length) { toast.error("No se pudo actualizar el pedido"); return; }

    if (aplicado.jarros > 0) {
      await sumarJarrosAlStock(sucursalId, aplicado.jarros);
    }
    toast.success("Entrega gratuita confirmada");
    setPagoOpen(false);
    onChanged();
    onClose();
  };

  const confirmarPago = async () => {
    if (!pedido?.id) { toast.error("Pedido sin ID"); return; }
    if (pedido.pago_registrado) {
      toast.error("El pago ya está registrado");
      setPagoOpen(false);
      return;
    }
    if (esEntregaGratuita) {
      await confirmarEntregaGratuita();
      return;
    }
    if (pagoIngresado <= 0) { toast.error("Ingresá al menos un monto"); return; }
    if (pagoTr > 0 && !pagoTransferRef.trim()) { toast.error("Ingresá el N° de referencia de la transferencia"); return; }
    if (pagoDiferencia < 0 && !pagoObs.trim()) { toast.error("Indicá la observación por la diferencia"); return; }
    setPagoSaving(true);

    const aplicado = await aplicarJarrosAlEntregar();
    if (!aplicado.ok) { setPagoSaving(false); return; }

    // Obtener turno_id y sucursal_id desde la DB (no están en el objeto Pedido en memoria)
    const { data: pedDb } = await supabase.from("pedidos").select("turno_id,sucursal_id").eq("id", pedido.id).maybeSingle();
    const turnoId = (pedDb as { turno_id?: string; sucursal_id?: string } | null)?.turno_id;
    const sucursalId = (pedDb as { turno_id?: string; sucursal_id?: string } | null)?.sucursal_id;
    if (!turnoId) { setPagoSaving(false); toast.error("No se pudo obtener el turno del pedido"); return; }

    const metodoDetectado: "efectivo" | "transferencia" | "tarjeta" | "mixto" =
      pagoEf > 0 && pagoTr === 0 && pagoTa === 0 ? "efectivo"
      : pagoTr > 0 && pagoEf === 0 && pagoTa === 0 ? "transferencia"
      : pagoTa > 0 && pagoEf === 0 && pagoTr === 0 ? "tarjeta"
      : "mixto";

    const refTransferencia = pagoTr > 0
      ? (pagoTransferRef.trim() || referenciaPagoTransferencia(pedido.numero_pedido) || null)
      : null;

    const inserts: Array<{ turno_id: string; pedido_id: string; metodo: "efectivo" | "transferencia" | "tarjeta"; monto: number; referencia: string | null }> = [];
    if (pagoEf > 0) inserts.push({ turno_id: turnoId, pedido_id: pedido.id, metodo: "efectivo", monto: pagoEf, referencia: null });
    if (pagoTr > 0) inserts.push({
      turno_id: turnoId,
      pedido_id: pedido.id,
      metodo: "transferencia",
      monto: pagoTr,
      referencia: refTransferencia,
    });
    if (pagoTa > 0) inserts.push({ turno_id: turnoId, pedido_id: pedido.id, metodo: "tarjeta", monto: pagoTa, referencia: null });

    // Reemplazar pagos previos para alinear pagos_turno con el método detectado
    const { error: delPagErr } = await supabase.from("pagos_turno").delete().eq("pedido_id", pedido.id);
    if (delPagErr) { setPagoSaving(false); toast.error(delPagErr.message); return; }

    if (inserts.length > 0) {
      const { error: pagErr } = await supabase.from("pagos_turno").insert(inserts);
      if (pagErr) { setPagoSaving(false); toast.error(pagErr.message); return; }
    }

    const extraNotas: string[] = [];
    const notaJarros = notaJarrosEntrega();
    if (notaJarros) extraNotas.push(notaJarros);
    if (pagoDiferencia > 0) extraNotas.push(`[PROPINA] ${fmtCLP(pagoDiferencia)}`);
    if (pagoDiferencia < 0) extraNotas.push(`[FALTANTE ${fmtCLP(Math.abs(pagoDiferencia))}] ${pagoObs.trim()}`);
    const nuevasNotas = [pedido.notas, ...extraNotas].filter(Boolean).join("\n") || null;

    // Sincronizar pedidos.metodo_pago con lo registrado en pagos_turno
    const { error, data } = await supabase
      .from("pedidos")
      .update({
        estado: "entregado",
        notas: nuevasNotas,
        metodo_pago: metodoDetectado,
        referencia_pago: refTransferencia,
        pago_registrado: true,
        jarros_entregados: aplicado.jarros,
        ...(sinJarrosDeclarados && aplicado.jarros > 0
          ? { descuento: descuentoBasePedido + descuentoAlEntregarCalc.total, total: aplicado.total }
          : {}),
      })
      .eq("id", pedido.id)
      .select("id");
    setPagoSaving(false);
    if (error) { console.error("[pedidos] update entregado error:", error); toast.error(error.message); return; }
    if (!data || data.length === 0) { toast.error("No se pudo actualizar el pedido (revisá permisos / id)"); return; }

    if (aplicado.jarros > 0) {
      await sumarJarrosAlStock(sucursalId, aplicado.jarros);
    }

    toast.success("Pedido entregado");
    setPagoOpen(false);
    onChanged();
    onClose();
  };

  const guardarCambios = async () => {
    if (pedidoCerrado) {
      toast.error(estadoActual === "entregado"
        ? "Pedido entregado — no se puede modificar"
        : "Pedido cancelado — no se puede modificar");
      return;
    }
    if (items.length === 0) {
      toast.error("El pedido no puede quedar sin productos");
      return;
    }
    if (tipo === "despacho" && !dir.trim()) {
      toast.error("Ingresa la dirección de entrega");
      return;
    }
    if (tipo === "despacho" && !hasValidDeliveryCoordinates(latitud, longitud)) {
      toast.error("Selecciona la dirección desde las sugerencias de Google para ubicar el pedido en el mapa");
      return;
    }
    setSaving(true);
    // 1) Reconciliar items: eliminar quitados, insertar nuevos, actualizar cantidades.
    // Se omite por completo si la comanda está bloqueada (en_despacho/entregado/
    // cancelado): los controles de edición de items ya están ocultos en ese caso
    // (itemsLocked), así que `items` es idéntico a `originalItems`, pero este loop
    // reescribía cada item igualmente -- eso disparaba guard_pedido_items_lifecycle_v2
    // aunque el usuario solo hubiera cambiado, por ejemplo, las notas.
    const currentIds = items.filter((i) => i.id).map((i) => i.id!);
    const removidos = itemsLocked ? [] : originalItemIds.filter((id) => !currentIds.includes(id));
    const removedSnap = itemsLocked ? [] : originalItemsSnapshot.filter((o) => o.id && !currentIds.includes(o.id));
    const addedNow = itemsLocked ? [] : items.filter((i) => !i.id);
    const modifiedNow = itemsLocked ? [] : items.filter((item) => {
      if (!item.id) return false;
      const original = originalItemsSnapshot.find((candidate) => candidate.id === item.id);
      return original != null && (
        original.cantidad !== item.cantidad
        || original.precio_unitario !== item.precio_unitario
        || (original.notas ?? null) !== (item.notas ?? null)
      );
    });
    if (!itemsLocked) {
      if (removidos.length > 0) {
        const { error: delErr } = await supabase.from("pedido_items").delete().in("id", removidos);
        if (delErr) { setSaving(false); toast.error(delErr.message); return; }
      }
      for (const it of items) {
        if (it.id) {
          const { error: upErr } = await supabase.from("pedido_items").update({
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal: it.precio_unitario * it.cantidad,
            notas: it.notas ?? null,
          }).eq("id", it.id);
          if (upErr) { setSaving(false); toast.error(upErr.message); return; }
        } else {
          const { error: insErr } = await supabase.from("pedido_items").insert({
            pedido_id: pedido.id,
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal: it.precio_unitario * it.cantidad,
            notas: it.notas ?? null,
          });
          if (insErr) { setSaving(false); toast.error(insErr.message); return; }
        }
      }
    }
    const hayCambios = addedNow.length > 0 || removedSnap.length > 0 || modifiedNow.length > 0;
    const hhmm = new Date().toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
    const resumen = [
      ...addedNow.map((i) => `+${i.nombre}${i.cantidad > 1 ? ` x${i.cantidad}` : ""}`),
      ...removedSnap.map((i) => `-${i.nombre}${i.cantidad > 1 ? ` x${i.cantidad}` : ""}`),
      ...modifiedNow.map((i) => `~${i.nombre}`),
    ].join(", ");
    const editLine = hayCambios ? `[EDITADO ${hhmm}] ${resumen}` : null;
    const baseNotas = notas.trim();
    const notasFinal = [baseNotas || null, editLine].filter(Boolean).join("\n") || null;
    const ubicacionEntrega = buildDeliveryLocationFields({
      tipo,
      direccion: dir,
      referencia: ref,
      latitud,
      longitud,
      distanciaKm: distanciaEntrega,
    });
    const { error } = await supabase.from("pedidos").update({
      cliente_nombre: cNombre.trim(),
      cliente_telefono: cTel.trim() || null,
      tipo,
      ...ubicacionEntrega,
      despachador_id: tipo === "despacho" ? (despId === "__none__" ? null : despId) : null,
      costo_despacho: costoDespacho,
      costo_despacho_calculado: tipo === "despacho"
        ? (necesitaNuevaCotizacion ? costoDespachoCalculado : pedido.costo_despacho_calculado)
        : null,
      notas: notasFinal,
      subtotal,
      total: totalCalc,
    }).eq("id", pedido.id);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pedido actualizado");
    onChanged();

    // Disparar reimpresión con diff visual
    const itemsImpresion: ComandaItem[] = items.map((it) =>
      comandaItemFromPedidoItem(
        {
          cantidad: it.cantidad,
          nombre: it.nombre,
          precio_unitario: it.precio_unitario,
          descuento_item: it.descuento_item,
          notas: it.notas ?? null,
        },
        { marker: !it.id ? "nuevo" : undefined },
      ),
    );
    const removedImpresion: ComandaItem[] = removedSnap.map((it) =>
      comandaItemFromPedidoItem({
        cantidad: it.cantidad,
        nombre: it.nombre,
        precio_unitario: it.precio_unitario,
        descuento_item: it.descuento_item,
        notas: it.notas ?? null,
      }),
    );
    const pedidoActualizado: Pedido = {
      ...pedido,
      cliente_nombre: cNombre.trim(),
      cliente_telefono: cTel.trim() || null,
      tipo: tipo as TipoPedido,
      ...ubicacionEntrega,
      despachador_id: tipo === "despacho" ? (despId === "__none__" ? null : despId) : null,
      costo_despacho: costoDespacho,
      costo_despacho_calculado: tipo === "despacho"
        ? (necesitaNuevaCotizacion ? costoDespachoCalculado : pedido.costo_despacho_calculado)
        : null,
      notas: notasFinal,
      subtotal,
      total: totalCalc,
    };
    onReimprimirEditado(pedidoActualizado, itemsImpresion, removedImpresion);
  };
  const abrirEdicionItem = (idx: number) => {
    const item = items[idx];
    if (!item) return;
    setEditingItemIndex(idx);
    setEditingExtrasSel(new Set(item.sabor_extra_ids));
    setEditingItemNote(parseItemNotas(item.notas).notaUsuario ?? "");
  };
  const cerrarEdicionItem = () => {
    setEditingItemIndex(null);
    setEditingExtrasSel(new Set());
    setEditingItemNote("");
  };
  const guardarEdicionItem = () => {
    if (editingItemIndex == null) return;
    setItems((prev) => prev.map((item, idx) => {
      if (idx !== editingItemIndex) return item;
      const extras = sabores.filter((sabor) => editingExtrasSel.has(sabor.id));
      return {
        ...item,
        precio_unitario: item.precio_sin_sabores + precioTotalSabores(item, extras),
        sabor_extra_ids: extras.map((extra) => extra.id),
        notas: buildEditedItemNotes({
          originalNotes: item.notas,
          extras,
          userNote: editingItemNote,
        }),
      };
    }));
    cerrarEdicionItem();
  };

  const confirmarCancelar = async () => {
    if (!motivo.trim()) { toast.error("Indicá el motivo"); return; }
    const nuevasNotas = [pedido.notas, `[CANCELADO] ${motivo.trim()}`].filter(Boolean).join("\n");

    if (pedido.pago_registrado) {
      const { error: delPagErr } = await supabase
        .from("pagos_turno")
        .delete()
        .eq("pedido_id", pedido.id);
      if (delPagErr) { toast.error(delPagErr.message); return; }
    }

    const { error } = await supabase.from("pedidos").update({
      estado: "cancelado",
      notas: nuevasNotas,
      ...(pedido.pago_registrado ? { pago_registrado: false } : {}),
    }).eq("id", pedido.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`❌ Pedido #${pedido.numero_pedido} cancelado — Stock restaurado automáticamente`);
    onChanged();
    onClose();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto p-0 gap-0">
        <div className="sticky top-0 z-20 bg-card border-b border-border px-4 sm:px-6 py-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 flex-wrap">
            <span className="font-display text-3xl text-primary">#{pedido.numero_pedido}</span>
            <Badge className={`${meta.cls} border uppercase text-[10px] tracking-wider`} variant="outline">{meta.label}</Badge>
            <PromoPedidoBadge pedido={pedido} compact />
            <Badge variant="outline" className="uppercase text-[10px]">
              {tipo === "despacho" ? <><Truck className="h-3 w-3 mr-1" /> Despacho</> : <><Store className="h-3 w-3 mr-1" /> Retiro</>}
            </Badge>
            <span className="text-xs text-muted-foreground font-normal">{fmtHora(pedido.created_at)}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="ml-auto h-7 gap-1 text-xs"
              onClick={() => onReimprimir(pedido)}
              title="Reimprimir comanda"
            >
              <Printer className="h-3.5 w-3.5" /> Reimprimir
            </Button>
          </DialogTitle>
        </DialogHeader>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)] gap-4 p-4 sm:p-6">
          {/* Productos + totales */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label className="label-upper text-xs">Productos del pedido</Label>
                {!itemsLocked && (
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCatalogoOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Agregar producto
                  </Button>
                )}
              </div>
              <div className="bg-background border border-border rounded-md divide-y divide-border">
                {loading ? (
                  <div className="p-4 text-center text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Cargando…</div>
                ) : items.length === 0 ? (
                  <div className="p-4 text-center text-destructive text-sm">El pedido no puede quedar sin productos</div>
                ) : items.map((it, idx) => (
                  <div key={it.id ?? `new-${idx}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <div className="flex-1 min-w-0">
                      <div className="text-foreground truncate">{it.nombre}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{fmtCLP(it.precio_unitario)} c/u</div>
                      {it.notas && <div className="text-[10px] text-muted-foreground italic truncate">{it.notas.replace(/Pulpa de /gi, "")}</div>}
                    </div>
                    {!itemsLocked ? (
                      <>
                        <div className="flex items-center gap-1">
                          <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => cambiarCant(idx, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="font-mono text-xs w-6 text-center">{it.cantidad}</span>
                          <Button type="button" size="icon" variant="outline" className="h-6 w-6" onClick={() => cambiarCant(idx, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                        <div className="font-mono text-foreground w-20 text-right text-xs">{fmtCLP(it.precio_unitario * it.cantidad)}</div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => abrirEdicionItem(idx)}
                          aria-label={`Editar sabores e información de ${it.nombre}`}
                          title="Editar sabores e información"
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive" onClick={() => eliminarItem(idx)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="font-mono text-xs w-6 text-center text-muted-foreground">×{it.cantidad}</span>
                        <div className="font-mono text-foreground w-20 text-right text-xs">{fmtCLP(it.precio_unitario * it.cantidad)}</div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-background border border-border rounded-md p-3 space-y-1 text-sm">
              <DesglosePrecioPedido
                pedido={pedido}
                subtotalOverride={subtotal}
                costoDespachoOverride={costoDespacho}
                totalOverride={totalCalc}
              />
              {estadoActual !== "entregado" && (
                <>
                  <div className="flex justify-between text-xs pt-1 border-t border-border">
                    <span className="text-muted-foreground">Pago</span>
                    <span className="uppercase">{pedido.metodo_pago ?? "pendiente"}</span>
                  </div>
                  {pedido.pago_registrado ? (
                    <div className="pt-1">
                      <Badge
                        className="text-[10px] px-2 py-0.5 font-bold border bg-success/15 text-success border-success/40"
                        variant="outline"
                      >
                        ✅ Pagado
                      </Badge>
                    </div>
                  ) : (
                    <div className="text-xs text-warning font-medium pt-1">⏳ Pago pendiente</div>
                  )}
                </>
              )}
            </div>

            {estadoActual === "entregado" && (
              <div className="bg-background border border-border rounded-md p-3 space-y-2 text-sm">
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  💳 Información de pago
                </div>

                {esPedidoExterno(pedido.tipo) ? (
                  <p className="text-sm font-semibold text-foreground">
                    {pedido.tipo === "uber"
                      ? "💳 Pago gestionado por Uber Eats"
                      : "💳 Pago gestionado por Rappi"}
                  </p>
                ) : (pedido.metodo_pago === "mixto" || pagosDetalle.length > 1) && pagosDetalle.length > 0 ? (
                  <div className="space-y-1">
                    {pagosDetalle.map((p) => (
                      <div key={`${p.metodo}-${p.monto}-${p.referencia ?? ""}`} className="flex justify-between text-xs">
                        <span className="text-muted-foreground">{labelMetodoPago(p.metodo)}</span>
                        <span className="font-mono">{fmtCLP(Number(p.monto))}</span>
                      </div>
                    ))}
                    {pagosDetalle.some((p) => p.metodo === "transferencia" && p.referencia) && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Referencia</span>
                        <span className="font-mono">
                          {pagosDetalle.find((p) => p.metodo === "transferencia" && p.referencia)?.referencia}
                        </span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs pt-1 border-t border-border font-semibold">
                      <span>Total</span>
                      <span className="font-mono">
                        {fmtCLP(pagosDetalle.reduce((a, p) => a + Number(p.monto), 0))}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Método</span>
                      <span className="font-medium">{labelMetodoPago(pedido.metodo_pago)}</span>
                    </div>
                    {(pedido.referencia_pago || pagosDetalle.find((p) => p.referencia)?.referencia) && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Referencia</span>
                        <span className="font-mono">
                          {pedido.referencia_pago
                            ?? pagosDetalle.find((p) => p.referencia)?.referencia}
                        </span>
                      </div>
                    )}
                  </div>
                )}

                <div className={`text-xs font-medium pt-1 border-t border-border ${pedido.pago_registrado ? "text-success" : "text-warning"}`}>
                  {pedido.pago_registrado ? "✅ Pago registrado" : "⏳ Pago pendiente"}
                </div>
              </div>
            )}
          </div>

          {/* Edición */}
          <div className={`space-y-3 ${pedidoCerrado ? "opacity-60 pointer-events-none" : ""}`}>
            <div className="space-y-1">
              <Label className="label-upper text-xs">Tipo</Label>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={tipo === "despacho" ? "default" : "outline"}
                  className={`h-12 ${tipo === "despacho" ? "bg-primary text-primary-foreground" : ""}`}
                  onClick={() => setTipo("despacho")}
                  disabled={pedidoCerrado}
                >
                  <Truck className="h-4 w-4 mr-2" /> Despacho
                </Button>
                <Button
                  type="button"
                  variant={tipo === "retiro" ? "default" : "outline"}
                  className={`h-12 ${tipo === "retiro" ? "bg-primary text-primary-foreground" : ""}`}
                  onClick={() => setTipo("retiro")}
                  disabled={pedidoCerrado}
                >
                  <Store className="h-4 w-4 mr-2" /> Retiro
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="label-upper text-xs">Cliente</Label>
              <Label htmlFor="pedido-cliente-nombre" className="text-xs">Nombre</Label>
              <Input id="pedido-cliente-nombre" value={cNombre} onChange={(e) => setCNombre(e.target.value)} className="bg-background" disabled={pedidoCerrado} />
              <Label htmlFor="pedido-cliente-telefono" className="text-xs">Teléfono</Label>
              <Input id="pedido-cliente-telefono" value={cTel} onChange={(e) => setCTel(e.target.value)} placeholder="Ej. +56 9 1234 5678" className="bg-background" disabled={pedidoCerrado} />
            </div>
            {tipo === "despacho" && (
              <div className="space-y-2">
                <Label className="label-upper text-xs">Dirección</Label>
                <Label htmlFor="pedido-direccion" className="text-xs">Dirección de entrega</Label>
                <AddressAutocomplete
                  id="pedido-direccion"
                  value={dir}
                  onChange={(value) => {
                    setDir(value);
                    setLatitud(null);
                    setLongitud(null);
                    setDistanciaApi(null);
                    setUbicacionModificada(true);
                  }}
                  onSelect={({ address, lat, lng }) => {
                    setDir(address);
                    setLatitud(lat);
                    setLongitud(lng);
                    setUbicacionModificada(true);
                  }}
                  placeholder="Busca y selecciona una dirección"
                  hasError={!dir.trim() || !hasValidDeliveryCoordinates(latitud, longitud)}
                  className="bg-background"
                  disabled={pedidoCerrado}
                />
                {distanciaEntrega != null && distanciaEntrega > 0 && (
                  <p className="text-xs font-mono text-muted-foreground">
                    Distancia: {distanciaEntrega.toFixed(1)} km · Costo: {fmtCLP(costoDespacho)}
                  </p>
                )}
                <Label htmlFor="pedido-referencia" className="text-xs">Referencia</Label>
                <Input id="pedido-referencia" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Ej. portón azul" className="bg-background" disabled={pedidoCerrado} />
              </div>
            )}
            {tipo === "despacho" && !pedidoCerrado && esTipoDespacho(pedido.tipo) && !ubicacionModificada && (
              <AjusteCostoDespacho
                pedido={pedido}
                onSaved={() => {
                  onChanged();
                  onClose();
                }}
              />
            )}
            {tipo === "despacho" && (
              <div className="space-y-2">
                <Label className="label-upper text-xs">Despachador</Label>
                <Select value={despId} onValueChange={setDespId} disabled={pedidoCerrado}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin asignar</SelectItem>
                    {despachadores.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nombre_completo || d.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label className="label-upper text-xs">Notas</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="bg-background" rows={3} disabled={pedidoCerrado} />
            </div>
          </div>
        </div>

        <CorreccionPedidoEntregado
          pedido={pedido}
          pagosActuales={pagosDetalle}
          onSuccess={() => {
            onChanged();
            onClose();
          }}
        />

        {pedidoCerrado && esTipoDespacho(pedido.tipo) && (
          <div className="border border-border rounded-lg p-4 space-y-3 bg-card">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground">Despachador</p>
                <p className="text-sm font-medium text-foreground">
                  {despId !== "__none__"
                    ? (despachadores.find((d) => d.id === despId)?.nombre_completo
                      || despachadores.find((d) => d.id === despId)?.nombre
                      || "Asignado")
                    : "Sin asignar"}
                </p>
              </div>
              {!cambiandoDespachador && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setCambiandoDespachador(true)}
                  disabled={guardandoDespachador}
                  className="uppercase tracking-wider text-xs"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1.5" />
                  Cambiar despachador
                </Button>
              )}
            </div>
            {cambiandoDespachador && (
              <div className="space-y-2">
                <Select
                  value={despId}
                  onValueChange={(v) => { void guardarDespachadorCerrado(v); }}
                  disabled={guardandoDespachador}
                >
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Elegí despachador" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sin asignar</SelectItem>
                    {despachadores.map((d) => (
                      <SelectItem key={d.id} value={d.id}>{d.nombre_completo || d.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={guardandoDespachador}
                    onClick={() => {
                      setDespId(pedido.despachador_id ?? "__none__");
                      setCambiandoDespachador(false);
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Cambios de estado */}
        <div className="sticky bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur px-4 sm:px-6 py-3 flex flex-wrap gap-2 items-center">
          {pedidoCerrado ? (
            <div className={`text-sm font-medium px-3 py-2 rounded-md border w-full text-center ${
              estadoActual === "entregado"
                ? "bg-success/10 border-success/30 text-success"
                : "bg-muted border-border text-muted-foreground"
            }`}>
              {estadoActual === "entregado"
                ? "✅ Pedido entregado — no se puede modificar"
                : "❌ Pedido cancelado — no se puede modificar"}
            </div>
          ) : (
            <>
              <Button onClick={guardarCambios} disabled={saving || items.length === 0}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Guardar cambios
              </Button>
              {meta.siguiente && meta.siguiente !== "entregado" && (
                <Button onClick={() => cambiarEstado(meta.siguiente!)} className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider text-xs">
                  → {labelAccionEstado(pedido.tipo, meta.siguiente)}
                </Button>
              )}
              {meta.siguiente === "entregado" && (
                pedido.pago_registrado ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      className="text-[10px] px-2 py-1 font-bold border bg-success/15 text-success border-success/40"
                      variant="outline"
                    >
                      ✅ Pagado
                    </Badge>
                    <Button
                      onClick={() => cambiarEstado("entregado")}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider text-xs"
                    >
                      → Marcar entregado
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => cambiarEstado("entregado")} className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider text-xs">
                    → {labelAccionEstado(pedido.tipo, "entregado")}
                  </Button>
                )
              )}
              {ESTADOS_MANUAL
                .filter((e) => e !== estadoActual && e !== meta.siguiente)
                .filter((e) => (pedido.tipo === "despacho" || pedido.tipo === "delivery") || e !== "en_despacho")
                .map((e) => {
                  if (e === "entregado" && pedido.pago_registrado) {
                    return (
                      <div key={e} className="flex items-center gap-2">
                        <Badge
                          className="text-[10px] px-2 py-1 font-bold border bg-success/15 text-success border-success/40"
                          variant="outline"
                        >
                          ✅ Pagado
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs uppercase tracking-wider"
                          onClick={() => cambiarEstado("entregado")}
                        >
                          Marcar entregado
                        </Button>
                      </div>
                    );
                  }
                  return (
                    <Button
                      key={e}
                      variant="outline"
                      size="sm"
                      className="text-xs uppercase tracking-wider"
                      onClick={() => cambiarEstado(e)}
                    >
                      {labelAccionEstado(pedido.tipo, e)}
                    </Button>
                  );
                })}
              <Button
                variant="outline"
                className="ml-auto border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive uppercase tracking-wider text-xs"
                onClick={() => setCancelarOpen((v) => !v)}
              >
                <X className="h-3 w-3 mr-1" /> Cancelar pedido
              </Button>
            </>
          )}
        </div>

        {!pedidoCerrado && cancelarOpen && (
          <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 space-y-2">
            <Label className="label-upper text-xs text-destructive">¿Por qué se cancela?</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Indicá el motivo de la cancelación…"
              className="bg-background"
              rows={2}
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => { setCancelarOpen(false); setMotivo(""); }}>Volver</Button>
              <Button variant="destructive" size="sm" onClick={confirmarCancelar}>Confirmar cancelación</Button>
            </div>
          </div>
        )}

        {/* Catálogo para agregar productos */}
        <Dialog open={catalogoOpen} onOpenChange={setCatalogoOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
            <DialogHeader>
              <DialogTitle>Agregar producto</DialogTitle>
            </DialogHeader>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={catBusqueda} onChange={(e) => setCatBusqueda(e.target.value)} placeholder="Buscar producto…" className="bg-background pl-9" />
              </div>
              <Select value={catSel} onValueChange={setCatSel}>
                <SelectTrigger className="bg-background w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas las categorías</SelectItem>
                  {categorias.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {productosFiltrados.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { agregarProducto(p); }}
                  className="text-left bg-background border border-border rounded-md p-2 hover:border-primary transition"
                >
                  <div className="text-xs font-medium text-foreground truncate">{p.nombre}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{fmtCLP(p.precio)}</div>
                </button>
              ))}
              {productosFiltrados.length === 0 && (
                <div className="col-span-full text-center text-sm text-muted-foreground py-6">Sin resultados</div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Edición de sabores e información de un producto existente */}
        <Dialog open={editingItem != null} onOpenChange={(isOpen) => { if (!isOpen) cerrarEdicionItem(); }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4" /> Editar {editingItem?.nombre}
              </DialogTitle>
            </DialogHeader>
            {editingItem && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Sabores extra</Label>
                  {sabores.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No hay sabores disponibles.</p>
                  ) : (
                    <div className="grid grid-cols-1 gap-1 max-h-64 overflow-auto">
                      {sabores.map((sabor) => (
                        <label
                          key={sabor.id}
                          className="flex items-center gap-2 p-2 rounded-md bg-background border border-border cursor-pointer hover:border-primary"
                        >
                          <Checkbox
                            checked={editingExtrasSel.has(sabor.id)}
                            onCheckedChange={() => setEditingExtrasSel((current) => {
                              const next = new Set(current);
                              if (next.has(sabor.id)) next.delete(sabor.id);
                              else next.add(sabor.id);
                              return next;
                            })}
                          />
                          <span className="flex-1 text-sm">{formatSaborExtra(sabor.nombre)}</span>
                          <span className="text-xs font-mono text-muted-foreground">
                            {precioSaborParaProducto(editingItem, sabor) === 0
                              ? "Sin recargo"
                              : `+${fmtCLP(precioSaborParaProducto(editingItem, sabor))}`}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pedido-item-nota" className="text-xs text-muted-foreground">Información del trago</Label>
                  <Input
                    id="pedido-item-nota"
                    value={editingItemNote}
                    onChange={(event) => setEditingItemNote(event.target.value)}
                    placeholder="Ej: sin hielo, extra menta…"
                    maxLength={200}
                    className="bg-background"
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-border bg-background p-3 text-sm">
                  <span className="text-muted-foreground">Nuevo precio unitario</span>
                  <span className="font-mono font-semibold">{fmtCLP(editingItemPrice)}</span>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={cerrarEdicionItem}>Cancelar</Button>
                  <Button type="button" onClick={guardarEdicionItem}>Guardar cambios</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Modal extras */}
        <Dialog open={!!extrasFor} onOpenChange={(o) => { if (!o) { setExtrasFor(null); setExtrasSel(new Set()); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{extrasFor?.nombre}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                ¿Agregar sabor extra?{" "}
                <span className="font-mono">
                  ({extrasFor && !cobraRecargoPorSabor(extrasFor)
                    ? "sin recargo"
                    : `+${fmtCLP(1000)} c/u`})
                </span>
              </p>
              <div className="grid grid-cols-1 gap-1 max-h-72 overflow-auto">
                {sabores.map((s) => (
                  <label key={s.id} className="flex items-center gap-2 p-2 rounded-md bg-background border border-border cursor-pointer hover:border-primary">
                    <Checkbox
                      checked={extrasSel.has(s.id)}
                      onCheckedChange={() => setExtrasSel((st) => {
                        const n = new Set(st);
                        if (n.has(s.id)) n.delete(s.id);
                        else n.add(s.id);
                        return n;
                      })}
                    />
                    <span className="flex-1 text-sm">{formatSaborExtra(s.nombre)}</span>
                    <span className="text-xs font-mono text-muted-foreground">
                      {extrasFor && !cobraRecargoPorSabor(extrasFor)
                        ? "Sin recargo"
                        : `+${fmtCLP(extrasFor ? precioSaborParaProducto(extrasFor, s) : s.precio)}`}
                    </span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => confirmarExtras(false)}>Agregar sin extra</Button>
                <Button onClick={() => confirmarExtras(true)} disabled={extrasSel.size === 0}>Agregar con extras</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Modal de confirmación de pago */}
        <Dialog
          open={pagoOpen && !pedido.pago_registrado}
          onOpenChange={(o) => {
            if (!pagoSaving) {
              setPagoOpen(o);
              if (!o) { setPasoEntrega("jarros"); setEntregoJarros(null); setJarrosRealesInput("0"); }
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {pasoEntrega === "jarros"
                  ? "Confirmar jarros"
                  : pasoEntrega === "jarros_cantidad"
                    ? "Jarros entregados"
                    : esEntregaGratuita
                      ? "Entrega gratuita"
                      : "Registrar pago"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {pasoEntrega === "pago" && (
              <div className="text-center bg-background border border-border rounded-md p-4">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total a cobrar</div>
                <div className="font-display text-4xl text-primary font-bold">
                  {fmtCLP(totalACobrar)}
                </div>
                {esEntregaGratuita && (
                  <div className="text-sm text-primary font-semibold mt-2">🎁 Cubierto por descuento de jarros</div>
                )}
              </div>
              )}

              {pasoEntrega === "pago" && sinJarrosDeclarados && (
              <div className="space-y-3 border border-primary/30 bg-primary/5 rounded-lg p-4">
                <div className="text-center space-y-1">
                  <div className="text-sm font-bold uppercase tracking-wider text-primary">
                    🫙 ¿El cliente entrega jarros retornables?
                  </div>
                  <p className="text-xs text-muted-foreground">
                    4 jarros = 1 trago gratis · Sobrantes = $1.000 c/u
                  </p>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cantidad de jarros</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={jarrosRealesInput}
                      onChange={(e) => onJarrosRealesChange(e.target.value)}
                      className="bg-background font-mono text-xl h-12 w-24 text-center"
                      disabled={pagoSaving}
                    />
                    <span className="text-sm text-muted-foreground">jarros</span>
                  </div>
                  <p className="text-xs text-muted-foreground">(Dejar en 0 si no entrega)</p>
                </div>
                {jarrosAlEntregarInput > 0 && (
                  <div className="rounded-md bg-background border border-border p-3 text-sm text-center space-y-1">
                    {descuentoAlEntregarCalc.tragosGratis > 0 && (
                      <p>
                        {jarrosAlEntregarInput} jarros → {descuentoAlEntregarCalc.tragosGratis} trago
                        {descuentoAlEntregarCalc.tragosGratis !== 1 ? "s" : ""} gratis
                        (−{fmtCLP(descuentoAlEntregarCalc.descuentoTragos)})
                      </p>
                    )}
                    {descuentoAlEntregarCalc.sobrantes > 0 && (
                      <p>
                        {descuentoAlEntregarCalc.sobrantes} sobrante
                        {descuentoAlEntregarCalc.sobrantes !== 1 ? "s" : ""}
                        (−{fmtCLP(descuentoAlEntregarCalc.descuentoSobrantes)})
                      </p>
                    )}
                    {descuentoAlEntregarPreview > 0 && (
                      <p className="text-muted-foreground">
                        Descuento: −{fmtCLP(descuentoAlEntregarPreview)}
                      </p>
                    )}
                    <p className="font-semibold text-primary pt-1">
                      Total: {fmtCLP(totalAlEntregarPreview)}
                    </p>
                  </div>
                )}
              </div>
              )}

              {pasoEntrega === "jarros" && (
              <div className="space-y-5 border border-primary/30 bg-primary/5 rounded-lg p-5">
                <div className="text-center space-y-3">
                  <div className="text-sm font-bold uppercase tracking-wider text-primary">🫙 Jarros retornables</div>
                  <p className="text-sm text-muted-foreground">
                    El cliente declaró entregar{" "}
                    <span className="font-mono font-semibold text-foreground">{jarrosComprometidos}</span>{" "}
                    jarro{jarrosComprometidos !== 1 ? "s" : ""}
                  </p>
                  {descuentoJarrosAplicado > 0 && (
                    <p className="text-sm">
                      Descuento aplicado:{" "}
                      <span className="font-mono font-semibold text-success">−{fmtCLP(descuentoJarrosAplicado)}</span>
                    </p>
                  )}
                  <p className="text-base font-medium pt-1">¿El cliente entregó los jarros?</p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Button
                    onClick={confirmarJarrosSi}
                    disabled={pagoSaving}
                    className="h-14 bg-success hover:bg-success/90 text-success-foreground text-sm sm:text-base font-bold"
                  >
                    {pagoSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    ✅ Sí, entregó los jarros
                  </Button>
                  <Button
                    onClick={confirmarJarrosNo}
                    disabled={pagoSaving}
                    variant="destructive"
                    className="h-14 text-sm sm:text-base font-bold"
                  >
                    {pagoSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    ❌ No entregó los jarros
                  </Button>
                </div>
              </div>
              )}

              {pasoEntrega === "jarros_cantidad" && (
              <div className="space-y-4 border border-destructive/30 bg-destructive/5 rounded-lg p-5">
                <div className="text-center space-y-2">
                  <p className="text-base font-medium">¿Cuántos jarros entregó realmente?</p>
                  <p className="text-xs text-muted-foreground">
                    Mínimo 0 · máximo {jarrosComprometidos} declarado{jarrosComprometidos !== 1 ? "s" : ""}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    max={jarrosComprometidos}
                    inputMode="numeric"
                    value={jarrosRealesInput}
                    onChange={(e) => onJarrosRealesChange(e.target.value)}
                    className="bg-background font-mono text-2xl h-14 w-24 text-center"
                  />
                  <span className="text-sm text-muted-foreground">jarros</span>
                </div>
                <div className="rounded-md bg-background border border-border p-3 text-sm text-center space-y-1">
                  {jarrosRealesParcial === 0 ? (
                    <p className="text-muted-foreground">Sin descuento por jarros</p>
                  ) : (
                    <>
                      {descuentoParcialCalc.tragosGratis > 0 && (
                        <p>
                          🎁 {descuentoParcialCalc.tragosGratis} trago{descuentoParcialCalc.tragosGratis !== 1 ? "s" : ""} gratis
                          (−{fmtCLP(descuentoParcialCalc.descuentoTragos)})
                        </p>
                      )}
                      {descuentoParcialCalc.sobrantes > 0 && (
                        <p>
                          {descuentoParcialCalc.sobrantes} sobrante{descuentoParcialCalc.sobrantes !== 1 ? "s" : ""}
                          (−{fmtCLP(descuentoParcialCalc.descuentoSobrantes)})
                        </p>
                      )}
                    </>
                  )}
                  <p className="font-semibold text-primary pt-1">
                    Total: {fmtCLP(totalParcialPreview)}
                  </p>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" onClick={() => setPasoEntrega("jarros")} disabled={pagoSaving}>
                    Volver
                  </Button>
                  <Button
                    onClick={confirmarJarrosCantidad}
                    disabled={pagoSaving}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold px-6"
                  >
                    {pagoSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar
                  </Button>
                </div>
              </div>
              )}

              {pasoEntrega === "pago" && jarrosComprometidos > 0 && entregoJarros !== null && (
                <div className="text-xs text-muted-foreground border border-border rounded-md p-3 bg-background">
                  {entregoJarros
                    ? <>🫙 {jarrosComprometidos} jarro{jarrosComprometidos !== 1 ? "s" : ""} confirmado{jarrosComprometidos !== 1 ? "s" : ""}</>
                    : jarrosEntregadosFinal > 0
                      ? <>🫙 {jarrosEntregadosFinal} jarro{jarrosEntregadosFinal !== 1 ? "s" : ""} entregado{jarrosEntregadosFinal !== 1 ? "s" : ""} (declarados: {jarrosComprometidos})</>
                      : <>🫙 Sin jarros — descuento eliminado</>}
                </div>
              )}

              {pasoEntrega === "pago" && !esEntregaGratuita && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Banknote className="h-3 w-3" /> Efectivo</Label>
                  <Input type="number" min="0" inputMode="numeric" value={pagoEfectivo} onChange={(e) => setPagoEfectivo(e.target.value)} placeholder="0" className="bg-background font-mono" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><Landmark className="h-3 w-3" /> Transferencia</Label>
                  <Input
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={pagoTransfer}
                    onChange={(e) => {
                      const v = e.target.value;
                      setPagoTransfer(v);
                      const n = parseInt(v || "0", 10) || 0;
                      if (n > 0 && !pagoTransferRefTouched.current) {
                        const auto = referenciaPagoTransferencia(pedido.numero_pedido);
                        if (auto) setPagoTransferRef(auto);
                      }
                    }}
                    placeholder="0"
                    className="bg-background font-mono"
                  />
                  {pagoTr > 0 && (
                    <Input
                      value={pagoTransferRef}
                      onChange={(e) => {
                        pagoTransferRefTouched.current = true;
                        setPagoTransferRef(e.target.value);
                      }}
                      placeholder="N° referencia"
                      className="bg-background"
                      maxLength={50}
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Tarjeta</Label>
                  <Input type="number" min="0" inputMode="numeric" value={pagoTarjeta} onChange={(e) => setPagoTarjeta(e.target.value)} placeholder="0" className="bg-background font-mono" />
                </div>
              </div>
              )}

              {pasoEntrega === "pago" && !esEntregaGratuita && (
              <div className="bg-background border border-border rounded-md p-3 space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Total ingresado</span><span className="font-mono">{fmtCLP(pagoIngresado)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total a cobrar</span><span className="font-mono">{fmtCLP(totalACobrar)}</span></div>
                <div className="border-t border-border pt-1 flex justify-between font-medium">
                  <span>Diferencia</span>
                  <span className={`font-mono ${pagoDiferencia > 0 ? "text-success" : pagoDiferencia < 0 ? "text-destructive" : ""}`}>
                    {pagoDiferencia > 0 ? "+" : ""}{fmtCLP(pagoDiferencia)}
                  </span>
                </div>
              </div>
              )}

              {pasoEntrega === "pago" && !esEntregaGratuita && pagoDiferencia > 0 && (
                <div className="text-sm text-success text-center">🎉 Propina: {fmtCLP(pagoDiferencia)}</div>
              )}
              {pasoEntrega === "pago" && !esEntregaGratuita && pagoDiferencia < 0 && (
                <div className="space-y-1">
                  <Label className="text-xs text-destructive">Observación: ¿qué pasó?</Label>
                  <Textarea value={pagoObs} onChange={(e) => setPagoObs(e.target.value)} placeholder="Indicá por qué falta dinero…" rows={2} className="bg-background" maxLength={300} />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                {pasoEntrega !== "jarros_cantidad" && (
                <Button variant="ghost" onClick={() => { setPagoOpen(false); setPasoEntrega("jarros"); setEntregoJarros(null); setJarrosRealesInput("0"); }} disabled={pagoSaving}>Cancelar</Button>
                )}
                {pasoEntrega === "pago" && (esEntregaGratuita ? (
                  <Button
                    onClick={confirmarEntregaGratuita}
                    disabled={pagoSaving}
                    className="bg-primary hover:bg-primary/90 text-primary-foreground"
                  >
                    {pagoSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    Confirmar entrega gratuita
                  </Button>
                ) : (
                <Button
                  onClick={confirmarPago}
                  disabled={pagoSaving || pagoIngresado <= 0}
                  className={pagoDiferencia < 0
                    ? "bg-orange-500 hover:bg-orange-600 text-white"
                    : "bg-success hover:bg-success/90 text-success-foreground"}
                >
                  {pagoSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  {pagoDiferencia < 0 ? "Registrar con diferencia" : "Marcar como entregado"}
                </Button>
                ))}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>

    <AlertDialog open={alertaSinDespachador} onOpenChange={setAlertaSinDespachador}>
      <AlertDialogContent className="bg-card border-border">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-xl">⚠️ Sin despachador</AlertDialogTitle>
          <AlertDialogDescription className="text-sm text-muted-foreground space-y-2">
            <span className="block">Este pedido no tiene despachador asignado.</span>
            <span className="block">¿Deseas continuar sin asignar uno?</span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Volver a asignar</AlertDialogCancel>
          <AlertDialogAction
            className="bg-warning text-warning-foreground hover:bg-warning/90"
            onClick={() => {
              setAlertaSinDespachador(false);
              void iniciarFlujoEntrega();
            }}
          >
            Continuar sin despachador
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
