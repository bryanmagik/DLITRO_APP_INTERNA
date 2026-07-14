import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
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
import { Loader2, AlertTriangle, CheckCircle2, XCircle, Package, DollarSign } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Badge } from "@/components/ui/badge";
import { getDlitroDay } from "@/lib/dlitroDay";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Pedido {
  id: string;
  numero_pedido: number | null;
  estado: string;
  total: number;
  metodo_pago: string | null;
  despachador_id: string | null;
  created_at: string | null;
}
interface PedidoItem {
  pedido_id: string;
  producto_id: string;
  cantidad: number;
  subtotal: number;
}
interface ProductoLite { id: string; nombre: string }
interface UsuarioLite { id: string; nombre: string; nombre_completo: string | null }
interface TurnoRow {
  id: string;
  fecha_dlitro: string | null;
  created_at: string | null;
  closed_at: string | null;
  estado: string;
  tomador_id: string;
  caja_chica_apertura: number;
  diferencia_caja: number | null;
}
interface StockRow {
  insumo_id: string;
  cantidad: number;
  stock_minimo: number | null;
  stock_minimo_observacion?: number | null;
  stock_minimo_critico?: number | null;
}
interface InsumoLite { id: string; nombre: string; unidad: string | null }
interface TurnoDespachador {
  despachador_id: string;
  activo: boolean | null;
  hora_salida: string | null;
}

const fmtCLP = (n: number) =>
  "$" + Math.round(n).toLocaleString("es-CL");

const PIE_COLORS: Record<string, string> = {
  efectivo: "hsl(142 70% 45%)",
  transferencia: "hsl(217 90% 60%)",
  tarjeta: "hsl(280 70% 60%)",
  otro: "hsl(0 0% 60%)",
};

