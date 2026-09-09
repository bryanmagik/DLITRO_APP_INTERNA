import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  TrendingDown,
  TrendingUp,
  Clock,
  Download,
  Save,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { tipoMeta } from "@/lib/tiposPedido";
import { esItemPromoJarros } from "@/lib/pedidoImpresion";
import { exportarContadorExcel } from "@/lib/exportContadorExcel";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(n);

const METODO_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  mixto: "Mixto",
  cortesia: "Cortesía",
};

const METODO_BADGE: Record<string, string> = {
  efectivo:      "bg-emerald-500/10 text-emerald-700 border-emerald-300",
  transferencia: "bg-blue-500/10 text-blue-700 border-blue-300",
  tarjeta:       "bg-violet-500/10 text-violet-700 border-violet-300",
  mixto:         "bg-orange-500/10 text-orange-700 border-orange-300",
  cortesia:      "bg-gray-500/10 text-gray-500 border-gray-300",
};

const ESTADO_PEDIDO_LABEL: Record<string, string> = {
  en_preparacion: "En prep.",
  listo: "Listo",
  en_despacho: "En despacho",
  entregado: "Entregado",
  cancelado: "Cancelado",
};

type EstadoCuadratura = "por_revisar" | "revisado" | "descuadrado";

const CUADRATURA_CONFIG: Record<
  EstadoCuadratura,
  { label: string; className: string; dotColor: string; icon: React.ReactNode }
