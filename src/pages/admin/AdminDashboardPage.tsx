import { useCallback, useEffect, useMemo, useState, type ComponentType } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Banknote,
  CheckCircle2,
  DollarSign,
  Package,
  Receipt,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getDlitroDay } from "@/lib/dlitroDay";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type Periodo = "hoy" | "semana" | "mes" | "custom";

interface Sucursal {
  id: string;
  nombre: string;
}

interface TurnoLite {
  id: string;
  sucursal_id: string;
  fecha_dlitro: string;
}

interface PagoLite {
  turno_id: string;
  pedido_id: string | null;
  metodo: string;
  monto: number;
}

interface PedidoLite {
  id: string;
  turno_id: string;
  estado: string;
  total: number;
  tomador_id: string | null;
  despachador_id: string | null;
  sucursal_id: string | null;
  costo_despacho: number | null;
  tipo: string;
}

interface ItemLite {
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  subtotal: number;
}

interface Metricas {
  totalVentas: number;
  totalPedidos: number;
  ticketPromedio: number;
  tasaEntrega: number;
  entregados: number;
  todosPedidos: number;
}

interface RankingSucursal {
  id: string;
  nombre: string;
  pedidos: number;
  ventas: number;
  pct: number;
}

interface TopProducto {
  nombre: string;
  unidades: number;
  ingresos: number;
}

interface RankingUsuario {
  id: string;
  nombre: string;
  sucursal: string;
  pedidos: number;
  monto: number;
}

interface MetodoPagoRow {
  name: string;
  label: string;
  value: number;
  pct: number;
}

const BRAND_DARK = "#0A3D1F";
const BRAND_LIME = "#7FFF00";

const BRANCH_COLORS = [
  BRAND_LIME,
  BRAND_DARK,
  "#22C55E",
  "#3B82F6",
  "#F59E0B",
  "#EC4899",
  "#8B5CF6",
  "#14B8A6",
  "#EF4444",
  "#64748B",
];

const METODO_COLORS: Record<string, string> = {
  efectivo: BRAND_DARK,
  transferencia: "#3B82F6",
  tarjeta: "#8B5CF6",
  cortesia: "#94A3B8",
  mixto: "#F59E0B",
  otro: "#64748B",
};

const METODO_LABELS: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cortesia: "Cortesía",
  mixto: "Mixto",
  otro: "Otro",
};

const DIA_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const fmtHora = (d: Date) =>
  d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetweenInclusive(inicio: string, fin: string): number {
  const a = new Date(`${inicio}T12:00:00Z`).getTime();
  const b = new Date(`${fin}T12:00:00Z`).getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000) + 1);
}

function eachDate(inicio: string, fin: string): string[] {
  const out: string[] = [];
  let cur = inicio;
  while (cur <= fin) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

function labelDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const wd = DIA_CORTO[d.getUTCDay()];
  const dd = iso.slice(8, 10);
  const mm = iso.slice(5, 7);
  return `${wd} ${dd}/${mm}`;
}

function periodRange(
  periodo: Periodo,
  customFrom: string,
  customTo: string,
): { inicio: string; fin: string } {
  const hoy = getDlitroDay();
  if (periodo === "hoy") return { inicio: hoy, fin: hoy };
  if (periodo === "semana") return { inicio: addDays(hoy, -6), fin: hoy };
  if (periodo === "mes") {
    const [y, m] = hoy.split("-");
    return { inicio: `${y}-${m}-01`, fin: hoy };
  }
  const from = customFrom || hoy;
  const to = customTo || hoy;
  return from <= to ? { inicio: from, fin: to } : { inicio: to, fin: from };
}

function previousRange(inicio: string, fin: string): { inicio: string; fin: string } {
  const len = daysBetweenInclusive(inicio, fin);
  return { inicio: addDays(inicio, -len), fin: addDays(inicio, -1) };
}

function labelVsPeriodo(periodo: Periodo): string {
  if (periodo === "hoy") return "vs día anterior";
  if (periodo === "semana") return "vs semana anterior";
  if (periodo === "mes") return "vs mes anterior";
  return "vs período anterior";
}

function deltaPct(actual: number, anterior: number): number | null {
  if (anterior === 0) return actual === 0 ? 0 : null;
  return ((actual - anterior) / Math.abs(anterior)) * 100;
}