export default function EncargadoDashboard() {
  const { perfil, sucursalNombre } = useAuthStore();
  const sucursalId = perfil?.sucursal_id ?? null;

  const [loading, setLoading] = useState(true);
  const [turnoActivo, setTurnoActivo] = useState<TurnoRow | null>(null);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [items, setItems] = useState<PedidoItem[]>([]);
  const [productos, setProductos] = useState<ProductoLite[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioLite[]>([]);
  const [turnoDespachadores, setTurnoDespachadores] = useState<TurnoDespachador[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [insumos, setInsumos] = useState<InsumoLite[]>([]);
  const [historial, setHistorial] = useState<TurnoRow[]>([]);
  const [historialPedidos, setHistorialPedidos] = useState<Record<string, { count: number; total: number }>>({});
  const [turnoDetalle, setTurnoDetalle] = useState<TurnoRow | null>(null);

  const fechaHoy = getDlitroDay();

  useEffect(() => {
    if (!sucursalId) { setLoading(false); return; }
    let cancel = false;

    const cargar = async () => {
      setLoading(true);
      // Turno activo
      const { data: turnoAct } = await supabase
        .from("turnos")
        .select("*")
        .eq("sucursal_id", sucursalId)
        .eq("estado", "abierto")
        .maybeSingle();

      // Pedidos del turno activo
      let pedidosData: Pedido[] = [];
      let itemsData: PedidoItem[] = [];
      let despData: TurnoDespachador[] = [];
      if (turnoAct) {
        const { data: pds } = await supabase
          .from("pedidos")
          .select("id,numero_pedido,estado,total,metodo_pago,despachador_id,created_at")
          .eq("turno_id", turnoAct.id)
          .order("created_at", { ascending: true });
        pedidosData = (pds as Pedido[]) ?? [];
        const ids = pedidosData.map((p) => p.id);
        if (ids.length) {
          const { data: its } = await supabase
            .from("pedido_items")
            .select("pedido_id,producto_id,cantidad,subtotal")
            .in("pedido_id", ids);
          itemsData = (its as PedidoItem[]) ?? [];
        }
        const { data: tds } = await supabase
          .from("turno_despachadores")
          .select("despachador_id,activo,hora_salida")
          .eq("turno_id", turnoAct.id);
        despData = (tds as TurnoDespachador[]) ?? [];
      }

      // Productos & usuarios para mapear
      const productoIds = Array.from(new Set(itemsData.map((i) => i.producto_id)));
      const userIds = Array.from(new Set([
        ...despData.map((d) => d.despachador_id),
      ]));
      const [{ data: prods }, { data: users }] = await Promise.all([
        productoIds.length
          ? supabase.from("productos").select("id,nombre").in("id", productoIds)
          : Promise.resolve({ data: [] as ProductoLite[] }),
        supabase.from("usuarios").select("id,nombre,nombre_completo").eq("sucursal_id", sucursalId),
      ]);

      // Stock + insumos
      const { data: stk } = await supabase
        .from("stock_sucursal")
        .select("insumo_id,cantidad,stock_minimo,stock_minimo_observacion,stock_minimo_critico")
        .eq("sucursal_id", sucursalId);
      const stockData = (stk as StockRow[]) ?? [];
      const insIds = stockData.map((s) => s.insumo_id);
      const { data: ins } = insIds.length
        ? await supabase.from("insumos").select("id,nombre,unidad").in("id", insIds)
        : { data: [] as InsumoLite[] };

      // Historial últimos 10 turnos
      const { data: hist } = await supabase
        .from("turnos")
        .select("*")
        .eq("sucursal_id", sucursalId)
        .order("created_at", { ascending: false })
        .limit(10);
      const histData = (hist as TurnoRow[]) ?? [];
      const histIds = histData.map((t) => t.id);
      const histAgg: Record<string, { count: number; total: number }> = {};
      if (histIds.length) {
        const { data: histPeds } = await supabase
          .from("pedidos")
          .select("turno_id,total,estado")
          .in("turno_id", histIds)
          .neq("estado", "cancelado");
        ((histPeds as { turno_id: string; total: number }[]) ?? []).forEach((p) => {
          const cur = histAgg[p.turno_id] ?? { count: 0, total: 0 };
          cur.count += 1;
          cur.total += p.total ?? 0;
          histAgg[p.turno_id] = cur;
        });
      }

      if (cancel) return;
      setTurnoActivo((turnoAct as TurnoRow | null) ?? null);
      setPedidos(pedidosData);
      setItems(itemsData);
      setProductos((prods as ProductoLite[]) ?? []);
      setUsuarios((users as UsuarioLite[]) ?? []);
      setTurnoDespachadores(despData);
      setStock(stockData);
      setInsumos((ins as InsumoLite[]) ?? []);
      setHistorial(histData);
      setHistorialPedidos(histAgg);
      setLoading(false);
    };

    cargar();

    // Realtime: pedidos del turno activo
    const channel = supabase
      .channel(`encargado-${sucursalId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: `sucursal_id=eq.${sucursalId}` }, () => cargar())
      .on("postgres_changes", { event: "*", schema: "public", table: "turnos", filter: `sucursal_id=eq.${sucursalId}` }, () => cargar())
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(channel); };
  }, [sucursalId]);

  // Derivados
  const entregados = useMemo(() => pedidos.filter((p) => p.estado === "entregado"), [pedidos]);
  const cancelados = useMemo(() => pedidos.filter((p) => p.estado === "cancelado"), [pedidos]);
  const activos = useMemo(
    () => pedidos.filter((p) => ["en_preparacion", "listo", "en_despacho"].includes(p.estado)),
    [pedidos]
  );
  const ventasDia = useMemo(() => entregados.reduce((s, p) => s + (p.total ?? 0), 0), [entregados]);

  // Ventas por hora (acumulado) — solo entregados
  const ventasPorHora = useMemo(() => {
    const buckets: Record<number, number> = {};
    entregados.forEach((p) => {
      if (!p.created_at) return;
      const d = new Date(p.created_at);
      const h = parseInt(
        new Intl.DateTimeFormat("es-CL", { timeZone: "America/Santiago", hour: "2-digit", hour12: false }).format(d),
        10
      );
      buckets[h] = (buckets[h] ?? 0) + (p.total ?? 0);
    });
    // Orden 13..23, 0..5
    const orden = [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4, 5];
    let acc = 0;
    return orden.map((h) => {
      acc += buckets[h] ?? 0;
      return { hora: `${String(h).padStart(2, "0")}:00`, ventas: acc };
    });
  }, [entregados]);

  // Por método de pago
  const porMetodo = useMemo(() => {
    const m: Record<string, number> = {};
    entregados.forEach((p) => {
      const k = p.metodo_pago ?? "otro";
      m[k] = (m[k] ?? 0) + (p.total ?? 0);
    });
    const total = Object.values(m).reduce((s, n) => s + n, 0);
    return Object.entries(m).map(([name, value]) => ({
      name,
      value,
      pct: total > 0 ? (value / total) * 100 : 0,
    }));
  }, [entregados]);

  // Top productos
  const topProductos = useMemo(() => {
    const itemsEntregados = items.filter((i) => entregados.some((p) => p.id === i.pedido_id));
    const agg: Record<string, { cantidad: number; monto: number }> = {};
    itemsEntregados.forEach((i) => {
      const cur = agg[i.producto_id] ?? { cantidad: 0, monto: 0 };
      cur.cantidad += i.cantidad;
      cur.monto += i.subtotal;
      agg[i.producto_id] = cur;
    });
    return Object.entries(agg)
      .map(([pid, v]) => ({
        nombre: productos.find((p) => p.id === pid)?.nombre ?? "—",
        cantidad: v.cantidad,
        monto: v.monto,
      }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 5);
  }, [items, productos, entregados]);

  // Despachadores stats
  const despachadoresStats = useMemo(() => {
    return turnoDespachadores.map((td) => {
      const u = usuarios.find((x) => x.id === td.despachador_id);
      const pedidosDesp = entregados.filter((p) => p.despachador_id === td.despachador_id);
      return {
        id: td.despachador_id,
        nombre: u?.nombre_completo || u?.nombre || "—",
        pedidos: pedidosDesp.length,
        total: pedidosDesp.reduce((s, p) => s + (p.total ?? 0), 0),
        activo: td.activo && !td.hora_salida,
      };
    });
  }, [turnoDespachadores, usuarios, entregados]);

  // Stock bajo
  const stockBajo = useMemo(() => {
    return stock
      .filter((s) => {
        const obs = Number(s.stock_minimo_observacion ?? s.stock_minimo ?? 0);
        const crit = Number(s.stock_minimo_critico ?? 0);
        return (crit > 0 && s.cantidad <= crit) || (obs > 0 && s.cantidad <= obs);
      })
      .map((s) => {
        const i = insumos.find((x) => x.id === s.insumo_id);
        const obs = Number(s.stock_minimo_observacion ?? s.stock_minimo ?? 0);
        const crit = Number(s.stock_minimo_critico ?? 0);
        const nivel = crit > 0 && s.cantidad <= crit ? "critico" : "observacion";
        return {
          id: s.insumo_id,
          nombre: i?.nombre ?? "—",
          unidad: i?.unidad ?? "",
          cantidad: s.cantidad,
          minimo: nivel === "critico" ? crit : obs,
          nivel,
        };
      })
      .sort((a, b) => a.cantidad / (a.minimo || 1) - b.cantidad / (b.minimo || 1));
  }, [stock, insumos]);

  if (!sucursalId) {
    return (
      <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
        Tu cuenta no tiene sucursal asignada.
      </div>
    );
  }
  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-display text-4xl text-foreground tracking-wide">
            {sucursalNombre ?? "Sucursal"}
          </h1>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mt-1">
            Día dlitro · {fechaHoy}
          </p>
        </div>
        <Badge
          variant="outline"
          className={
            turnoActivo
              ? "border-primary/40 text-primary bg-primary/10 uppercase tracking-widest"
              : "border-border text-muted-foreground uppercase tracking-widest"
          }
        >
          {turnoActivo ? "Turno abierto" : "Turno cerrado"}
        </Badge>
      </div>

      {/* FILA 1 — KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={<DollarSign className="h-4 w-4" />} label="Ventas del día" value={fmtCLP(ventasDia)} accent />
        <KpiCard icon={<Package className="h-4 w-4" />} label="Pedidos activos" value={String(activos.length)} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Entregados" value={String(entregados.length)} />
        <KpiCard icon={<XCircle className="h-4 w-4" />} label="Cancelados" value={String(cancelados.length)} />
      </div>

      {/* FILA 2 — Ventas por hora */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="label-upper mb-3">Ventas acumuladas por hora</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={ventasPorHora}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hora" stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                fontSize={11}
                tickFormatter={(v) => "$" + (v / 1000).toFixed(0) + "k"}
              />
              <Tooltip
                contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                formatter={(v: number) => fmtCLP(v)}
              />
              <Line
                type="monotone"
                dataKey="ventas"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ fill: "hsl(var(--primary))", r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* FILA 3 — Pago + Top productos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="label-upper mb-3">Métodos de pago</h2>
          {porMetodo.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin pagos registrados</p>
          ) : (
            <div className="grid grid-cols-2 gap-4 items-center">
              <div className="h-56">
                <ResponsiveContainer>
                  <PieChart>
                    <Pie data={porMetodo} dataKey="value" nameKey="name" outerRadius={80} innerRadius={40}>
                      {porMetodo.map((entry) => (
                        <Cell key={entry.name} fill={PIE_COLORS[entry.name] ?? PIE_COLORS.otro} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                      formatter={(v: number) => fmtCLP(v)}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="space-y-2">
                {porMetodo.map((m) => (
                  <li key={m.name} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 capitalize">
                      <span
                        className="inline-block h-3 w-3 rounded-sm"
                        style={{ background: PIE_COLORS[m.name] ?? PIE_COLORS.otro }}
                      />
                      {m.name}
                    </span>
                    <span className="font-mono text-foreground">
                      {fmtCLP(m.value)} <span className="text-muted-foreground text-xs">({m.pct.toFixed(0)}%)</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="label-upper mb-3">Top productos del día</h2>
          {topProductos.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin ventas todavía</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={topProductos} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                  <YAxis type="category" dataKey="nombre" stroke="hsl(var(--muted-foreground))" fontSize={11} width={120} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))" }}
                    formatter={(v: number, _n, p) => [
                      `${v} u · ${fmtCLP((p.payload as { monto: number }).monto)}`,
                      "Vendido",
                    ]}
                  />
                  <Bar dataKey="cantidad" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* FILA 4 — Despachadores + Stock */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="label-upper mb-3">Despachadores del turno</h2>
          {despachadoresStats.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Sin despachadores asignados</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="text-left font-normal py-2">Nombre</th>
                  <th className="text-right font-normal">Pedidos</th>
                  <th className="text-right font-normal">Cobrado</th>
                  <th className="text-right font-normal">Estado</th>
                </tr>
              </thead>
              <tbody>
                {despachadoresStats.map((d) => (
                  <tr key={d.id} className="border-b border-border/50">
                    <td className="py-2 text-foreground">{d.nombre}</td>
                    <td className="text-right font-mono">{d.pedidos}</td>
                    <td className="text-right font-mono">{fmtCLP(d.total)}</td>
                    <td className="text-right">
                      <Badge
                        variant="outline"
                        className={
                          d.activo
                            ? "border-primary/40 text-primary bg-primary/10 text-[10px] uppercase"
                            : "border-border text-muted-foreground text-[10px] uppercase"
                        }
                      >
                        {d.activo ? "Activo" : "Cerró"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4">
          <h2 className="label-upper mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            Alertas de stock
          </h2>
          {stockBajo.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">Todo en orden ✓</p>
          ) : (
            <ul className="space-y-2">
              {stockBajo.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between text-sm border-b border-border/50 pb-2"
                >
                  <span className="text-foreground">{s.nombre}</span>
                  <Badge
                    variant="outline"
                    className="border-destructive/40 text-destructive bg-destructive/10 font-mono text-xs"
                  >
                    {s.cantidad} {s.unidad} / mín {s.minimo}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* FILA 5 — Historial */}
      <div className="bg-card border border-border rounded-xl p-4">
        <h2 className="label-upper mb-3">Últimos 10 turnos</h2>
        <table className="w-full text-sm">
          <thead className="text-xs uppercase tracking-wider text-muted-foreground">
            <tr className="border-b border-border">
              <th className="text-left font-normal py-2">Fecha</th>
              <th className="text-left font-normal">Tomador</th>
              <th className="text-right font-normal">Pedidos</th>
              <th className="text-right font-normal">Ventas</th>
              <th className="text-right font-normal">Estado</th>
              <th className="text-right font-normal">Descuadre</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((t) => {
              const stats = historialPedidos[t.id] ?? { count: 0, total: 0 };
              const tomador = usuarios.find((u) => u.id === t.tomador_id);
              return (
                <tr
                  key={t.id}
                  className="border-b border-border/50 cursor-pointer hover:bg-secondary/20"
                  onClick={() => setTurnoDetalle(t)}
                >
                  <td className="py-2">{t.fecha_dlitro ?? (t.created_at ?? "").slice(0, 10)}</td>
                  <td>{tomador?.nombre_completo || tomador?.nombre || "—"}</td>
                  <td className="text-right font-mono">{stats.count}</td>
                  <td className="text-right font-mono">{fmtCLP(stats.total)}</td>
                  <td className="text-right">
                    <Badge
                      variant="outline"
                      className={
                        t.estado === "abierto"
                          ? "border-primary/40 text-primary bg-primary/10 text-[10px] uppercase"
                          : "border-border text-muted-foreground text-[10px] uppercase"
                      }
                    >
                      {t.estado}
                    </Badge>
                  </td>
                  <td className="text-right font-mono">
                    {t.diferencia_caja != null ? (
                      <span className={t.diferencia_caja === 0 ? "text-muted-foreground" : "text-destructive"}>
                        {fmtCLP(t.diferencia_caja)}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Dialog open={!!turnoDetalle} onOpenChange={(o) => !o && setTurnoDetalle(null)}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle>Detalle del turno</DialogTitle>
          </DialogHeader>
          {turnoDetalle && (
            <div className="space-y-2 text-sm">
              <Row k="Día dlitro" v={turnoDetalle.fecha_dlitro ?? "—"} />
              <Row k="Apertura" v={new Date(turnoDetalle.created_at ?? "").toLocaleString("es-CL")} />
              <Row k="Cierre" v={turnoDetalle.closed_at ? new Date(turnoDetalle.closed_at).toLocaleString("es-CL") : "—"} />
              <Row k="Tomador" v={
                usuarios.find((u) => u.id === turnoDetalle.tomador_id)?.nombre_completo ||
                usuarios.find((u) => u.id === turnoDetalle.tomador_id)?.nombre ||
                "—"
              } />
              <Row k="Caja chica" v={fmtCLP(turnoDetalle.caja_chica_apertura)} />
              <Row k="Pedidos" v={String(historialPedidos[turnoDetalle.id]?.count ?? 0)} />
              <Row k="Ventas" v={fmtCLP(historialPedidos[turnoDetalle.id]?.total ?? 0)} />
              <Row k="Estado" v={turnoDetalle.estado} />
              <Row k="Descuadre" v={turnoDetalle.diferencia_caja != null ? fmtCLP(turnoDetalle.diferencia_caja) : "—"} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-border/50 py-1">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-foreground font-mono">{v}</span>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 ${
        accent ? "bg-primary/10 border-primary/40" : "bg-card border-border"
      }`}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-widest">
        {icon} {label}
      </div>
      <div className={`mt-2 font-mono text-3xl ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </div>
    </div>
  );
}