> = {
  por_revisar: {
    label: "Por revisar",
    className: "bg-warning/10 text-warning border-warning/40",
    dotColor: "bg-warning",
    icon: <Clock className="h-3 w-3" />,
  },
  revisado: {
    label: "Revisado",
    className: "bg-success/10 text-success border-success/40",
    dotColor: "bg-success",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  descuadrado: {
    label: "Descuadrado",
    className: "bg-destructive/10 text-destructive border-destructive/40",
    dotColor: "bg-destructive",
    icon: <AlertTriangle className="h-3 w-3" />,
  },
};

const FILTRO_OPTIONS: { value: EstadoCuadratura | "todos"; label: string; dotColor?: string }[] = [
  { value: "todos",       label: "Todos" },
  { value: "por_revisar", label: "Por revisar", dotColor: "bg-warning" },
  { value: "revisado",    label: "Revisados",   dotColor: "bg-success" },
  { value: "descuadrado", label: "Descuadrados", dotColor: "bg-destructive" },
];

const DIAS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

// ── Interfaces ────────────────────────────────────────────────────────────────

interface TurnoResumen {
  id: string;
  sucursal_id: string;
  sucursal_nombre: string;
  fecha_dlitro: string;
  caja_chica_apertura: number;
  diferencia_caja: number | null;
  efectivo_declarado: number | null;
  efectivo_declarado_caja_chica: number | null;
  efectivo_declarado_sobre: number | null;
  efectivo_sistema: number | null;
  observacion_descuadre: string | null;
  estado_cuadratura: EstadoCuadratura;
  comentario_contador: string | null;
  comentario_contador_fecha: string | null;
  comentario_contador_usuario_id: string | null;
  comentario_autor_nombre: string | null;
}

interface TurnoResumenQueryRow {
  id: string;
  sucursal_id: string;
  fecha_dlitro: string;
  caja_chica_apertura: number | null;
  diferencia_caja: number | null;
  efectivo_declarado: number | null;
  efectivo_declarado_caja_chica: number | null;
  efectivo_declarado_sobre: number | null;
  efectivo_sistema: number | null;
  observacion_descuadre: string | null;
  estado_cuadratura: string | null;
  comentario_contador: string | null;
  comentario_contador_fecha: string | null;
  comentario_contador_usuario_id: string | null;
  sucursales: { nombre: string } | null;
  comentario_autor: { nombre: string | null; nombre_completo: string | null } | null;
}

interface PagoTurno {
  id: string;
  turno_id: string;
  metodo: string;
  monto: number;
}

interface GastoTurno {
  id: string;
  concepto: string;
  monto: number;
  metodo: string | null;
}

interface PedidoItemDetalle {
  cantidad: number;
  precio_unitario: number;
  descuento_item: number | null;
  subtotal: number;
  notas: string | null;
  producto?: { nombre: string } | null;
}

interface PedidoRow {
  id: string;
  numero_pedido: number | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo: string;
  estado: string;
  metodo_pago: string | null;
  subtotal: number;
  descuento: number | null;
  costo_despacho: number | null;
  total: number;
  monto_recibido: number | null;
  vuelto: number | null;
  pago_registrado: boolean | null;
  origen: string | null;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  notas: string | null;
  hora_agendada: string | null;
  jarros_entregados: number | null;
  created_at: string | null;
  usuarios?: { nombre: string | null; apellido: string | null; nombre_completo: string | null } | null;
  pedido_items?: PedidoItemDetalle[] | null;
}

interface PagoDesp {
  id: string;
  despachador_nombre: string;
  pedidos_entregados: number | null;
  horas_trabajadas: number | null;
  base_por_horas: number | null;
  bono: number | null;
  total_a_pagar: number;
}

interface PagoDespQueryRow {
  id: string;
  despachador_id: string;
  pedidos_entregados: number | null;
  horas_trabajadas: number | null;
  base_por_horas: number | null;
  bono: number | null;
  total_a_pagar: number;
  usuarios: {
    nombre_completo: string | null;
    nombre: string | null;
    apellido: string | null;
  } | null;
}

interface DetalleData {
  pagos: PagoTurno[];
  gastos: GastoTurno[];
  pedidos: PedidoRow[];
  despachadores: PagoDesp[];
}

// ── Utilidades calendario ─────────────────────────────────────────────────────

function isoFecha(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function fechaDisplay(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function fmtHoraPedido(p: Pick<PedidoRow, "hora_agendada" | "created_at">): string {
  const iso = p.hora_agendada || p.created_at;
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
}

function nombreDespachador(p: PedidoRow): string {
  const u = p.usuarios;
  if (!u) return "—";
  return u.nombre_completo || `${u.nombre ?? ""} ${u.apellido ?? ""}`.trim() || "—";
}

function vueltoPedido(p: PedidoRow): number | null {
  if (p.vuelto != null && Number.isFinite(Number(p.vuelto))) return Number(p.vuelto);
  if (p.monto_recibido != null) return Math.max(0, Number(p.monto_recibido) - Number(p.total));
  return null;
}

function labelItemPedido(it: PedidoItemDetalle): string {
  const nombre = it.producto?.nombre ?? "Producto";
  const linea = `${nombre} x${it.cantidad} → ${fmtCLP(it.subtotal)}`;
  if (esItemPromoJarros(it)) return `${linea} (GRATIS - PROMO JARROS)`;
  if (it.precio_unitario === 0) return `${linea} (GRATIS)`;
  return linea;
}

function fmtFechaComentario(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function escaparCsv(v: string | number | null | undefined): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ContadorPage() {
  const perfil = useAuthStore((s) => s.perfil);
  const esContador = perfil?.rol === "contador_rrhh";
  const puedeEditarNota = perfil?.rol === "contador_rrhh" || perfil?.rol === "superadmin";

  const hoy = new Date();
  const [mes, setMes] = useState(() => new Date(hoy.getFullYear(), hoy.getMonth(), 1));
  const [turnos, setTurnos] = useState<TurnoResumen[]>([]);
  const [loadingMes, setLoadingMes] = useState(true);
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null);
  const [pagosPorTurno, setPagosPorTurno] = useState<Record<string, PagoTurno[]>>({});
  const [loadingDia, setLoadingDia] = useState(false);
  const [turnoDetalle, setTurnoDetalle] = useState<TurnoResumen | null>(null);
  const [detalle, setDetalle] = useState<DetalleData | null>(null);
  const [loadingDetalle, setLoadingDetalle] = useState(false);
  const [filtroCuadratura, setFiltroCuadratura] = useState<EstadoCuadratura | "todos">("todos");
  const [guardandoCuadratura, setGuardandoCuadratura] = useState(false);
  const [comentarioDraft, setComentarioDraft] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportFechaInicio, setExportFechaInicio] = useState("");
  const [exportFechaFin, setExportFechaFin] = useState("");
  const [exportSucursalId, setExportSucursalId] = useState<string>("__all__");
  const [exportSucursales, setExportSucursales] = useState<Array<{ id: string; nombre: string }>>([]);
  const [exportando, setExportando] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sucursales").select("id, nombre").order("nombre");
      setExportSucursales((data as Array<{ id: string; nombre: string }>) ?? []);
    })();
  }, []);

  const abrirExport = () => {
    const y = mes.getFullYear();
    const m = mes.getMonth();
    setExportFechaInicio(isoFecha(y, m, 1));
    setExportFechaFin(isoFecha(y, m, new Date(y, m + 1, 0).getDate()));
    setExportSucursalId("__all__");
    setExportOpen(true);
  };

  const confirmarExport = async () => {
    if (!exportFechaInicio || !exportFechaFin) {
      toast.error("Seleccioná el rango de fechas");
      return;
    }
    if (exportFechaInicio > exportFechaFin) {
      toast.error("La fecha inicio no puede ser mayor a la fin");
      return;
    }
    setExportando(true);
    try {
      const suc =
        exportSucursalId === "__all__"
          ? null
          : exportSucursales.find((s) => s.id === exportSucursalId) ?? null;
      await exportarContadorExcel({
        fechaInicio: exportFechaInicio,
        fechaFin: exportFechaFin,
        sucursalId: suc?.id ?? null,
        sucursalNombreArchivo: suc?.nombre ?? "TODAS",
      });
      toast.success("Excel descargado");
      setExportOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo exportar");
    } finally {
      setExportando(false);
    }
  };

  // ── Carga mensual ─────────────────────────────────────────────────────────

  useEffect(() => {
    setLoadingMes(true);
    setDiaSeleccionado(null);
    setPagosPorTurno({});
    const y = mes.getFullYear();
    const m = mes.getMonth();
    const inicio = isoFecha(y, m, 1);
    const fin = isoFecha(y, m, new Date(y, m + 1, 0).getDate());

    supabase
      .from("turnos")
      .select(
        "id,sucursal_id,fecha_dlitro,caja_chica_apertura,diferencia_caja,efectivo_declarado,efectivo_declarado_caja_chica,efectivo_declarado_sobre,efectivo_sistema,observacion_descuadre,estado_cuadratura,comentario_contador,comentario_contador_fecha,comentario_contador_usuario_id,sucursales(nombre),comentario_autor:comentario_contador_usuario_id(nombre,nombre_completo)"
      )
      .eq("estado", "cerrado")
      .gte("fecha_dlitro", inicio)
      .lte("fecha_dlitro", fin)
      .order("fecha_dlitro")
      .then(({ data }) => {
        const rows = (data ?? []) as unknown as TurnoResumenQueryRow[];
        const lista: TurnoResumen[] = rows.map((t) => ({
          id: t.id,
          sucursal_id: t.sucursal_id,
          sucursal_nombre: t.sucursales?.nombre ?? "—",
          fecha_dlitro: t.fecha_dlitro,
          caja_chica_apertura: t.caja_chica_apertura ?? 0,
          diferencia_caja: t.diferencia_caja,
          efectivo_declarado: t.efectivo_declarado,
          efectivo_declarado_caja_chica: t.efectivo_declarado_caja_chica,
          efectivo_declarado_sobre: t.efectivo_declarado_sobre,
          efectivo_sistema: t.efectivo_sistema,
          observacion_descuadre: t.observacion_descuadre,
          estado_cuadratura: (t.estado_cuadratura as EstadoCuadratura) ?? "por_revisar",
          comentario_contador: t.comentario_contador ?? null,
          comentario_contador_fecha: t.comentario_contador_fecha ?? null,
          comentario_contador_usuario_id: t.comentario_contador_usuario_id ?? null,
          comentario_autor_nombre:
            t.comentario_autor?.nombre_completo
            || t.comentario_autor?.nombre
            || null,
        }));
        setTurnos(lista);
        setLoadingMes(false);
      });
  }, [mes]);

  // Fechas a mostrar en el calendario según filtro activo
  const fechasConTurno = useMemo(() => {
    const filtrados =
      filtroCuadratura === "todos"
        ? turnos
        : turnos.filter((t) => t.estado_cuadratura === filtroCuadratura);
    return new Set(filtrados.map((t) => t.fecha_dlitro));
  }, [turnos, filtroCuadratura]);

  // ── Selección de día ───────────────────────────────────────────────────────

  const seleccionarDia = async (fecha: string) => {
    if (!fechasConTurno.has(fecha)) return;
    if (fecha === diaSeleccionado) {
      setDiaSeleccionado(null);
      return;
    }
    setDiaSeleccionado(fecha);
    setLoadingDia(true);
    const ids = turnos.filter((t) => t.fecha_dlitro === fecha).map((t) => t.id);
    if (ids.length) {
      const { data } = await supabase
        .from("pagos_turno")
        .select("id,turno_id,metodo,monto")
        .in("turno_id", ids);
      const map: Record<string, PagoTurno[]> = {};
      ((data as PagoTurno[]) ?? []).forEach((p) => {
        if (!map[p.turno_id]) map[p.turno_id] = [];
        map[p.turno_id].push(p);
      });
      setPagosPorTurno(map);
    }
    setLoadingDia(false);
  };

  // ── Apertura de detalle ────────────────────────────────────────────────────

  const abrirDetalle = async (turno: TurnoResumen) => {
    setTurnoDetalle(turno);
    setComentarioDraft(turno.comentario_contador ?? "");
    setDetalle(null);
    setLoadingDetalle(true);

    const [pgR, gtR, pedR, dpR] = await Promise.all([
      supabase.from("pagos_turno").select("id,turno_id,metodo,monto").eq("turno_id", turno.id),
      supabase.from("gastos_turno").select("id,concepto,monto,metodo").eq("turno_id", turno.id).order("created_at"),
      supabase.from("pedidos").select(`
        id,
        numero_pedido,
        cliente_nombre,
        cliente_telefono,
        tipo,
        estado,
        metodo_pago,
        subtotal,
        descuento,
        costo_despacho,
        total,
        monto_recibido,
        vuelto,
        pago_registrado,
        origen,
        direccion_entrega,
        referencia_entrega,
        notas,
        hora_agendada,
        jarros_entregados,
        created_at,
        usuarios:despachador_id(nombre, apellido, nombre_completo),
        pedido_items(
          cantidad,
          precio_unitario,
          descuento_item,
          subtotal,
          notas,
          producto:producto_id(nombre)
        )
      `).eq("turno_id", turno.id).order("numero_pedido"),
      supabase.from("pago_despachadores")
        .select("id,despachador_id,pedidos_entregados,horas_trabajadas,base_por_horas,bono,total_a_pagar,usuarios(nombre_completo,nombre,apellido)")
        .eq("turno_id", turno.id),
    ]);

    const despachadorRows = (dpR.data ?? []) as unknown as PagoDespQueryRow[];
    const desps: PagoDesp[] = despachadorRows.map((d) => ({
      id: d.id,
      despachador_nombre:
        d.usuarios?.nombre_completo ||
        `${d.usuarios?.nombre ?? ""} ${d.usuarios?.apellido ?? ""}`.trim() ||
        "—",
      pedidos_entregados: d.pedidos_entregados,
      horas_trabajadas: d.horas_trabajadas,
      base_por_horas: d.base_por_horas,
      bono: d.bono,
      total_a_pagar: d.total_a_pagar,
    }));

    setDetalle({
      pagos: (pgR.data as PagoTurno[]) ?? [],
      gastos: (gtR.data as GastoTurno[]) ?? [],
      // Supabase no puede inferir con precisión este alias relacional; el
      // contrato se valida en el límite de la consulta y se consume tipado aquí.
      pedidos: (pedR.data as unknown as PedidoRow[]) ?? [],
      despachadores: desps,
    });
    setLoadingDetalle(false);
  };

  // ── Cambio de estado de cuadratura ────────────────────────────────────────

  const cambiarCuadratura = async (nuevoEstado: EstadoCuadratura) => {
    if (!turnoDetalle || !esContador) return;
    setGuardandoCuadratura(true);
    const { error } = await supabase
      .from("turnos")
      .update({ estado_cuadratura: nuevoEstado })
      .eq("id", turnoDetalle.id);
    if (error) {
      toast.error("Error al actualizar estado: " + error.message);
    } else {
      // Actualizar el turno en el estado local (lista de turnos del mes)
      setTurnos((prev) =>
        prev.map((t) => t.id === turnoDetalle.id ? { ...t, estado_cuadratura: nuevoEstado } : t)
      );
      // Actualizar el turno actualmente abierto en el dialog
      setTurnoDetalle((prev) => prev ? { ...prev, estado_cuadratura: nuevoEstado } : prev);
      toast.success(`Estado actualizado: ${CUADRATURA_CONFIG[nuevoEstado].label}`);
    }
    setGuardandoCuadratura(false);
  };

  const guardarNotaContador = async () => {
    if (!turnoDetalle || !perfil?.id || !puedeEditarNota) return;
    setGuardandoNota(true);
    const texto = comentarioDraft.trim() || null;
    const fechaIso = new Date().toISOString();
    const { error } = await supabase
      .from("turnos")
      .update({
        comentario_contador: texto,
        comentario_contador_usuario_id: texto ? perfil.id : null,
        comentario_contador_fecha: texto ? fechaIso : null,
      })
      .eq("id", turnoDetalle.id);

    if (error) {
      toast.error("Error al guardar nota: " + error.message);
      setGuardandoNota(false);
      return;
    }

    const autorNombre = perfil.nombre_completo || perfil.nombre || "Contador";
    const patch: Partial<TurnoResumen> = {
      comentario_contador: texto,
      comentario_contador_usuario_id: texto ? perfil.id : null,
      comentario_contador_fecha: texto ? fechaIso : null,
      comentario_autor_nombre: texto ? autorNombre : null,
    };
    setTurnos((prev) => prev.map((t) => (t.id === turnoDetalle.id ? { ...t, ...patch } : t)));
    setTurnoDetalle((prev) => (prev ? { ...prev, ...patch } : prev));
    setComentarioDraft(texto ?? "");
    toast.success(texto ? "Nota guardada" : "Nota eliminada");
    setGuardandoNota(false);
  };

  const turnosDia = useMemo(
    () => (diaSeleccionado ? turnos.filter((t) => t.fecha_dlitro === diaSeleccionado) : []),
    [diaSeleccionado, turnos]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-4xl text-foreground tracking-wide">Caja por día</h1>
          <p className="text-sm text-muted-foreground">Revisión de cierres de turno por sucursal</p>
        </div>
        <Button onClick={abrirExport} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      <Dialog open={exportOpen} onOpenChange={(o) => !exportando && setExportOpen(o)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>📥 Exportar Excel</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fecha inicio</Label>
              <Input
                type="date"
                value={exportFechaInicio}
                onChange={(e) => setExportFechaInicio(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Fecha fin</Label>
              <Input
                type="date"
                value={exportFechaFin}
                onChange={(e) => setExportFechaFin(e.target.value)}
                className="bg-background"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Sucursal</Label>
              <Select value={exportSucursalId} onValueChange={setExportSucursalId}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Todas</SelectItem>
                  {exportSucursales.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Genera hojas «Resumen Diario» y «Comunas» con el formato contable dlitro.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setExportOpen(false)} disabled={exportando}>
              Cancelar
            </Button>
            <Button onClick={confirmarExport} disabled={exportando}>
              {exportando ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
              Descargar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Calendario ───────────────────────────────────────────────────── */}
      <div className="bg-card border border-border rounded-xl p-5">
        {/* Navegación mes */}
        <div className="flex items-center justify-between mb-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="font-display text-xl capitalize">
            {mes.toLocaleDateString("es-CL", { month: "long", year: "numeric" })}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setMes((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* ── Filtros de cuadratura ─────────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 mb-5">
          {FILTRO_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFiltroCuadratura(opt.value)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all",
                filtroCuadratura === opt.value
                  ? opt.value === "todos"
                    ? "bg-primary text-primary-foreground border-primary"
                    : cn(CUADRATURA_CONFIG[opt.value as EstadoCuadratura].className, "border-current")
                  : "bg-secondary/40 text-muted-foreground border-border hover:bg-secondary/80"
              )}
            >
              {opt.dotColor && (
                <span className={cn("h-2 w-2 rounded-full", opt.dotColor)} />
              )}
              {opt.label}
            </button>
          ))}
        </div>

        {loadingMes ? (
          <div className="flex items-center justify-center py-20 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando turnos…</span>
          </div>
        ) : (
          <CalendarioGrid
            mes={mes}
            hoy={hoy}
            turnos={turnos}
            filtroCuadratura={filtroCuadratura}
            fechasConTurno={fechasConTurno}
            diaSeleccionado={diaSeleccionado}
            onSelect={seleccionarDia}
          />
        )}
      </div>

      {/* ── Panel de sucursales del día ───────────────────────────────────── */}
      {diaSeleccionado && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-2xl capitalize">
              {fechaDisplay(diaSeleccionado)}
            </h2>
            <Button variant="ghost" size="sm" onClick={() => setDiaSeleccionado(null)}>
              <X className="h-4 w-4 mr-1" /> Cerrar
            </Button>
          </div>

          {loadingDia ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando sucursales…
            </div>
          ) : turnosDia.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">No hay turnos cerrados para este día.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {turnosDia.map((turno) => {
                const pagos = pagosPorTurno[turno.id] ?? [];
                const totalIngr = pagos.reduce((s, p) => s + p.monto, 0);
                const cuadro =
                  turno.diferencia_caja === null || turno.diferencia_caja === 0;
                const cuadraturaConf = CUADRATURA_CONFIG[turno.estado_cuadratura];
                return (
                  <button
                    key={turno.id}
                    onClick={() => abrirDetalle(turno)}
                    className={cn(
                      "text-left rounded-xl border bg-card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all",
                      cuadro ? "border-success/40" : "border-destructive/40"
                    )}
                  >
                    <div className="flex items-start justify-between mb-3 gap-2">
                      <div className="min-w-0 flex items-start gap-1.5">
                        <h3 className="font-semibold text-lg leading-tight">{turno.sucursal_nombre}</h3>
                        {!!turno.comentario_contador?.trim() && (
                          <span title="Tiene nota del contador" className="text-sm leading-none mt-1 shrink-0">
                            📝
                          </span>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0">
                        {/* Badge cuadre de caja */}
                        <span
                          className={cn(
                            "flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                            cuadro
                              ? "bg-success/10 text-success border-success/30"
                              : "bg-destructive/10 text-destructive border-destructive/30"
                          )}
                        >
                          {cuadro ? (
                            <><CheckCircle2 className="h-3 w-3" /> Cuadró</>
                          ) : (
                            <><AlertTriangle className="h-3 w-3" /> Descuadre</>
                          )}
                        </span>
                        {/* Badge estado cuadratura (solo contador) */}
                        {esContador && (
                          <span
                            className={cn(
                              "flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wider",
                              cuadraturaConf.className
                            )}
                          >
                            {cuadraturaConf.icon}
                            {cuadraturaConf.label}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Total ingresos</span>
                        <span className="font-mono font-semibold">{fmtCLP(totalIngr)}</span>
                      </div>
                      {!cuadro && turno.diferencia_caja !== null && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Diferencia caja</span>
                          <span className={cn("font-mono font-semibold", turno.diferencia_caja !== 0 ? "text-destructive" : "text-success")}>
                            {turno.diferencia_caja > 0 ? "+" : ""}{fmtCLP(turno.diferencia_caja)}
                          </span>
                        </div>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-3 uppercase tracking-wider">
                      Ver detalle completo →
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Dialog detalle ────────────────────────────────────────────────── */}
      <Dialog open={!!turnoDetalle} onOpenChange={(v) => !v && setTurnoDetalle(null)}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0 bg-background">
          <DialogHeader className="px-6 pt-5 pb-4 border-b border-border shrink-0">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <DialogTitle className="font-display text-2xl tracking-wide">
                  {turnoDetalle?.sucursal_nombre}
                  {!!turnoDetalle?.comentario_contador?.trim() && (
                    <span className="ml-2 text-base" title="Tiene nota del contador">📝</span>
                  )}
                  <span className="ml-3 text-base font-normal text-muted-foreground capitalize">
                    {turnoDetalle?.fecha_dlitro ? fechaDisplay(turnoDetalle.fecha_dlitro) : ""}
                  </span>
                </DialogTitle>
              </div>
              {/* Selector de estado de cuadratura — solo visible para contador */}
              {esContador && turnoDetalle && (
                <div className="shrink-0 flex items-center gap-3">
                  <span
                    className={cn(
                      "flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border",
                      CUADRATURA_CONFIG[turnoDetalle.estado_cuadratura].className
                    )}
                  >
                    {CUADRATURA_CONFIG[turnoDetalle.estado_cuadratura].icon}
                    {CUADRATURA_CONFIG[turnoDetalle.estado_cuadratura].label}
                  </span>
                  <Select
                    value={turnoDetalle.estado_cuadratura}
                    onValueChange={(v) => cambiarCuadratura(v as EstadoCuadratura)}
                    disabled={guardandoCuadratura}
                  >
                    <SelectTrigger className="h-8 text-xs w-40">
                      {guardandoCuadratura
                        ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Guardando…</span>
                        : <SelectValue />
                      }
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="por_revisar" className="text-xs">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-warning inline-block" />
                          Por revisar
                        </span>
                      </SelectItem>
                      <SelectItem value="revisado" className="text-xs">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-success inline-block" />
                          Revisado
                        </span>
                      </SelectItem>
                      <SelectItem value="descuadrado" className="text-xs">
                        <span className="flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
                          Descuadrado
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </DialogHeader>

          {loadingDetalle ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Cargando detalle…</span>
            </div>
          ) : detalle && turnoDetalle ? (
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              <Tabs defaultValue="caja" className="flex-1 flex flex-col overflow-hidden min-h-0">
                <TabsList className="mx-6 mt-4 shrink-0 w-fit">
                  <TabsTrigger value="caja">Resumen de caja</TabsTrigger>
                  <TabsTrigger value="pedidos">
                    Pedidos{" "}
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                      {detalle.pedidos.length}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger value="despachadores">
                    Despachadores{" "}
                    <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
                      {detalle.despachadores.length}
                    </Badge>
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="caja" className="flex-1 overflow-y-auto px-6 pb-4 mt-4">
                  <ResumenCaja turno={turnoDetalle} pagos={detalle.pagos} gastos={detalle.gastos} despachadores={detalle.despachadores} />
                </TabsContent>
                <TabsContent value="pedidos" className="flex-1 overflow-y-auto px-6 pb-4 mt-4">
                  <DetallePedidos pedidos={detalle.pedidos} pagos={detalle.pagos} />
                </TabsContent>
                <TabsContent value="despachadores" className="flex-1 overflow-y-auto px-6 pb-4 mt-4">
                  <PagoDespachadores despachadores={detalle.despachadores} />
                </TabsContent>
              </Tabs>

              <div className="shrink-0 border-t border-border px-6 py-4 bg-card/50 space-y-3">
                <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                  📝 Notas del contador
                </h3>
                <Textarea
                  value={comentarioDraft}
                  onChange={(e) => setComentarioDraft(e.target.value)}
                  placeholder="Escribe una nota o comentario…"
                  rows={3}
                  maxLength={2000}
                  disabled={!puedeEditarNota || guardandoNota}
                  className="bg-background resize-none"
                />
                {(turnoDetalle.comentario_autor_nombre || turnoDetalle.comentario_contador_fecha) && (
                  <p className="text-[11px] text-muted-foreground">
                    Última edición:{" "}
                    {[turnoDetalle.comentario_autor_nombre, fmtFechaComentario(turnoDetalle.comentario_contador_fecha)]
                      .filter(Boolean)
                      .join(" — ")}
                  </p>
                )}
                {puedeEditarNota ? (
                  <Button
                    type="button"
                    size="sm"
                    onClick={guardarNotaContador}
                    disabled={guardandoNota || comentarioDraft === (turnoDetalle.comentario_contador ?? "")}
                  >
                    {guardandoNota ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    ) : (
                      <Save className="h-3.5 w-3.5 mr-1.5" />
                    )}
                    Guardar nota
                  </Button>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Solo lectura — editable por contador o superadmin.</p>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Calendario grid ───────────────────────────────────────────────────────────

function CalendarioGrid({
  mes,
  hoy,
  turnos,
  filtroCuadratura,
  fechasConTurno,
  diaSeleccionado,
  onSelect,
}: {
  mes: Date;
  hoy: Date;
  turnos: TurnoResumen[];
  filtroCuadratura: EstadoCuadratura | "todos";
  fechasConTurno: Set<string>;
  diaSeleccionado: string | null;
  onSelect: (fecha: string) => void;
}) {
  const year = mes.getFullYear();
  const month = mes.getMonth();
  const totalDias = new Date(year, month + 1, 0).getDate();
  // Día de la semana del 1ero (0=Lun…6=Dom)
  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const hoyStr = isoFecha(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());

  // Dot de color según el estado de cuadratura de peor prioridad del día
  // (descuadrado > por_revisar > revisado). Solo aplica cuando filtro = "todos".
  const dotColorPorFecha = useMemo(() => {
    if (filtroCuadratura !== "todos") return new Map<string, string>();
    const prioridad: Record<EstadoCuadratura, number> = { descuadrado: 3, por_revisar: 2, revisado: 1 };
    const map = new Map<string, EstadoCuadratura>();
    turnos.forEach((t) => {
      const actual = map.get(t.fecha_dlitro);
      if (!actual || prioridad[t.estado_cuadratura] > prioridad[actual]) {
        map.set(t.fecha_dlitro, t.estado_cuadratura);
      }
    });
    const colorMap = new Map<string, string>();
    map.forEach((estado, fecha) => colorMap.set(fecha, CUADRATURA_CONFIG[estado].dotColor));
    return colorMap;
  }, [turnos, filtroCuadratura]);

  // Construir arreglo: null = celda vacía, number = día
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: totalDias }, (_, i) => i + 1),
  ];
  // Completar a múltiplo de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const fechasConNota = useMemo(() => {
    return new Set(
      turnos
        .filter((t) => !!t.comentario_contador?.trim())
        .map((t) => t.fecha_dlitro),
    );
  }, [turnos]);

  return (
    <div className="space-y-1">
      {/* Cabecera días semana */}
      <div className="grid grid-cols-7">
        {DIAS.map((d) => (
          <div key={d} className="text-center py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Celdas */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((dia, idx) => {
          if (!dia) return <div key={`empty-${idx}`} />;
          const fecha = isoFecha(year, month, dia);
          const tieneTurno = fechasConTurno.has(fecha);
          const tieneNota = fechasConNota.has(fecha);
          const seleccionado = fecha === diaSeleccionado;
          const esHoy = fecha === hoyStr;
          const dotColor = filtroCuadratura === "todos"
            ? (dotColorPorFecha.get(fecha) ?? "bg-success")
            : CUADRATURA_CONFIG[filtroCuadratura].dotColor;

          return (
            <button
              key={fecha}
              onClick={() => tieneTurno && onSelect(fecha)}
              disabled={!tieneTurno}
              className={cn(
                "relative flex flex-col items-center justify-center rounded-lg aspect-square text-sm font-medium transition-all",
                seleccionado
                  ? "bg-primary text-primary-foreground shadow-md"
                  : tieneTurno
                    ? "bg-success/10 text-foreground hover:bg-success/20 cursor-pointer"
                    : "text-muted-foreground/50 cursor-default",
                esHoy && !seleccionado && "ring-2 ring-primary/40"
              )}
            >
              {dia}
              {tieneNota && (
                <span className="absolute top-0.5 right-0.5 text-[9px] leading-none" title="Hay nota del contador">
                  📝
                </span>
              )}
              {tieneTurno && (
                <span
                  className={cn(
                    "absolute bottom-1 left-1/2 -translate-x-1/2 h-1 w-1 rounded-full",
                    seleccionado ? "bg-primary-foreground/70" : dotColor
                  )}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 pt-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-warning inline-block" />
          Por revisar
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-success inline-block" />
          Revisado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
          Descuadrado
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm ring-2 ring-primary/40 inline-block" />
          Hoy
        </span>
      </div>
    </div>
  );
}

// ── Tab: Resumen de caja ──────────────────────────────────────────────────────

function ResumenCaja({
  turno,
  pagos,
  gastos,
  despachadores,
}: {
  turno: TurnoResumen;
  pagos: PagoTurno[];
  gastos: GastoTurno[];
  despachadores: PagoDesp[];
}) {
  const pagosPorMetodo = useMemo(() => {
    const map: Record<string, number> = {};
    pagos.forEach((p) => {
      map[p.metodo] = (map[p.metodo] ?? 0) + p.monto;
    });
    return map;
  }, [pagos]);

  const cuadreSistema = useMemo(() => {
    const esIngresoCaja = (c: string) => c.startsWith("Ingreso caja chica");
    const totalEfectivoVentas = pagos.filter((p) => p.metodo === "efectivo").reduce((a, p) => a + p.monto, 0);
    const totalGastosEfectivo = gastos
      .filter((g) => g.metodo === "efectivo" && !esIngresoCaja(g.concepto))
      .reduce((a, g) => a + g.monto, 0);
    const totalPagoDesp = despachadores.reduce((a, p) => a + (p.total_a_pagar > 0 ? p.total_a_pagar : 0), 0);
    const cajaChicaInicial = turno.caja_chica_apertura;
    const efectivoGanancias = totalEfectivoVentas - totalGastosEfectivo - totalPagoDesp;
    const cajaChicaFinal = efectivoGanancias >= 0 ? cajaChicaInicial : cajaChicaInicial + efectivoGanancias;
    const sobreEsperado = efectivoGanancias > 0 ? efectivoGanancias : 0;
    const totalEnCaja = efectivoGanancias >= 0 ? cajaChicaFinal + efectivoGanancias : cajaChicaFinal;
    return { cajaChicaFinal, sobreEsperado, efectivoGanancias, totalEnCaja };
  }, [pagos, gastos, despachadores, turno.caja_chica_apertura]);

  const totalIngresos = pagos.reduce((s, p) => s + p.monto, 0);
  const totalGastos = gastos.reduce((s, g) => s + g.monto, 0);
  const cajaNeta = totalIngresos - totalGastos;

  const esLegacy =
    (turno.efectivo_declarado_caja_chica ?? 0) === 0
    && (turno.efectivo_declarado_sobre ?? 0) === 0
    && turno.efectivo_declarado != null
    && turno.efectivo_declarado > 0;

  const declaradoCaja = esLegacy ? turno.efectivo_declarado! : (turno.efectivo_declarado_caja_chica ?? 0);
  const declaradoSobre = turno.efectivo_declarado_sobre ?? 0;
  const diffCaja = declaradoCaja - cuadreSistema.cajaChicaFinal;
  const diffSobre = cuadreSistema.sobreEsperado > 0 ? declaradoSobre - cuadreSistema.sobreEsperado : 0;
  const diferenciaTotal = turno.efectivo_sistema != null && turno.efectivo_declarado != null
    ? turno.efectivo_declarado - turno.efectivo_sistema
    : null;
  const hayDescuadre = diferenciaTotal !== null && Math.abs(diferenciaTotal) > 500;

  return (
    <div className="space-y-6">
      {/* Ingresos por método */}
      <div>
        <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-3">
          Ingresos por método de pago
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border">
              <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                <th className="px-4 py-2.5">Método</th>
                <th className="px-4 py-2.5 text-right">Monto</th>
                <th className="px-4 py-2.5 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(pagosPorMetodo).length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin pagos registrados</td>
                </tr>
              ) : (
                Object.entries(pagosPorMetodo).map(([metodo, monto]) => (
                  <tr key={metodo} className="border-t border-border">
                    <td className="px-4 py-2.5">
                      <span className={cn("inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded border", METODO_BADGE[metodo] ?? "bg-muted text-foreground border-border")}>
                        {METODO_LABEL[metodo] ?? metodo}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold">{fmtCLP(monto)}</td>
                    <td className="px-4 py-2.5 text-right text-muted-foreground font-mono text-xs">
                      {totalIngresos > 0 ? `${((monto / totalIngresos) * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))
              )}
              <tr className="border-t-2 border-border bg-secondary/30">
                <td className="px-4 py-2.5 font-semibold">Total ingresos</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-success">{fmtCLP(totalIngresos)}</td>
                <td className="px-4 py-2.5 text-right text-muted-foreground">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Gastos */}
      <div>
        <h3 className="text-xs uppercase font-semibold tracking-wider text-muted-foreground mb-3">
          Gastos del turno
        </h3>
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border">
              <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                <th className="px-4 py-2.5">Concepto</th>
                <th className="px-4 py-2.5">Método</th>
                <th className="px-4 py-2.5 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {gastos.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground text-sm">Sin gastos registrados</td>
                </tr>
              ) : (
                gastos.map((g) => (
                  <tr key={g.id} className="border-t border-border">
                    <td className="px-4 py-2.5">{g.concepto}</td>
                    <td className="px-4 py-2.5 text-muted-foreground text-xs">{g.metodo ? (METODO_LABEL[g.metodo] ?? g.metodo) : "—"}</td>
                    <td className="px-4 py-2.5 text-right font-mono font-semibold text-destructive">−{fmtCLP(g.monto)}</td>
                  </tr>
                ))
              )}
              <tr className="border-t-2 border-border bg-secondary/30">
                <td colSpan={2} className="px-4 py-2.5 font-semibold">Total gastos</td>
                <td className="px-4 py-2.5 text-right font-mono font-bold text-destructive">−{fmtCLP(totalGastos)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Resumen neto y cuadre */}
      <div className="space-y-4">
        <div className={cn(
          "rounded-xl border p-5 max-w-md",
          cajaNeta >= 0 ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
        )}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
            Caja neta (Ingresos − Gastos)
          </p>
          <p className={cn("font-display text-3xl font-bold", cajaNeta >= 0 ? "text-success" : "text-destructive")}>
            {cajaNeta >= 0 ? <TrendingUp className="h-5 w-5 inline mr-1" /> : <TrendingDown className="h-5 w-5 inline mr-1" />}
            {fmtCLP(cajaNeta)}
          </p>
        </div>

        {/* Cuadre de caja — desglose caja chica / sobre */}
        <div className={cn(
          "rounded-xl border p-5",
          !hayDescuadre ? "border-success/30 bg-success/5" : "border-destructive/30 bg-destructive/5"
        )}>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4 font-semibold">
            Cuadre de efectivo — caja chica y sobre
          </p>

          {esLegacy ? (
            <div className="space-y-1 text-sm mb-4">
              <p className="text-xs text-muted-foreground mb-2">Turno cerrado antes del desglose (total combinado)</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Sistema (total)</span>
                <span className="font-mono">{turno.efectivo_sistema != null ? fmtCLP(turno.efectivo_sistema) : "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Declarado (total)</span>
                <span className="font-mono">{fmtCLP(turno.efectivo_declarado!)}</span>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="rounded-lg border border-border bg-background/60 p-4 space-y-2">
                <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Caja chica</p>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Sistema espera</span>
                  <span className="font-mono">{fmtCLP(cuadreSistema.cajaChicaFinal)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Declarado</span>
                  <span className="font-mono">{fmtCLP(declaradoCaja)}</span>
                </div>
                <div className={cn("flex justify-between text-sm font-semibold pt-1 border-t border-border", diffCaja === 0 ? "text-success" : "text-destructive")}>
                  <span>Diferencia</span>
                  <span className="font-mono">{diffCaja > 0 ? `+${fmtCLP(diffCaja)}` : fmtCLP(diffCaja)}</span>
                </div>
              </div>

              {cuadreSistema.sobreEsperado > 0 ? (
                <div className="rounded-lg border border-border bg-background/60 p-4 space-y-2">
                  <p className="text-xs uppercase tracking-wider font-semibold text-muted-foreground">Sobre de ganancias</p>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Sistema espera</span>
                    <span className="font-mono">{fmtCLP(cuadreSistema.sobreEsperado)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Declarado</span>
                    <span className="font-mono">{fmtCLP(declaradoSobre)}</span>
                  </div>
                  <div className={cn("flex justify-between text-sm font-semibold pt-1 border-t border-border", diffSobre === 0 ? "text-success" : "text-destructive")}>
                    <span>Diferencia</span>
                    <span className="font-mono">{diffSobre > 0 ? `+${fmtCLP(diffSobre)}` : fmtCLP(diffSobre)}</span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-background/60 p-4 flex items-center justify-center text-sm text-muted-foreground">
                  Sin ganancias en sobre{cuadreSistema.efectivoGanancias < 0 ? " — egresos descontados de caja chica" : ""}
                </div>
              )}
            </div>
          )}

          <div className={cn("flex justify-between pt-3 border-t border-border font-semibold text-base", hayDescuadre ? "text-destructive" : "text-success")}>
            <span>Diferencia total</span>
            <span className="font-mono">
              {diferenciaTotal !== null
                ? `${diferenciaTotal > 0 ? "+" : ""}${fmtCLP(diferenciaTotal)}`
                : "—"}
            </span>
          </div>
          {hayDescuadre && turno.observacion_descuadre && (
            <div className="mt-3 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2 text-xs text-destructive">
              <span className="font-semibold">Observación:</span> {turno.observacion_descuadre}
            </div>
          )}
          {!hayDescuadre && diferenciaTotal !== null && (
            <div className="flex items-center gap-1.5 mt-3 text-success text-xs font-semibold">
              <CheckCircle2 className="h-3.5 w-3.5" /> Caja cuadra
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tab: Detalle de pedidos ───────────────────────────────────────────────────

function DetallePedidos({ pedidos, pagos }: { pedidos: PedidoRow[]; pagos: PagoTurno[] }) {
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");
  const [filtroMetodo, setFiltroMetodo] = useState("todos");
  const [expandido, setExpandido] = useState<string | null>(null);

  const estados = useMemo(() => ["todos", ...new Set(pedidos.map((p) => p.estado))], [pedidos]);
  const tipos = useMemo(() => ["todos", ...new Set(pedidos.map((p) => p.tipo))], [pedidos]);
  const metodos = useMemo(
    () => ["todos", ...new Set(pedidos.map((p) => p.metodo_pago).filter(Boolean) as string[])],
    [pedidos],
  );

  const filtrados = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          (filtroEstado === "todos" || p.estado === filtroEstado) &&
          (filtroTipo === "todos" || p.tipo === filtroTipo) &&
          (filtroMetodo === "todos" || p.metodo_pago === filtroMetodo),
      ),
    [pedidos, filtroEstado, filtroTipo, filtroMetodo],
  );

  const resumen = useMemo(() => {
    const entregados = filtrados.filter((p) => p.estado === "entregado").length;
    const cancelados = filtrados.filter((p) => p.estado === "cancelado").length;
    const pendientes = filtrados.length - entregados - cancelados;
    return { entregados, cancelados, pendientes };
  }, [filtrados]);

  const ingresos = useMemo(() => {
    let efectivo = 0;
    let transferencia = 0;
    let tarjeta = 0;
    for (const p of pagos) {
      const m = Number(p.monto) || 0;
      if (p.metodo === "efectivo") efectivo += m;
      else if (p.metodo === "transferencia") transferencia += m;
      else if (p.metodo === "tarjeta") tarjeta += m;
    }
    return {
      efectivo,
      transferencia,
      tarjeta,
      total: efectivo + transferencia + tarjeta,
    };
  }, [pagos]);

  const exportarCsv = () => {
    const headers = [
      "#", "Cliente", "Teléfono", "Tipo", "Despachador", "Estado", "Método Pago",
      "Subtotal", "Descuento", "Costo Despacho", "Total", "Monto Recibido", "Vuelto",
      "Pagado", "Origen", "Hora", "Dirección", "Referencia", "Notas", "Jarros", "Productos",
    ];
    const rows = filtrados.map((p) => {
      const vuelto = vueltoPedido(p);
      const items = (p.pedido_items ?? []).map(labelItemPedido).join(" | ");
      return [
        p.numero_pedido ?? "",
        p.cliente_nombre,
        p.cliente_telefono ?? "",
        tipoMeta(p.tipo).label,
        nombreDespachador(p),
        ESTADO_PEDIDO_LABEL[p.estado] ?? p.estado,
        p.metodo_pago ? (METODO_LABEL[p.metodo_pago] ?? p.metodo_pago) : "",
        p.subtotal ?? 0,
        p.descuento ?? 0,
        p.costo_despacho ?? 0,
        p.total ?? 0,
        p.monto_recibido ?? "",
        vuelto ?? "",
        p.pago_registrado ? "Sí" : "No",
        p.origen ?? "",
        fmtHoraPedido(p),
        p.direccion_entrega ?? "",
        p.referencia_entrega ?? "",
        p.notas ?? "",
        p.jarros_entregados ?? "",
        items,
      ].map(escaparCsv).join(",");
    });
    const csv = "\uFEFF" + [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pedidos-turno-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportado — abrilo en Excel");
  };

  const colSpan = 17;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Estado:</span>
          <Select value={filtroEstado} onValueChange={setFiltroEstado}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {estados.map((e) => (
                <SelectItem key={e} value={e} className="text-xs">
                  {e === "todos" ? "Todos" : (ESTADO_PEDIDO_LABEL[e] ?? e)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Tipo:</span>
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-8 text-xs w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tipos.map((t) => (
                <SelectItem key={t} value={t} className="text-xs">
                  {t === "todos" ? "Todos" : tipoMeta(t).label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">Pago:</span>
          <Select value={filtroMetodo} onValueChange={setFiltroMetodo}>
            <SelectTrigger className="h-8 text-xs w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {metodos.map((m) => (
                <SelectItem key={m} value={m} className="text-xs">
                  {m === "todos" ? "Todos" : (METODO_LABEL[m] ?? m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="ml-auto h-8 text-xs uppercase tracking-wider font-bold"
          onClick={exportarCsv}
          disabled={filtrados.length === 0}
        >
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Exportar
        </Button>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto">
        <table className="w-full text-sm min-w-[1400px]">
          <thead className="bg-secondary/40 border-b border-border">
            <tr className="text-left text-muted-foreground uppercase text-[10px] tracking-wider">
              <th className="px-2 py-2.5 w-8" />
              <th className="px-2 py-2.5">#</th>
              <th className="px-2 py-2.5">Cliente</th>
              <th className="px-2 py-2.5">Teléfono</th>
              <th className="px-2 py-2.5">Tipo</th>
              <th className="px-2 py-2.5">Despachador</th>
              <th className="px-2 py-2.5">Estado</th>
              <th className="px-2 py-2.5">Método Pago</th>
              <th className="px-2 py-2.5 text-right">Subtotal</th>
              <th className="px-2 py-2.5 text-right">Descuento</th>
              <th className="px-2 py-2.5 text-right">Costo Despacho</th>
              <th className="px-2 py-2.5 text-right">Total</th>
              <th className="px-2 py-2.5 text-right">Monto Recibido</th>
              <th className="px-2 py-2.5 text-right">Vuelto</th>
              <th className="px-2 py-2.5">Pagado</th>
              <th className="px-2 py-2.5">Origen</th>
              <th className="px-2 py-2.5">Hora</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Sin pedidos con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filtrados.map((p) => {
                const abierto = expandido === p.id;
                const vuelto = vueltoPedido(p);
                return (
                  <Fragment key={p.id}>
                    <tr
                      className="border-t border-border hover:bg-secondary/20 cursor-pointer"
                      onClick={() => setExpandido(abierto ? null : p.id)}
                    >
                      <td className="px-2 py-2 text-muted-foreground">
                        <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} />
                      </td>
                      <td className="px-2 py-2 font-mono text-muted-foreground">#{p.numero_pedido ?? "—"}</td>
                      <td className="px-2 py-2 font-medium whitespace-nowrap">{p.cliente_nombre}</td>
                      <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">{p.cliente_telefono || "—"}</td>
                      <td className="px-2 py-2 whitespace-nowrap">{tipoMeta(p.tipo).label}</td>
                      <td className="px-2 py-2 whitespace-nowrap text-muted-foreground">{nombreDespachador(p)}</td>
                      <td className="px-2 py-2">
                        <span className={cn(
                          "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                          p.estado === "entregado" ? "bg-success/10 text-success" :
                          p.estado === "cancelado" ? "bg-destructive/10 text-destructive" :
                          "bg-muted text-muted-foreground",
                        )}>
                          {ESTADO_PEDIDO_LABEL[p.estado] ?? p.estado}
                        </span>
                      </td>
                      <td className="px-2 py-2">
                        {p.metodo_pago ? (
                          <span className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider",
                            METODO_BADGE[p.metodo_pago] ?? "bg-muted text-foreground border-border",
                          )}>
                            {METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}
                          </span>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">{fmtCLP(p.subtotal ?? 0)}</td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap text-muted-foreground">
                        {(p.descuento ?? 0) > 0 ? `-${fmtCLP(p.descuento ?? 0)}` : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                        {(p.costo_despacho ?? 0) > 0 ? fmtCLP(p.costo_despacho ?? 0) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-mono font-semibold whitespace-nowrap">{fmtCLP(p.total)}</td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                        {p.monto_recibido != null ? fmtCLP(p.monto_recibido) : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-mono whitespace-nowrap">
                        {vuelto != null ? fmtCLP(vuelto) : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {p.pago_registrado ? (
                          <span className="text-[10px] font-bold uppercase text-success">Sí</span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase text-muted-foreground">No</span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-xs capitalize whitespace-nowrap">{p.origen || "—"}</td>
                      <td className="px-2 py-2 font-mono text-xs whitespace-nowrap">{fmtHoraPedido(p)}</td>
                    </tr>
                    {abierto && (
                      <tr className="border-t border-border bg-secondary/15">
                        <td colSpan={colSpan} className="px-6 py-4">
                          <div className="grid gap-3 text-sm max-w-3xl">
                            <div>
                              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1.5">Productos</p>
                              <ul className="space-y-1">
                                {(p.pedido_items ?? []).length === 0 ? (
                                  <li className="text-muted-foreground">Sin ítems</li>
                                ) : (
                                  (p.pedido_items ?? []).map((it, idx) => (
                                    <li key={idx} className="font-mono text-xs">
                                      - {labelItemPedido(it)}
                                      {it.notas?.trim() && !esItemPromoJarros(it) ? (
                                        <span className="text-muted-foreground"> · {it.notas}</span>
                                      ) : null}
                                    </li>
                                  ))
                                )}
                              </ul>
                            </div>
                            {(p.direccion_entrega || p.referencia_entrega || p.notas || (p.jarros_entregados ?? 0) > 0) && (
                              <div className="space-y-1 text-xs border-t border-border pt-3">
                                {p.direccion_entrega && (
                                  <p><span className="text-muted-foreground">Dirección:</span> {p.direccion_entrega}</p>
                                )}
                                {p.referencia_entrega && (
                                  <p><span className="text-muted-foreground">Referencia:</span> {p.referencia_entrega}</p>
                                )}
                                {p.notas && (
                                  <p><span className="text-muted-foreground">Notas:</span> {p.notas}</p>
                                )}
                                {(p.jarros_entregados ?? 0) > 0 && (
                                  <p><span className="text-muted-foreground">Jarros entregados:</span> {p.jarros_entregados}</p>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {filtrados.length > 0 && (
        <div className="rounded-lg border border-border bg-secondary/20 px-4 py-3 font-mono text-xs space-y-1">
          <p>
            Total pedidos: {filtrados.length} | Entregados: {resumen.entregados} | Cancelados: {resumen.cancelados} | Pendientes: {resumen.pendientes}
          </p>
          <div className="pt-1 border-t border-border space-y-1">
            <p className="font-bold text-sm">Total ingresos: {fmtCLP(ingresos.total)}</p>
            <p className="pl-2 text-muted-foreground">Efectivo: {fmtCLP(ingresos.efectivo)}</p>
            <p className="pl-2 text-muted-foreground">Transferencia: {fmtCLP(ingresos.transferencia)}</p>
            <p className="pl-2 text-muted-foreground">Tarjeta: {fmtCLP(ingresos.tarjeta)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab: Pago a despachadores ─────────────────────────────────────────────────

function PagoDespachadores({ despachadores }: { despachadores: PagoDesp[] }) {
  const totalPagado = despachadores.reduce((s, d) => s + (d.total_a_pagar > 0 ? d.total_a_pagar : 0), 0);
  const sinPago = despachadores.filter((d) => !(d.total_a_pagar > 0)).length;

  if (despachadores.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground text-sm">
        No hay registro de pago a despachadores para este turno.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPI resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Despachadores</p>
          <p className="font-display text-2xl font-bold">{despachadores.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Total pagado</p>
          <p className="font-display text-2xl font-bold text-destructive">{fmtCLP(totalPagado)}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pedidos entregados</p>
          <p className="font-display text-2xl font-bold">
            {despachadores.reduce((s, d) => s + (d.pedidos_entregados ?? 0), 0)}
          </p>
        </div>
        {sinPago > 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning/10 p-4">
            <p className="text-xs uppercase tracking-wider text-warning mb-1">Sin pago</p>
            <p className="font-display text-2xl font-bold text-warning">{sinPago}</p>
          </div>
        )}
      </div>

      {/* Tabla */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 border-b border-border">
            <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
              <th className="px-4 py-2.5">Despachador</th>
              <th className="px-4 py-2.5 text-right">Pedidos</th>
              <th className="px-4 py-2.5 text-right">Horas</th>
              <th className="px-4 py-2.5 text-right">Base</th>
              <th className="px-4 py-2.5 text-right">Bono</th>
              <th className="px-4 py-2.5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {despachadores.map((d) => {
              const pendiente = !(d.total_a_pagar > 0);
              return (
                <tr
                  key={d.id}
                  className={cn(
                    "border-t border-border",
                    pendiente ? "bg-warning/5 hover:bg-warning/10" : "hover:bg-secondary/20",
                  )}
                >
                  <td className="px-4 py-3 font-medium">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span>{d.despachador_nombre}</span>
                      {pendiente && (
                        <span className="inline-flex items-center text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border border-warning/50 bg-warning/15 text-warning">
                          ⏳ Pago pendiente
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">{d.pedidos_entregados ?? "—"}</td>
                  <td className="px-4 py-3 text-right font-mono">
                    {d.horas_trabajadas != null ? `${d.horas_trabajadas.toFixed(1)} h` : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {d.base_por_horas != null ? fmtCLP(d.base_por_horas) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {d.bono ? fmtCLP(d.bono) : "—"}
                  </td>
                  <td className={cn(
                    "px-4 py-3 text-right font-mono font-bold",
                    pendiente ? "text-warning" : "",
                  )}>
                    {pendiente ? (
                      <span>{fmtCLP(0)} <span className="text-[10px] font-sans font-semibold uppercase tracking-wider">pendiente</span></span>
                    ) : (
                      fmtCLP(d.total_a_pagar)
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-secondary/30">
              <td colSpan={5} className="px-4 py-2.5 font-semibold">Total pagado a despachadores</td>
              <td className="px-4 py-2.5 text-right font-mono font-bold text-destructive">{fmtCLP(totalPagado)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