function medalOrRank(i: number): string {
  if (i === 0) return "🥇";
  if (i === 1) return "🥈";
  if (i === 2) return "🥉";
  return String(i + 1);
}

function nombreUsuario(u: {
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
}): string {
  return (
    u.nombre_completo ||
    [u.nombre, u.apellido].filter(Boolean).join(" ").trim() ||
    u.nombre ||
    "Usuario"
  );
}

async function fetchInChunks<T>(
  ids: string[],
  chunkSize: number,
  fetcher: (chunk: string[]) => Promise<T[]>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const rows = await fetcher(chunk);
    out.push(...rows);
  }
  return out;
}

function calcMetricas(pagos: PagoLite[], pedidos: PedidoLite[]): Metricas {
  const totalVentas = pagos.reduce((a, p) => a + (p.monto || 0), 0);
  const noCancelados = pedidos.filter((p) => p.estado !== "cancelado");
  const entregados = pedidos.filter((p) => p.estado === "entregado");
  const totalPedidos = noCancelados.length;
  const todosPedidos = pedidos.length;
  return {
    totalVentas,
    totalPedidos,
    ticketPromedio: totalPedidos > 0 ? totalVentas / totalPedidos : 0,
    tasaEntrega: todosPedidos > 0 ? (entregados.length / todosPedidos) * 100 : 0,
    entregados: entregados.length,
    todosPedidos,
  };
}

