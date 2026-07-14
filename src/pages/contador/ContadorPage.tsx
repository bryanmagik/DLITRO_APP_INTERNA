import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
  TrendingDown,
  TrendingUp,
  Clock,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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

interface PedidoRow {
  id: string;
  numero_pedido: number | null;
  cliente_nombre: string;
  tipo: string;
  metodo_pago: string | null;
  total: number;
  estado: string;
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

// ── Componente principal ──────────────────────────────────────────────────────

export default function ContadorPage() {
  const perfil = useAuthStore((s) => s.perfil);
  const esContador = perfil?.rol === "contador_rrhh";

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
        "id,sucursal_id,fecha_dlitro,caja_chica_apertura,diferencia_caja,efectivo_declarado,efectivo_declarado_caja_chica,efectivo_declarado_sobre,efectivo_sistema,observacion_descuadre,estado_cuadratura,sucursales(nombre)"
      )
      .eq("estado", "cerrado")
      .gte("fecha_dlitro", inicio)
      .lte("fecha_dlitro", fin)
      .order("fecha_dlitro")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .then(({ data }) => {
        const lista: TurnoResumen[] = ((data as any[]) ?? []).map((t) => ({
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
    setDetalle(null);
    setLoadingDetalle(true);

    const [pgR, gtR, pedR, dpR] = await Promise.all([
      supabase.from("pagos_turno").select("id,turno_id,metodo,monto").eq("turno_id", turno.id),
      supabase.from("gastos_turno").select("id,concepto,monto,metodo").eq("turno_id", turno.id).order("created_at"),
      supabase.from("pedidos").select("id,numero_pedido,cliente_nombre,tipo,metodo_pago,total,estado").eq("turno_id", turno.id).order("numero_pedido"),
      supabase.from("pago_despachadores")
        .select("id,despachador_id,pedidos_entregados,horas_trabajadas,base_por_horas,bono,total_a_pagar,usuarios(nombre_completo,nombre,apellido)")
        .eq("turno_id", turno.id),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const desps: PagoDesp[] = ((dpR.data as any[]) ?? []).map((d) => ({
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
      pedidos: (pedR.data as PedidoRow[]) ?? [],
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

  const turnosDia = useMemo(
    () => (diaSeleccionado ? turnos.filter((t) => t.fecha_dlitro === diaSeleccionado) : []),
    [diaSeleccionado, turnos]
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-4xl text-foreground tracking-wide">Caja por día</h1>
        <p className="text-sm text-muted-foreground">Revisión de cierres de turno por sucursal</p>
      </div>

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
                      <h3 className="font-semibold text-lg leading-tight">{turno.sucursal_nombre}</h3>
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
            <Tabs defaultValue="caja" className="flex-1 flex flex-col overflow-hidden">
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

              <TabsContent value="caja" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
                <ResumenCaja turno={turnoDetalle} pagos={detalle.pagos} gastos={detalle.gastos} despachadores={detalle.despachadores} />
              </TabsContent>
              <TabsContent value="pedidos" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
                <DetallePedidos pedidos={detalle.pedidos} />
              </TabsContent>
              <TabsContent value="despachadores" className="flex-1 overflow-y-auto px-6 pb-6 mt-4">
                <PagoDespachadores despachadores={detalle.despachadores} />
              </TabsContent>
            </Tabs>
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
          const seleccionado = fecha === diaSeleccionado;
          const esHoy = fecha === hoyStr;
          const dotColor = filtroCuadratura === "todos"
            ? (dotColorPorFecha.get(fecha) ?? "bg-success")
            : (filtroCuadratura !== "todos" ? CUADRATURA_CONFIG[filtroCuadratura].dotColor : "bg-success");

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
    const totalPagoDesp = despachadores.reduce((a, p) => a + p.total_a_pagar, 0);
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

function DetallePedidos({ pedidos }: { pedidos: PedidoRow[] }) {
  const [filtroEstado, setFiltroEstado] = useState("todos");
  const [filtroTipo, setFiltroTipo] = useState("todos");

  const estados = useMemo(() => ["todos", ...new Set(pedidos.map((p) => p.estado))], [pedidos]);
  const tipos = useMemo(() => ["todos", ...new Set(pedidos.map((p) => p.tipo))], [pedidos]);

  const filtrados = useMemo(
    () =>
      pedidos.filter(
        (p) =>
          (filtroEstado === "todos" || p.estado === filtroEstado) &&
          (filtroTipo === "todos" || p.tipo === filtroTipo)
      ),
    [pedidos, filtroEstado, filtroTipo]
  );

  const totalFiltrado = filtrados.reduce((s, p) => s + p.total, 0);
  const totalPedidos = filtrados.length;

  return (
    <div className="space-y-4">
      {/* Filtros */}
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
                <SelectItem key={t} value={t} className="text-xs capitalize">
                  {t === "todos" ? "Todos" : t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {totalPedidos} pedido{totalPedidos !== 1 ? "s" : ""} · Total {fmtCLP(totalFiltrado)}
        </span>
      </div>

      {/* Tabla */}
      <div className="border border-border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 border-b border-border">
            <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
              <th className="px-3 py-2.5 w-16">#</th>
              <th className="px-3 py-2.5">Cliente</th>
              <th className="px-3 py-2.5">Tipo</th>
              <th className="px-3 py-2.5">Método</th>
              <th className="px-3 py-2.5 text-right">Total</th>
              <th className="px-3 py-2.5">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-sm">
                  Sin pedidos con los filtros seleccionados.
                </td>
              </tr>
            ) : (
              filtrados.map((p) => (
                <tr key={p.id} className="border-t border-border hover:bg-secondary/20">
                  <td className="px-3 py-2 font-mono text-muted-foreground">#{p.numero_pedido ?? "—"}</td>
                  <td className="px-3 py-2 font-medium">{p.cliente_nombre}</td>
                  <td className="px-3 py-2 capitalize text-muted-foreground">{p.tipo}</td>
                  <td className="px-3 py-2">
                    {p.metodo_pago ? (
                      <span className={cn("text-[10px] font-semibold px-1.5 py-0.5 rounded border uppercase tracking-wider", METODO_BADGE[p.metodo_pago] ?? "bg-muted text-foreground border-border")}>
                        {METODO_LABEL[p.metodo_pago] ?? p.metodo_pago}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmtCLP(p.total)}</td>
                  <td className="px-3 py-2">
                    <span className={cn(
                      "text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded",
                      p.estado === "entregado" ? "bg-success/10 text-success" :
                      p.estado === "cancelado" ? "bg-destructive/10 text-destructive" :
                      "bg-muted text-muted-foreground"
                    )}>
                      {ESTADO_PEDIDO_LABEL[p.estado] ?? p.estado}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {filtrados.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border bg-secondary/30">
                <td colSpan={4} className="px-3 py-2.5 font-semibold text-sm">
                  Total ({totalPedidos} pedidos)
                </td>
                <td className="px-3 py-2.5 text-right font-mono font-bold">{fmtCLP(totalFiltrado)}</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ── Tab: Pago a despachadores ─────────────────────────────────────────────────

function PagoDespachadores({ despachadores }: { despachadores: PagoDesp[] }) {
  const totalPagado = despachadores.reduce((s, d) => s + d.total_a_pagar, 0);

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
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
            {despachadores.map((d) => (
              <tr key={d.id} className="border-t border-border hover:bg-secondary/20">
                <td className="px-4 py-3 font-medium">{d.despachador_nombre}</td>
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
                <td className="px-4 py-3 text-right font-mono font-bold">{fmtCLP(d.total_a_pagar)}</td>
              </tr>
            ))}
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
