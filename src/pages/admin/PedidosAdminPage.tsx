import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Banknote, CreditCard, Landmark, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TIPO_META, type TipoPedido } from "@/lib/tiposPedido";
import { parseItemNotas, esItemPromoJarros } from "@/lib/pedidoImpresion";
import { formatSaborExtra } from "@/lib/printComanda";
import { referenciaPagoTransferencia } from "@/lib/referenciaPago";
import { Navigate } from "react-router-dom";

type Estado = "en_preparacion" | "listo" | "en_despacho" | "entregado" | "cancelado";
type MetodoPago = "efectivo" | "transferencia" | "tarjeta" | "mixto" | "cortesia";

type Sucursal = { id: string; nombre: string };
type Despachador = { id: string; nombre: string; nombre_completo: string | null; sucursal_id: string | null };
type ProductoCat = { id: string; nombre: string; precio: number };
type PagoTurnoDetalle = { metodo: string; monto: number; referencia: string | null };

type PedidoRow = {
  id: string;
  numero_pedido: number | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo: string;
  estado: string;
  total: number;
  subtotal: number;
  descuento: number | null;
  costo_despacho: number | null;
  metodo_pago: string | null;
  monto_recibido: number | null;
  referencia_pago: string | null;
  pago_registrado: boolean | null;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  despachador_id: string | null;
  turno_id: string;
  sucursal_id: string;
  notas: string | null;
  created_at: string | null;
  fecha_dlitro: string | null;
  sucursal_nombre: string;
};

type EditItem = {
  id?: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  descuento_item: number | null;
  notas: string | null;
};

const ESTADOS: { value: Estado; label: string }[] = [
  { value: "en_preparacion", label: "En preparación" },
  { value: "listo", label: "Listo" },
  { value: "en_despacho", label: "En despacho" },
  { value: "entregado", label: "Entregado" },
  { value: "cancelado", label: "Cancelado" },
];

const TIPOS_EDIT: { value: TipoPedido; label: string }[] = [
  { value: "despacho", label: "Despacho" },
  { value: "retiro", label: "Retiro" },
  { value: "uber", label: "Uber" },
  { value: "rappi", label: "Rappi" },
  { value: "puerta", label: "Puerta" },
];

const ESTADO_CLS: Record<string, string> = {
  en_preparacion: "bg-warning/15 text-warning border-warning/30",
  listo: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  en_despacho: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  entregado: "bg-success/15 text-success border-success/30",
  cancelado: "bg-muted text-muted-foreground border-border",
};

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const labelMetodoPago = (m: string | null | undefined) => {
  const map: Record<string, string> = {
    efectivo: "Efectivo",
    transferencia: "Transferencia",
    tarjeta: "Tarjeta",
    mixto: "Mixto",
    cortesia: "Cortesía",
  };
  return m ? (map[m] ?? m) : "—";
};

const hoyChile = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(new Date());

const str = (v: unknown) => (v == null ? "" : String(v));