function MetricCard({
  title,
  value,
  icon: Icon,
  delta,
  vsLabel,
  loading,
}: {
  title: string;
  value: string;
  icon: ComponentType<{ className?: string }>;
  delta: number | null;
  vsLabel: string;
  loading: boolean;
}) {
  const up = delta != null && delta >= 0;
  const down = delta != null && delta < 0;
  return (
    <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-3">
      {loading ? (
        <>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-3 w-40" />
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">{title}</p>
            <div
              className="h-9 w-9 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: `${BRAND_DARK}18` }}
            >
              <Icon className="h-4 w-4" style={{ color: BRAND_DARK }} />
            </div>
          </div>
          <p className="font-display text-3xl sm:text-4xl tracking-wide text-foreground">{value}</p>
          <div className="flex items-center gap-1.5 text-xs">
            {delta == null ? (
              <span className="text-muted-foreground">Sin dato anterior</span>
            ) : (
              <>
                {up && <TrendingUp className="h-3.5 w-3.5 text-success" />}
                {down && <TrendingDown className="h-3.5 w-3.5 text-destructive" />}
                <span className={up ? "text-success font-medium" : down ? "text-destructive font-medium" : "text-muted-foreground"}>
                  {up ? "↑" : down ? "↓" : "→"} {Math.abs(delta).toFixed(0)}%
                </span>
                <span className="text-muted-foreground">{vsLabel}</span>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminDashboardPage() {
  const [periodo, setPeriodo] = useState<Periodo>("semana");
  const [customFrom, setCustomFrom] = useState(() => addDays(getDlitroDay(), -6));
  const [customTo, setCustomTo] = useState(() => getDlitroDay());
  const [sucursalId, setSucursalId] = useState<string>("__all__");
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [ultimaActualizacion, setUltimaActualizacion] = useState<Date | null>(null);

  const [metricas, setMetricas] = useState<Metricas | null>(null);
  const [metricasPrev, setMetricasPrev] = useState<Metricas | null>(null);
  const [ventasPorDia, setVentasPorDia] = useState<Record<string, unknown>[]>([]);
  const [sucursalesEnChart, setSucursalesEnChart] = useState<{ id: string; nombre: string }[]>([]);
  const [ranking, setRanking] = useState<RankingSucursal[]>([]);
  const [topProductos, setTopProductos] = useState<TopProducto[]>([]);
  const [topTomadores, setTopTomadores] = useState<RankingUsuario[]>([]);
  const [topDespachadores, setTopDespachadores] = useState<RankingUsuario[]>([]);
  const [metodosPago, setMetodosPago] = useState<MetodoPagoRow[]>([]);

  const { inicio, fin } = useMemo(
    () => periodRange(periodo, customFrom, customTo),
    [periodo, customFrom, customTo],
  );
  const vsLabel = labelVsPeriodo(periodo);

  const cargarSucursales = useCallback(async () => {
    const { data } = await supabase
      .from("sucursales")
      .select("id, nombre")
      .eq("activo", true)
      .order("nombre");
    setSucursales((data as Sucursal[]) ?? []);
  }, []);

  const cargar = useCallback(async (silent = false, signal?: { cancelled: boolean }) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    const isCancelled = () => signal?.cancelled === true;
    try {
      const prev = previousRange(inicio, fin);
      const sucMap = new Map(sucursales.map((s) => [s.id, s.nombre]));

      let turnosQuery = supabase
        .from("turnos")
        .select("id, sucursal_id, fecha_dlitro")
        .gte("fecha_dlitro", prev.inicio)
        .lte("fecha_dlitro", fin);
      if (sucursalId !== "__all__") turnosQuery = turnosQuery.eq("sucursal_id", sucursalId);

      const { data: turnosData, error: turnosErr } = await turnosQuery;
      if (turnosErr) throw turnosErr;
      if (isCancelled()) return;
      const turnos = (turnosData as TurnoLite[]) ?? [];

      const turnosActual = turnos.filter((t) => t.fecha_dlitro >= inicio && t.fecha_dlitro <= fin);
      const turnosPrev = turnos.filter((t) => t.fecha_dlitro >= prev.inicio && t.fecha_dlitro <= prev.fin);
      const allIds = turnos.map((t) => t.id);

      const pagos = await fetchInChunks<PagoLite>(allIds, 100, async (chunk) => {
        const { data, error } = await supabase
          .from("pagos_turno")
          .select("turno_id, pedido_id, metodo, monto")
          .in("turno_id", chunk);
        if (error) throw error;
        return (data as PagoLite[]) ?? [];
      });
      if (isCancelled()) return;

      const pedidos = await fetchInChunks<PedidoLite>(allIds, 100, async (chunk) => {
        const { data, error } = await supabase
          .from("pedidos")
          .select("id, turno_id, estado, total, tomador_id, despachador_id, sucursal_id, costo_despacho, tipo")
          .in("turno_id", chunk);
        if (error) throw error;
        return (data as PedidoLite[]) ?? [];
      });
      if (isCancelled()) return;

      const idsActual = new Set(turnosActual.map((t) => t.id));
      const idsPrev = new Set(turnosPrev.map((t) => t.id));

      const pagosActual = pagos.filter((p) => idsActual.has(p.turno_id));
      const pagosPrev = pagos.filter((p) => idsPrev.has(p.turno_id));
      const pedidosActual = pedidos.filter((p) => idsActual.has(p.turno_id));
      const pedidosPrev = pedidos.filter((p) => idsPrev.has(p.turno_id));

      const mActual = calcMetricas(pagosActual, pedidosActual);
      const mPrev = calcMetricas(pagosPrev, pedidosPrev);

      const turnoById = new Map(turnosActual.map((t) => [t.id, t]));
      const seriesIds = Array.from(new Set(turnosActual.map((t) => t.sucursal_id)));
      const series = seriesIds.map((id) => ({
        id,
        nombre: sucMap.get(id) ?? "Sucursal",
      }));

      const fechas = eachDate(inicio, fin);
      const dayRows = fechas.map((fecha) => {
        const row: Record<string, string | number> = { fecha, label: labelDia(fecha) };
        for (const s of series) row[s.id] = 0;
        return row;
      });
      const dayIndex = new Map(fechas.map((f, i) => [f, i]));

      for (const p of pagosActual) {
        const t = turnoById.get(p.turno_id);
        if (!t) continue;
        const idx = dayIndex.get(t.fecha_dlitro);
        if (idx == null) continue;
        const key = t.sucursal_id;
        dayRows[idx][key] = (Number(dayRows[idx][key]) || 0) + (p.monto || 0);
      }

      const pedidosNoCancel = pedidosActual.filter((p) => p.estado !== "cancelado");
      const pedidosCountByTurno = new Map<string, number>();
      for (const p of pedidosNoCancel) {
        pedidosCountByTurno.set(p.turno_id, (pedidosCountByTurno.get(p.turno_id) ?? 0) + 1);
      }

      const aggSuc: Record<string, { ventas: number; pedidos: number }> = {};
      for (const t of turnosActual) {
        if (!aggSuc[t.sucursal_id]) aggSuc[t.sucursal_id] = { ventas: 0, pedidos: 0 };
      }
      for (const p of pagosActual) {
        const t = turnoById.get(p.turno_id);
        if (!t) continue;
        if (!aggSuc[t.sucursal_id]) aggSuc[t.sucursal_id] = { ventas: 0, pedidos: 0 };
        aggSuc[t.sucursal_id].ventas += p.monto || 0;
      }
      for (const t of turnosActual) {
        if (!aggSuc[t.sucursal_id]) continue;
        aggSuc[t.sucursal_id].pedidos += pedidosCountByTurno.get(t.id) ?? 0;
      }
      const totalVentasRank = Object.values(aggSuc).reduce((a, v) => a + v.ventas, 0);
      const rankingRows = Object.entries(aggSuc)
        .map(([id, v]) => ({
          id,
          nombre: sucMap.get(id) ?? "Sucursal",
          pedidos: v.pedidos,
          ventas: v.ventas,
          pct: totalVentasRank > 0 ? (v.ventas / totalVentasRank) * 100 : 0,
        }))
        .sort((a, b) => b.ventas - a.ventas);

      const metodoAgg: Record<string, number> = {};
      for (const p of pagosActual) {
        const k = p.metodo || "otro";
        metodoAgg[k] = (metodoAgg[k] ?? 0) + (p.monto || 0);
      }
      const totalMetodo = Object.values(metodoAgg).reduce((a, n) => a + n, 0);
      const metodoKeys = ["efectivo", "transferencia", "tarjeta", "cortesia", "mixto"] as const;
      const metodoRows: MetodoPagoRow[] = metodoKeys
        .map((k) => ({
          name: k,
          label: METODO_LABELS[k] ?? k,
          value: metodoAgg[k] ?? 0,
          pct: totalMetodo > 0 ? ((metodoAgg[k] ?? 0) / totalMetodo) * 100 : 0,
        }))
        .filter((r) => r.value > 0);
      const metodosFinal =
        metodoRows.length > 0
          ? metodoRows
          : (["efectivo", "transferencia", "tarjeta", "cortesia"] as const).map((k) => ({
              name: k,
              label: METODO_LABELS[k],
              value: 0,
              pct: 0,
            }));

      const entregadosActual = pedidosActual.filter((p) => p.estado === "entregado");
      const entregadoIds = entregadosActual.map((p) => p.id);

      // Ventas por pedido (pagos_turno) para ranking tomadores
      const ventasPorPedido = new Map<string, number>();
      for (const p of pagosActual) {
        if (!p.pedido_id) continue;
        ventasPorPedido.set(p.pedido_id, (ventasPorPedido.get(p.pedido_id) ?? 0) + (p.monto || 0));
      }

      const tomadorAgg: Record<string, { userId: string; sucursalId: string; pedidos: number; ventas: number }> = {};
      for (const p of entregadosActual) {
        if (!p.tomador_id) continue;
        const sucId = p.sucursal_id ?? turnoById.get(p.turno_id)?.sucursal_id ?? "";
        const key = `${p.tomador_id}::${sucId}`;
        if (!tomadorAgg[key]) {
          tomadorAgg[key] = { userId: p.tomador_id, sucursalId: sucId, pedidos: 0, ventas: 0 };
        }
        tomadorAgg[key].pedidos += 1;
        tomadorAgg[key].ventas += ventasPorPedido.get(p.id) ?? 0;
      }

      const despAgg: Record<string, { userId: string; sucursalId: string; despachos: number; recaudado: number }> = {};
      for (const p of entregadosActual) {
        if (!p.despachador_id) continue;
        if (p.tipo !== "despacho" && p.tipo !== "delivery") continue;
        const sucId = p.sucursal_id ?? turnoById.get(p.turno_id)?.sucursal_id ?? "";
        const key = `${p.despachador_id}::${sucId}`;
        if (!despAgg[key]) {
          despAgg[key] = { userId: p.despachador_id, sucursalId: sucId, despachos: 0, recaudado: 0 };
        }
        despAgg[key].despachos += 1;
        despAgg[key].recaudado += p.costo_despacho ?? 0;
      }

      const userIdsNeeded = Array.from(
        new Set([
          ...Object.values(tomadorAgg).map((t) => t.userId),
          ...Object.values(despAgg).map((d) => d.userId),
        ]),
      );

      const items = await fetchInChunks<ItemLite>(entregadoIds, 100, async (chunk) => {
        const { data, error } = await supabase
          .from("pedido_items")
          .select("pedido_id, producto_id, cantidad, subtotal")
          .in("pedido_id", chunk);
        if (error) throw error;
        return (data as ItemLite[]) ?? [];
      });
      if (isCancelled()) return;

      const prodAgg: Record<string, { unidades: number; ingresos: number }> = {};
      for (const it of items) {
        const cur = prodAgg[it.producto_id] ?? { unidades: 0, ingresos: 0 };
        cur.unidades += it.cantidad || 0;
        cur.ingresos += it.subtotal || 0;
        prodAgg[it.producto_id] = cur;
      }
      const topIds = Object.entries(prodAgg)
        .sort((a, b) => b[1].unidades - a[1].unidades)
        .slice(0, 10)
        .map(([id]) => id);

      let nombreMap = new Map<string, string>();
      if (topIds.length) {
        const { data: prods } = await supabase.from("productos").select("id, nombre").in("id", topIds);
        nombreMap = new Map(((prods as { id: string; nombre: string }[]) ?? []).map((p) => [p.id, p.nombre]));
      }

      let userMap = new Map<string, { nombre: string; apellido: string | null; nombre_completo: string | null }>();
      if (userIdsNeeded.length) {
        const users = await fetchInChunks(userIdsNeeded, 100, async (chunk) => {
          const { data, error } = await supabase
            .from("usuarios")
            .select("id, nombre, apellido, nombre_completo")
            .in("id", chunk);
          if (error) throw error;
          return (data as { id: string; nombre: string; apellido: string | null; nombre_completo: string | null }[]) ?? [];
        });
        userMap = new Map(users.map((u) => [u.id, u]));
      }
      if (isCancelled()) return;

      const tomadoresTop: RankingUsuario[] = Object.values(tomadorAgg)
        .map((t) => {
          const u = userMap.get(t.userId);
          return {
            id: `${t.userId}-${t.sucursalId}`,
            nombre: u ? nombreUsuario(u) : "Tomador",
            sucursal: sucMap.get(t.sucursalId) ?? "—",
            pedidos: t.pedidos,
            monto: t.ventas,
          };
        })
        .sort((a, b) => b.monto - a.monto || b.pedidos - a.pedidos)
        .slice(0, 5);

      const despachadoresTop: RankingUsuario[] = Object.values(despAgg)
        .map((d) => {
          const u = userMap.get(d.userId);
          return {
            id: `${d.userId}-${d.sucursalId}`,
            nombre: u ? nombreUsuario(u) : "Despachador",
            sucursal: sucMap.get(d.sucursalId) ?? "—",
            pedidos: d.despachos,
            monto: d.recaudado,
          };
        })
        .sort((a, b) => b.pedidos - a.pedidos || b.monto - a.monto)
        .slice(0, 5);

      setMetricas(mActual);
      setMetricasPrev(mPrev);
      setSucursalesEnChart(series);
      setVentasPorDia(dayRows);
      setRanking(rankingRows);
      setMetodosPago(metodosFinal);
      setTopProductos(
        topIds.map((id) => ({
          nombre: nombreMap.get(id) ?? "Producto",
          unidades: prodAgg[id].unidades,
          ingresos: prodAgg[id].ingresos,
        })),
      );
      setTopTomadores(tomadoresTop);
      setTopDespachadores(despachadoresTop);
      setUltimaActualizacion(new Date());
    } catch (err: unknown) {
      if (!isCancelled()) {
        console.error("[admin-dashboard]", err);
        toast.error(err instanceof Error ? err.message : "Error al cargar el dashboard");
      }
    } finally {
      if (!isCancelled()) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [inicio, fin, sucursalId, sucursales]);

  useEffect(() => {
    void cargarSucursales();
  }, [cargarSucursales]);

  useEffect(() => {
    const signal = { cancelled: false };
    void cargar(false, signal);
    return () => { signal.cancelled = true; };
  }, [cargar]);

  const dVentas = deltaPct(metricas?.totalVentas ?? 0, metricasPrev?.totalVentas ?? 0);
  const dPedidos = deltaPct(metricas?.totalPedidos ?? 0, metricasPrev?.totalPedidos ?? 0);
  const dTicket = deltaPct(metricas?.ticketPromedio ?? 0, metricasPrev?.ticketPromedio ?? 0);
  const dTasa = deltaPct(metricas?.tasaEntrega ?? 0, metricasPrev?.tasaEntrega ?? 0);

  const chartEmpty = !loading && ventasPorDia.every((row) =>
    sucursalesEnChart.every((s) => Number(row[s.id]) === 0),
  );

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl uppercase tracking-wider">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Vista general del negocio · fecha dlitro</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || refreshing}
            onClick={() => void cargar(true)}
            className="uppercase tracking-wider text-xs"
          >
            {refreshing || loading ? (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            )}
            Actualizar
          </Button>
          <span className="text-xs text-muted-foreground">
            Última actualización: {ultimaActualizacion ? fmtHora(ultimaActualizacion) : "—"}
          </span>
        </div>
      </div>

      {/* Filtros */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-card border border-border rounded-xl p-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Período</Label>
          <Select value={periodo} onValueChange={(v) => setPeriodo(v as Periodo)}>
            <SelectTrigger className="bg-background h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="hoy">Hoy</SelectItem>
              <SelectItem value="semana">Semana</SelectItem>
              <SelectItem value="mes">Mes</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
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
        {periodo === "custom" && (
          <>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Desde</Label>
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-background h-9"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Hasta</Label>
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-background h-9"
              />
            </div>
          </>
        )}
        {periodo !== "custom" && (
          <div className="sm:col-span-2 lg:col-span-2 flex items-end">
            <p className="text-xs text-muted-foreground pb-2">
              Rango: <span className="font-mono text-foreground">{inicio}</span>
              {" → "}
              <span className="font-mono text-foreground">{fin}</span>
            </p>
          </div>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <MetricCard
          title="💰 Total ventas"
          value={fmtCLP(metricas?.totalVentas ?? 0)}
          icon={DollarSign}
          delta={dVentas}
          vsLabel={vsLabel}
          loading={loading}
        />
        <MetricCard
          title="📦 Total pedidos"
          value={String(metricas?.totalPedidos ?? 0)}
          icon={ShoppingBag}
          delta={dPedidos}
          vsLabel={vsLabel}
          loading={loading}
        />
        <MetricCard
          title="🧾 Ticket promedio"
          value={fmtCLP(metricas?.ticketPromedio ?? 0)}
          icon={Receipt}
          delta={dTicket}
          vsLabel={vsLabel}
          loading={loading}
        />
        <MetricCard
          title="✅ Tasa de entrega"
          value={fmtPct(metricas?.tasaEntrega ?? 0)}
          icon={CheckCircle2}
          delta={dTasa}
          vsLabel={vsLabel}
          loading={loading}
        />
      </div>

      {/* Ventas por día */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl uppercase tracking-wider">Ventas por día</h2>
          <Banknote className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? (
          <Skeleton className="h-[280px] w-full rounded-lg" />
        ) : chartEmpty ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-muted-foreground">
            Sin ventas en el período
          </div>
        ) : (
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {sucursalesEnChart.length <= 1 ? (
                <BarChart data={ventasPorDia} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value) => fmtCLP(Number(value ?? 0))}
                    labelStyle={{ fontWeight: 600 }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Bar
                    dataKey={sucursalesEnChart[0]?.id ?? "v"}
                    name={sucursalesEnChart[0]?.nombre ?? "Ventas"}
                    fill={BRAND_LIME}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              ) : (
                <LineChart data={ventasPorDia} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
                  />
                  <Tooltip
                    formatter={(value) => fmtCLP(Number(value ?? 0))}
                    labelStyle={{ fontWeight: 600 }}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                    }}
                  />
                  <Legend />
                  {sucursalesEnChart.map((s, i) => (
                    <Line
                      key={s.id}
                      type="monotone"
                      dataKey={s.id}
                      name={s.nombre}
                      stroke={BRANCH_COLORS[i % BRANCH_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Ranking sucursales */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <h2 className="font-display text-xl uppercase tracking-wider">Ranking de sucursales</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : ranking.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin datos</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-2 w-8">#</th>
                    <th className="pb-2 pr-2">Sucursal</th>
                    <th className="pb-2 pr-2 text-right">Pedidos</th>
                    <th className="pb-2 pr-2 text-right">Ventas</th>
                    <th className="pb-2 min-w-[120px]">% del total</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-2 font-mono text-muted-foreground">{i + 1}</td>
                      <td className="py-2.5 pr-2 font-medium text-foreground">{r.nombre}</td>
                      <td className="py-2.5 pr-2 text-right font-mono">{r.pedidos}</td>
                      <td className="py-2.5 pr-2 text-right font-mono">{fmtCLP(r.ventas)}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${Math.min(100, r.pct)}%`,
                                backgroundColor: i === 0 ? BRAND_LIME : BRAND_DARK,
                              }}
                            />
                          </div>
                          <span className="font-mono text-xs text-muted-foreground w-12 text-right">
                            {fmtPct(r.pct)}
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Métodos de pago */}
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <h2 className="font-display text-xl uppercase tracking-wider">Métodos de pago</h2>
          {loading ? (
            <Skeleton className="h-[260px] w-full rounded-lg" />
          ) : metodosPago.every((m) => m.value === 0) ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin pagos en el período</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px] gap-4 items-center">
              <div className="h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={metodosPago}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {metodosPago.map((m) => (
                        <Cell key={m.name} fill={METODO_COLORS[m.name] ?? METODO_COLORS.otro} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => fmtCLP(Number(value ?? 0))}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-2">
                {metodosPago.map((m) => (
                  <div key={m.name} className="flex items-start gap-2 text-xs">
                    <span
                      className="mt-1 h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: METODO_COLORS[m.name] ?? METODO_COLORS.otro }}
                    />
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{m.label}</p>
                      <p className="font-mono text-muted-foreground">
                        {fmtCLP(m.value)} · {fmtPct(m.pct)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top productos */}
      <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-xl uppercase tracking-wider">Productos más vendidos</h2>
          <Package className="h-4 w-4 text-muted-foreground" />
        </div>
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : topProductos.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Sin productos entregados en el período</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  <th className="pb-2 pr-2 w-8">#</th>
                  <th className="pb-2 pr-2">Producto</th>
                  <th className="pb-2 pr-2 text-right">Unidades</th>
                  <th className="pb-2 text-right">Ingresos</th>
                </tr>
              </thead>
              <tbody>
                {topProductos.map((p, i) => (
                  <tr key={`${p.nombre}-${i}`} className="border-b border-border/60 last:border-0">
                    <td className="py-2.5 pr-2 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="py-2.5 pr-2 font-medium text-foreground">{p.nombre}</td>
                    <td className="py-2.5 pr-2 text-right font-mono">{p.unidades}</td>
                    <td className="py-2.5 text-right font-mono" style={{ color: BRAND_DARK }}>
                      {fmtCLP(p.ingresos)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Rankings de usuarios */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <h2 className="font-display text-xl uppercase tracking-wider">👤 Mejores tomadores de pedidos</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : topTomadores.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin tomadores en el período</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-2 w-10">#</th>
                    <th className="pb-2 pr-2">Nombre</th>
                    <th className="pb-2 pr-2">Sucursal</th>
                    <th className="pb-2 pr-2 text-right">Pedidos</th>
                    <th className="pb-2 text-right">Ventas</th>
                  </tr>
                </thead>
                <tbody>
                  {topTomadores.map((r, i) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-2 text-center">{medalOrRank(i)}</td>
                      <td className="py-2.5 pr-2 font-medium text-foreground">{r.nombre}</td>
                      <td className="py-2.5 pr-2 text-muted-foreground">{r.sucursal}</td>
                      <td className="py-2.5 pr-2 text-right font-mono">{r.pedidos}</td>
                      <td className="py-2.5 text-right font-mono" style={{ color: BRAND_DARK }}>
                        {fmtCLP(r.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4 sm:p-5 space-y-4">
          <h2 className="font-display text-xl uppercase tracking-wider">🛵 Mejores despachadores</h2>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : topDespachadores.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Sin despachos en el período</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                    <th className="pb-2 pr-2 w-10">#</th>
                    <th className="pb-2 pr-2">Nombre</th>
                    <th className="pb-2 pr-2">Sucursal</th>
                    <th className="pb-2 pr-2 text-right">Despachos</th>
                    <th className="pb-2 text-right">Recaudado</th>
                  </tr>
                </thead>
                <tbody>
                  {topDespachadores.map((r, i) => (
                    <tr key={r.id} className="border-b border-border/60 last:border-0">
                      <td className="py-2.5 pr-2 text-center">{medalOrRank(i)}</td>
                      <td className="py-2.5 pr-2 font-medium text-foreground">{r.nombre}</td>
                      <td className="py-2.5 pr-2 text-muted-foreground">{r.sucursal}</td>
                      <td className="py-2.5 pr-2 text-right font-mono">{r.pedidos}</td>
                      <td className="py-2.5 text-right font-mono" style={{ color: BRAND_DARK }}>
                        {fmtCLP(r.monto)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