export default function PedidosAdminPage() {
  const { perfil } = useAuthStore();
  const [fecha, setFecha] = useState(hoyChile);
  const [sucursalId, setSucursalId] = useState<string>("__all__");
  const [estadoFiltro, setEstadoFiltro] = useState<string>("__all__");
  const [tipoFiltro, setTipoFiltro] = useState<string>("__all__");
  const [busqueda, setBusqueda] = useState("");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [pedidos, setPedidos] = useState<PedidoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState<PedidoRow | null>(null);

  const cargar = useCallback(async () => {
    setLoading(true);
    let turnosQ = supabase
      .from("turnos")
      .select("id, fecha_dlitro, sucursal_id")
      .eq("fecha_dlitro", fecha);
    if (sucursalId !== "__all__") turnosQ = turnosQ.eq("sucursal_id", sucursalId);

    const { data: turnosData, error: turnosErr } = await turnosQ;
    if (turnosErr) {
      toast.error(turnosErr.message);
      setPedidos([]);
      setLoading(false);
      return;
    }

    const turnos = (turnosData ?? []) as { id: string; fecha_dlitro: string; sucursal_id: string }[];
    if (turnos.length === 0) {
      setPedidos([]);
      setLoading(false);
      return;
    }

    const turnoIds = turnos.map((t) => t.id);
    const turnoMap = new Map(turnos.map((t) => [t.id, t]));
    const sucMap = new Map(sucursales.map((s) => [s.id, s.nombre]));

    let pedQ = supabase
      .from("pedidos")
      .select(
        "id, numero_pedido, cliente_nombre, cliente_telefono, tipo, estado, total, subtotal, descuento, costo_despacho, metodo_pago, monto_recibido, referencia_pago, pago_registrado, direccion_entrega, referencia_entrega, despachador_id, turno_id, sucursal_id, notas, created_at",
      )
      .in("turno_id", turnoIds)
      .order("numero_pedido", { ascending: false });

    if (estadoFiltro !== "__all__") pedQ = pedQ.eq("estado", estadoFiltro as Estado);
    if (tipoFiltro !== "__all__") pedQ = pedQ.eq("tipo", tipoFiltro as TipoPedido);

    const { data: pedData, error: pedErr } = await pedQ;
    if (pedErr) {
      toast.error(pedErr.message);
      setPedidos([]);
      setLoading(false);
      return;
    }

    const q = busqueda.trim().toLowerCase();
    const rows: PedidoRow[] = ((pedData ?? []) as Omit<PedidoRow, "fecha_dlitro" | "sucursal_nombre">[])
      .filter((p) => {
        if (!q) return true;
        return (
          (p.cliente_nombre ?? "").toLowerCase().includes(q) ||
          (p.cliente_telefono ?? "").toLowerCase().includes(q) ||
          String(p.numero_pedido ?? "").includes(q)
        );
      })
      .map((p) => ({
        ...p,
        fecha_dlitro: turnoMap.get(p.turno_id)?.fecha_dlitro ?? fecha,
        sucursal_nombre: sucMap.get(p.sucursal_id) ?? "—",
      }));

    setPedidos(rows);
    setLoading(false);
  }, [fecha, sucursalId, estadoFiltro, tipoFiltro, busqueda, sucursales]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sucursales").select("id, nombre").order("nombre");
      setSucursales((data as Sucursal[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    const ch = supabase
      .channel("admin-pedidos-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, () => {
        void cargar();
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [cargar]);

  if (perfil && perfil.rol !== "superadmin") {
    return <Navigate to="/admin/dashboard" replace />;
  }

  return (
    <div className="p-6 space-y-5 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-3xl font-display tracking-wide">📋 Pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Corrección de pedidos por día dlitro — solo superadmin
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-card border border-border rounded-xl p-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Fecha dlitro</Label>
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="bg-background h-9" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sucursal</Label>
          <Select value={sucursalId} onValueChange={setSucursalId}>
            <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Estado</Label>
          <Select value={estadoFiltro} onValueChange={setEstadoFiltro}>
            <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {ESTADOS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Tipo</Label>
          <Select value={tipoFiltro} onValueChange={setTipoFiltro}>
            <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todos</SelectItem>
              {TIPOS_EDIT.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Nombre, teléfono o #"
              className="bg-background h-9 pl-8"
            />
          </div>
        </div>
      </div>

      <div className="text-sm text-muted-foreground">
        {loading ? "Cargando…" : (
          <>
            <span className="font-mono text-foreground font-semibold">{pedidos.length}</span> pedido{pedidos.length === 1 ? "" : "s"}
            {" · "}día <span className="font-mono text-foreground">{fecha}</span>
          </>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando pedidos…
        </div>
      ) : pedidos.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground border border-border rounded-xl bg-card">
          No hay pedidos para estos filtros.
        </div>
      ) : (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))" }}>
          {pedidos.map((p) => {
            const tcfg = TIPO_META[(p.tipo as TipoPedido)] ?? TIPO_META.local;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setDetalle(p)}
                className="bg-card border border-border rounded-xl p-3 text-left hover:border-primary transition flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="font-display text-2xl font-bold text-primary leading-none">#{p.numero_pedido}</span>
                  <Badge className={`${tcfg.badgeCls} border text-[9px] font-bold`} variant="outline">
                    {tcfg.short}
                  </Badge>
                </div>
                <div className="text-sm font-medium truncate">{p.cliente_nombre}</div>
                {p.cliente_telefono && (
                  <div className="text-[11px] font-mono text-muted-foreground">{p.cliente_telefono}</div>
                )}
                <Badge className={`${ESTADO_CLS[p.estado] ?? ""} border w-full justify-center text-[9px] uppercase`} variant="outline">
                  {ESTADOS.find((e) => e.value === p.estado)?.label ?? p.estado}
                </Badge>
                <div className="font-mono text-lg font-bold text-primary">{fmtCLP(p.total)}</div>
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span className="truncate">{p.sucursal_nombre}</span>
                  <span className="font-mono shrink-0">{p.fecha_dlitro}</span>
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {p.metodo_pago ?? "sin pago"}
                  {p.pago_registrado ? " · ✓" : ""}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {detalle && (
        <PedidoEditModal
          pedido={detalle}
          open={!!detalle}
          onClose={() => setDetalle(null)}
          onSaved={() => {
            setDetalle(null);
            void cargar();
          }}
        />
      )}
    </div>
  );
}

function PedidoEditModal({
  pedido,
  open,
  onClose,
  onSaved,
}: {
  pedido: PedidoRow;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { perfil } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [despachadores, setDespachadores] = useState<Despachador[]>([]);
  const [productos, setProductos] = useState<ProductoCat[]>([]);
  const [items, setItems] = useState<EditItem[]>([]);
  const [originalItems, setOriginalItems] = useState<EditItem[]>([]);
  const [pagosDetalle, setPagosDetalle] = useState<PagoTurnoDetalle[]>([]);
  const [catalogoOpen, setCatalogoOpen] = useState(false);
  const [prodBusqueda, setProdBusqueda] = useState("");

  const [clienteNombre, setClienteNombre] = useState(pedido.cliente_nombre);
  const [clienteTelefono, setClienteTelefono] = useState(pedido.cliente_telefono ?? "");
  const [tipo, setTipo] = useState(pedido.tipo);
  const [direccion, setDireccion] = useState(pedido.direccion_entrega ?? "");
  const [referenciaEntrega, setReferenciaEntrega] = useState(pedido.referencia_entrega ?? "");
  const [despachadorId, setDespachadorId] = useState(pedido.despachador_id ?? "__none__");
  const [estado, setEstado] = useState(pedido.estado);
  const [pagoEfectivo, setPagoEfectivo] = useState("");
  const [pagoTransfer, setPagoTransfer] = useState("");
  const [pagoTarjeta, setPagoTarjeta] = useState("");
  const [pagoTransferRef, setPagoTransferRef] = useState("");
  const pagoTransferRefTouched = useRef(false);
  const [notas, setNotas] = useState(pedido.notas ?? "");

  useEffect(() => {
    setClienteNombre(pedido.cliente_nombre);
    setClienteTelefono(pedido.cliente_telefono ?? "");
    setTipo(pedido.tipo);
    setDireccion(pedido.direccion_entrega ?? "");
    setReferenciaEntrega(pedido.referencia_entrega ?? "");
    setDespachadorId(pedido.despachador_id ?? "__none__");
    setEstado(pedido.estado);
    setNotas(pedido.notas ?? "");
    pagoTransferRefTouched.current = false;
  }, [pedido]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const [itemsRes, pagosRes, despRes, prodRes] = await Promise.all([
        supabase
          .from("pedido_items")
          .select("id, producto_id, cantidad, precio_unitario, descuento_item, subtotal, notas, productos:producto_id(nombre)")
          .eq("pedido_id", pedido.id),
        supabase
          .from("pagos_turno")
          .select("metodo, monto, referencia")
          .eq("pedido_id", pedido.id),
        supabase
          .from("usuarios")
          .select("id, nombre, nombre_completo, sucursal_id")
          .eq("rol", "despachador")
          .eq("activo", true)
          .order("nombre"),
        supabase.from("productos").select("id, nombre, precio").eq("activo", true).order("nombre"),
      ]);

      const its = ((itemsRes.data as unknown as Array<{
        id: string;
        producto_id: string;
        cantidad: number;
        precio_unitario: number;
        descuento_item: number | null;
        notas: string | null;
        productos: { nombre: string } | null;
      }>) ?? []).map((r) => ({
        id: r.id,
        producto_id: r.producto_id,
        nombre: r.productos?.nombre ?? "—",
        cantidad: r.cantidad,
        precio_unitario: r.precio_unitario,
        descuento_item: r.descuento_item,
        notas: r.notas,
      }));
      setItems(its);
      setOriginalItems(its.map((i) => ({ ...i })));

      const pagos = ((pagosRes.data as PagoTurnoDetalle[] | null) ?? []).filter((p) => Number(p.monto) > 0);
      setPagosDetalle(pagos);

      const montoDe = (metodo: string) => {
        const row = pagos.find((p) => p.metodo === metodo);
        return row ? String(row.monto) : "";
      };
      let ef = montoDe("efectivo");
      let tr = montoDe("transferencia");
      let ta = montoDe("tarjeta");
      let refTr =
        pagos.find((p) => p.metodo === "transferencia" && p.referencia)?.referencia
        ?? pedido.referencia_pago
        ?? "";

      // Fallback si no hay filas en pagos_turno pero el pedido tiene pago simple
      if (pagos.length === 0 && pedido.pago_registrado && pedido.metodo_pago) {
        const totalStr = String(pedido.total);
        if (pedido.metodo_pago === "efectivo") ef = totalStr;
        else if (pedido.metodo_pago === "transferencia") {
          tr = totalStr;
          refTr = pedido.referencia_pago || referenciaPagoTransferencia(pedido.numero_pedido) || "";
        } else if (pedido.metodo_pago === "tarjeta") ta = totalStr;
      }

      setPagoEfectivo(ef);
      setPagoTransfer(tr);
      setPagoTarjeta(ta);
      setPagoTransferRef(refTr);
      pagoTransferRefTouched.current = !!refTr;

      setDespachadores((despRes.data as Despachador[]) ?? []);
      setProductos((prodRes.data as ProductoCat[]) ?? []);
      setLoading(false);
    })();
  }, [open, pedido.id, pedido.pago_registrado, pedido.metodo_pago, pedido.total, pedido.referencia_pago, pedido.numero_pedido]);

  const subtotal = useMemo(
    () => items.reduce((a, it) => a + it.precio_unitario * it.cantidad, 0),
    [items],
  );
  const descuento = pedido.descuento ?? 0;
  const costoDespacho = pedido.costo_despacho ?? 0;
  const totalCalc = Math.max(0, subtotal - descuento + costoDespacho);

  const pagoEf = parseInt(pagoEfectivo || "0", 10) || 0;
  const pagoTr = parseInt(pagoTransfer || "0", 10) || 0;
  const pagoTa = parseInt(pagoTarjeta || "0", 10) || 0;
  const totalIngresado = pagoEf + pagoTr + pagoTa;
  const pagoDiferencia = totalIngresado - totalCalc;
  const esPedidoPlataforma = tipo === "uber" || tipo === "rappi";

  const metodoDetectado: MetodoPago | null = useMemo(() => {
    if (esPedidoPlataforma) return null;
    if (totalIngresado <= 0) return null;
    if (pagoEf > 0 && pagoTr === 0 && pagoTa === 0) return "efectivo";
    if (pagoTr > 0 && pagoEf === 0 && pagoTa === 0) return "transferencia";
    if (pagoTa > 0 && pagoEf === 0 && pagoTr === 0) return "tarjeta";
    return "mixto";
  }, [esPedidoPlataforma, totalIngresado, pagoEf, pagoTr, pagoTa]);

  const productosFiltrados = productos.filter((p) =>
    !prodBusqueda || p.nombre.toLowerCase().includes(prodBusqueda.toLowerCase()),
  );

  const agregarProducto = (p: ProductoCat) => {
    setItems((prev) => [
      ...prev,
      {
        producto_id: p.id,
        nombre: p.nombre,
        cantidad: 1,
        precio_unitario: p.precio,
        descuento_item: null,
        notas: null,
      },
    ]);
    setCatalogoOpen(false);
    setProdBusqueda("");
  };

  const guardar = async () => {
    if (!perfil?.id) return;
    if (items.length === 0) {
      toast.error("El pedido no puede quedar sin productos");
      return;
    }

    const esPlataforma = tipo === "uber" || tipo === "rappi";
    const cancelando = estado === "cancelado";
    let metodoFinal: MetodoPago | null = esPlataforma ? (pedido.metodo_pago as MetodoPago | null) : metodoDetectado;
    let refFinal: string | null = null;
    let pagoRegistradoFinal = false;

    if (cancelando) {
      // Pedido cancelado: no debe aportar a caja
      pagoRegistradoFinal = false;
      if (!esPlataforma) {
        metodoFinal = null;
        refFinal = null;
      } else {
        refFinal = pedido.referencia_pago;
      }
    } else if (!esPlataforma) {
      if (totalIngresado > 0 && totalIngresado < totalCalc) {
        toast.error(`Falta ${fmtCLP(totalCalc - totalIngresado)}`);
        return;
      }
      if (totalIngresado > 0) {
        pagoRegistradoFinal = true;
        metodoFinal =
          pagoEf > 0 && pagoTr === 0 && pagoTa === 0 ? "efectivo"
          : pagoTr > 0 && pagoEf === 0 && pagoTa === 0 ? "transferencia"
          : pagoTa > 0 && pagoEf === 0 && pagoTr === 0 ? "tarjeta"
          : "mixto";
        if (pagoTr > 0) {
          refFinal = pagoTransferRef.trim() || referenciaPagoTransferencia(pedido.numero_pedido);
        }
      } else {
        metodoFinal = null;
        pagoRegistradoFinal = false;
      }
    } else {
      pagoRegistradoFinal = !!pedido.pago_registrado;
      refFinal = pedido.referencia_pago;
    }

    setSaving(true);

    const updatePayload = {
      cliente_nombre: clienteNombre.trim(),
      cliente_telefono: clienteTelefono.trim() || null,
      tipo: tipo as TipoPedido,
      direccion_entrega: tipo === "despacho" ? direccion.trim() || null : null,
      referencia_entrega: tipo === "despacho" ? referenciaEntrega.trim() || null : null,
      despachador_id: despachadorId === "__none__" ? null : despachadorId,
      estado: estado as Estado,
      metodo_pago: metodoFinal,
      referencia_pago: refFinal,
      pago_registrado: pagoRegistradoFinal,
      notas: notas.trim() || null,
      subtotal,
      total: totalCalc,
    };

    const logs: Array<{
      pedido_id: string;
      usuario_id: string;
      campo: string;
      valor_anterior: string;
      valor_nuevo: string;
    }> = [];

    const origMap: Record<string, unknown> = {
      cliente_nombre: pedido.cliente_nombre,
      cliente_telefono: pedido.cliente_telefono,
      tipo: pedido.tipo,
      direccion_entrega: pedido.direccion_entrega,
      referencia_entrega: pedido.referencia_entrega,
      despachador_id: pedido.despachador_id,
      estado: pedido.estado,
      metodo_pago: pedido.metodo_pago,
      referencia_pago: pedido.referencia_pago,
      pago_registrado: pedido.pago_registrado,
      notas: pedido.notas,
      subtotal: pedido.subtotal,
      total: pedido.total,
    };

    for (const [campo, valorNuevo] of Object.entries(updatePayload)) {
      const ant = origMap[campo];
      if (str(ant) !== str(valorNuevo)) {
        logs.push({
          pedido_id: pedido.id,
          usuario_id: perfil.id,
          campo,
          valor_anterior: str(ant),
          valor_nuevo: str(valorNuevo),
        });
      }
    }

    const { error: upErr } = await supabase.from("pedidos").update(updatePayload).eq("id", pedido.id);
    if (upErr) {
      setSaving(false);
      toast.error(upErr.message);
      return;
    }

    // Items: delete removed, update existing, insert new
    const currentIds = items.filter((i) => i.id).map((i) => i.id!);
    const removed = originalItems.filter((o) => o.id && !currentIds.includes(o.id)).map((o) => o.id!);
    if (removed.length > 0) {
      const { error } = await supabase.from("pedido_items").delete().in("id", removed);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }

    for (const it of items) {
      if (it.id) {
        const { error } = await supabase
          .from("pedido_items")
          .update({
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal: it.cantidad * it.precio_unitario,
            notas: it.notas,
          })
          .eq("id", it.id);
        if (error) {
          setSaving(false);
          toast.error(error.message);
          return;
        }
      } else {
        const { error } = await supabase.from("pedido_items").insert({
          pedido_id: pedido.id,
          producto_id: it.producto_id,
          cantidad: it.cantidad,
          precio_unitario: it.precio_unitario,
          subtotal: it.cantidad * it.precio_unitario,
          notas: it.notas,
        });
        if (error) {
          setSaving(false);
          toast.error(error.message);
          return;
        }
      }
    }

    const itemsChanged =
      removed.length > 0 ||
      items.some((i) => !i.id) ||
      items.some((i) => {
        const o = originalItems.find((x) => x.id === i.id);
        return o && (o.cantidad !== i.cantidad || o.precio_unitario !== i.precio_unitario);
      });
    if (itemsChanged) {
      logs.push({
        pedido_id: pedido.id,
        usuario_id: perfil.id,
        campo: "items",
        valor_anterior: JSON.stringify(originalItems.map((i) => ({ n: i.nombre, c: i.cantidad, p: i.precio_unitario }))),
        valor_nuevo: JSON.stringify(items.map((i) => ({ n: i.nombre, c: i.cantidad, p: i.precio_unitario }))),
      });
    }

    // pagos_turno: reemplazar según montos del formulario (nunca reinsertar si cancelado)
    if (!esPlataforma || cancelando) {
      const { error: delPagErr } = await supabase.from("pagos_turno").delete().eq("pedido_id", pedido.id);
      if (delPagErr) {
        setSaving(false);
        toast.error(`Pedido guardado, error al limpiar pagos: ${delPagErr.message}`);
        onSaved();
        return;
      }

      if (!cancelando && !esPlataforma) {
        const inserts: Array<{
          turno_id: string;
          pedido_id: string;
          metodo: "efectivo" | "transferencia" | "tarjeta";
          monto: number;
          referencia: string | null;
        }> = [];
        if (pagoEf > 0) {
          inserts.push({
            turno_id: pedido.turno_id,
            pedido_id: pedido.id,
            metodo: "efectivo",
            monto: pagoEf,
            referencia: null,
          });
        }
        if (pagoTr > 0) {
          inserts.push({
            turno_id: pedido.turno_id,
            pedido_id: pedido.id,
            metodo: "transferencia",
            monto: pagoTr,
            referencia: refFinal,
          });
        }
        if (pagoTa > 0) {
          inserts.push({
            turno_id: pedido.turno_id,
            pedido_id: pedido.id,
            metodo: "tarjeta",
            monto: pagoTa,
            referencia: null,
          });
        }

        if (inserts.length > 0) {
          const { error: pagErr } = await supabase.from("pagos_turno").insert(inserts);
          if (pagErr) {
            setSaving(false);
            toast.error(`Pedido guardado, error en pagos_turno: ${pagErr.message}`);
            onSaved();
            return;
          }
        }

        const pagosAntes = pagosDetalle.map((p) => `${p.metodo}:${p.monto}`).join(",");
        const pagosNuevos = inserts.map((p) => `${p.metodo}:${p.monto}`).join(",");
        if (pagosAntes !== pagosNuevos) {
          logs.push({
            pedido_id: pedido.id,
            usuario_id: perfil.id,
            campo: "pagos_turno",
            valor_anterior: pagosAntes || "(vacío)",
            valor_nuevo: pagosNuevos || "(vacío)",
          });
        }
      } else if (cancelando && (pedido.pago_registrado || pagosDetalle.length > 0)) {
        logs.push({
          pedido_id: pedido.id,
          usuario_id: perfil.id,
          campo: "pagos_turno",
          valor_anterior: pagosDetalle.map((p) => `${p.metodo}:${p.monto}`).join(",") || "(registrado)",
          valor_nuevo: "(eliminado por cancelación)",
        });
      }
    }

    if (logs.length > 0) {
      const { error: logErr } = await supabase.from("log_cambios_pedido").insert(logs);
      if (logErr) console.warn("[log_cambios_pedido]", logErr.message);
    }

    setSaving(false);
    toast.success(`Pedido #${pedido.numero_pedido} actualizado`);
    onSaved();
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 flex-wrap">
              <span className="font-display text-3xl text-primary">#{pedido.numero_pedido}</span>
              <Badge variant="outline" className="text-[10px]">{pedido.sucursal_nombre}</Badge>
              <Badge variant="outline" className="text-[10px] font-mono">{pedido.fecha_dlitro}</Badge>
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="py-10 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline mr-2" /> Cargando…
            </div>
          ) : (
            <div className="space-y-5">
              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Cliente</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre</Label>
                    <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} className="bg-background" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Teléfono</Label>
                    <Input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} className="bg-background font-mono" />
                  </div>
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Entrega</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Tipo</Label>
                    <Select value={tipo} onValueChange={setTipo}>
                      <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {TIPOS_EDIT.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Estado</Label>
                    <Select value={estado} onValueChange={setEstado}>
                      <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ESTADOS.map((e) => (
                          <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {tipo === "despacho" && (
                    <>
                      <div className="space-y-1 sm:col-span-2">
                        <Label className="text-xs">Dirección</Label>
                        <Input value={direccion} onChange={(e) => setDireccion(e.target.value)} className="bg-background" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Referencia entrega</Label>
                        <Input value={referenciaEntrega} onChange={(e) => setReferenciaEntrega(e.target.value)} className="bg-background" />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Despachador</Label>
                        <Select value={despachadorId} onValueChange={setDespachadorId}>
                          <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Sin asignar</SelectItem>
                            {despachadores
                              .filter((d) => !d.sucursal_id || d.sucursal_id === pedido.sucursal_id)
                              .map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.nombre_completo || d.nombre}</SelectItem>
                              ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </>
                  )}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Información de pago
                </h3>
                {esPedidoPlataforma ? (
                  <div className="bg-background border border-border rounded-md p-3 text-sm font-semibold">
                    {tipo === "uber"
                      ? "💳 Pago gestionado por Uber Eats"
                      : "💳 Pago gestionado por Rappi"}
                  </div>
                ) : (
                  <div className="bg-background border border-border rounded-md p-3 space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Banknote className="h-3 w-3" /> Efectivo
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={pagoEfectivo}
                        onChange={(e) => setPagoEfectivo(e.target.value)}
                        placeholder="0"
                        className="bg-card font-mono h-9"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <Landmark className="h-3 w-3" /> Transferencia
                      </Label>
                      <div className="flex gap-2">
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
                          className="bg-card font-mono h-9 flex-1"
                        />
                        <Input
                          value={pagoTransferRef}
                          onChange={(e) => {
                            pagoTransferRefTouched.current = true;
                            setPagoTransferRef(e.target.value);
                          }}
                          placeholder="Referencia"
                          className="bg-card h-9 w-[40%] font-mono"
                          maxLength={50}
                          disabled={pagoTr <= 0}
                        />
                      </div>
                      {pagoTr > 0 && !pagoTransferRef.trim() && (
                        <p className="text-[10px] text-muted-foreground">
                          Si no ingresás referencia, se usará #{pedido.numero_pedido}
                        </p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs flex items-center gap-1">
                        <CreditCard className="h-3 w-3" /> Tarjeta
                      </Label>
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={pagoTarjeta}
                        onChange={(e) => setPagoTarjeta(e.target.value)}
                        placeholder="0"
                        className="bg-card font-mono h-9"
                      />
                    </div>
                    <div className="pt-2 border-t border-border space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total ingresado</span>
                        <span className="font-mono">{fmtCLP(totalIngresado)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total pedido</span>
                        <span className="font-mono">{fmtCLP(totalCalc)}</span>
                      </div>
                      <div className="flex justify-between font-medium">
                        <span>Diferencia</span>
                        <span
                          className={`font-mono ${
                            pagoDiferencia < 0
                              ? "text-destructive"
                              : pagoDiferencia > 0
                                ? "text-success"
                                : totalIngresado > 0
                                  ? "text-success"
                                  : ""
                          }`}
                        >
                          {pagoDiferencia > 0 ? "+" : ""}
                          {fmtCLP(pagoDiferencia)}
                        </span>
                      </div>
                      {metodoDetectado && (
                        <div className="flex justify-between text-muted-foreground pt-1">
                          <span>Método detectado</span>
                          <span className="font-medium text-foreground">{labelMetodoPago(metodoDetectado)}</span>
                        </div>
                      )}
                      <div
                        className={`pt-1 border-t border-border font-medium ${
                          totalIngresado >= totalCalc && totalIngresado > 0
                            ? "text-success"
                            : "text-warning"
                        }`}
                      >
                        {totalIngresado >= totalCalc && totalIngresado > 0
                          ? "✅ Pago registrado"
                          : "⏳ Pago pendiente"}
                      </div>
                    </div>
                  </div>
                )}
              </section>

              <section className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Productos del pedido
                  </h3>
                  <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={() => setCatalogoOpen(true)}>
                    <Plus className="h-3 w-3 mr-1" /> Agregar
                  </Button>
                </div>
                <div className="border border-border rounded-md divide-y divide-border bg-background">
                  {items.map((it, idx) => {
                    const parsed = parseItemNotas(it.notas);
                    const extrasTotal = parsed.extras.reduce((a, e) => a + e.precio, 0);
                    const baseUnit = Math.max(0, it.precio_unitario - extrasTotal);
                    const isPromo =
                      baseUnit === 0
                      || esItemPromoJarros(it)
                      || /\[PROMO /i.test(it.notas ?? "");
                    const notaCliente = parsed.notaUsuario;

                    return (
                      <div key={it.id ?? `n-${idx}`} className="px-3 py-2 space-y-1.5">
                        <div className="flex items-center gap-2 text-sm">
                          <div className="flex-1 min-w-0">
                            <div className="truncate">
                              {it.nombre}{" "}
                              <span className="text-muted-foreground font-mono text-xs">x{it.cantidad}</span>
                              {isPromo && (
                                <Badge className="ml-1.5 text-[9px] px-1 py-0 bg-success/15 text-success border-success/40" variant="outline">
                                  PROMO
                                </Badge>
                              )}
                            </div>
                            {notaCliente && (
                              <div className="text-[10px] text-muted-foreground truncate">{notaCliente}</div>
                            )}
                          </div>
                          <Input
                            type="number"
                            min="1"
                            value={it.cantidad}
                            onChange={(e) => {
                              const n = Math.max(1, parseInt(e.target.value || "1", 10) || 1);
                              setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, cantidad: n } : x)));
                            }}
                            className="w-16 h-8 font-mono text-center bg-card"
                          />
                          <div className="font-mono w-24 text-right text-xs">
                            {fmtCLP(baseUnit * it.cantidad)}
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {parsed.extras.map((ex, exIdx) => (
                          <div key={`${it.id ?? idx}-ex-${exIdx}`} className="flex items-center pl-4 pr-10 text-xs text-muted-foreground">
                            <span className="flex-1 truncate">+ {formatSaborExtra(ex.nombre)}</span>
                            <span className="font-mono w-24 text-right">{fmtCLP(ex.precio * it.cantidad)}</span>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="p-4 text-center text-sm text-destructive">Sin productos</div>
                  )}
                </div>
                <div className="bg-card border border-border rounded-md p-3 space-y-1 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Subtotal</span>
                    <span className="font-mono">{fmtCLP(subtotal)}</span>
                  </div>
                  {descuento > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Descuento</span>
                      <span className="font-mono">−{fmtCLP(descuento)}</span>
                    </div>
                  )}
                  {costoDespacho > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Costo despacho</span>
                      <span className="font-mono">{fmtCLP(costoDespacho)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-semibold pt-1 border-t border-border">
                    <span>Total</span>
                    <span className="font-mono text-primary text-lg">{fmtCLP(totalCalc)}</span>
                  </div>
                </div>
              </section>

              <div className="space-y-1">
                <Label className="text-xs">Notas</Label>
                <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} className="bg-background" rows={2} />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
            <Button onClick={guardar} disabled={saving || loading || items.length === 0}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={catalogoOpen} onOpenChange={setCatalogoOpen}>
        <DialogContent className="max-w-lg max-h-[70vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Agregar producto</DialogTitle>
          </DialogHeader>
          <Input
            value={prodBusqueda}
            onChange={(e) => setProdBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="bg-background"
          />
          <div className="grid grid-cols-1 gap-1 max-h-80 overflow-auto">
            {productosFiltrados.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => agregarProducto(p)}
                className="flex justify-between items-center text-left px-3 py-2 rounded-md border border-border hover:border-primary bg-background text-sm"
              >
                <span className="truncate">{p.nombre}</span>
                <span className="font-mono text-xs text-muted-foreground ml-2">{fmtCLP(p.precio)}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
