import { useEffect, useMemo, useState } from "react";
import { Loader2, AlertTriangle, TrendingDown, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

interface Sucursal { id: string; nombre: string }
interface StockRow { sucursal_id: string; cantidad: number }
interface InvRow {
  id: string;
  turno_id: string;
  cantidad_ideal: number;
  cantidad_real: number | null;
  diferencia: number | null;
  created_at: string;
  turnos: { sucursal_id: string; tomador_id: string | null; closed_at: string | null } | null;
}
interface UsuarioRow { id: string; nombre: string; apellido: string | null }

const COLORS = ["#22C55E", "#3B82F6", "#F59E0B", "#EF4444", "#A855F7", "#06B6D4"];

function diffClass(diff: number) {
  if (diff === 0) return "text-success";
  if (diff >= -5 && diff < 0) return "text-warning";
  if (diff < -5) return "text-destructive";
  return "text-foreground";
}
function diffBg(diff: number) {
  if (diff === 0) return "bg-success/10 border-success/30 text-success";
  if (diff >= -5 && diff < 0) return "bg-warning/10 border-warning/30 text-warning";
  if (diff < -5) return "bg-destructive/10 border-destructive/30 text-destructive";
  return "bg-muted text-muted-foreground";
}

export default function JarrosPage() {
  const [loading, setLoading] = useState(true);
  const [jarroId, setJarroId] = useState<string | null>(null);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [inventarios, setInventarios] = useState<InvRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [openSuc, setOpenSuc] = useState<Sucursal | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const insR = await supabase
        .from("insumos")
        .select("id,nombre")
        .ilike("nombre", "%jarro%vidrio%")
        .maybeSingle();
      const jId = (insR.data as { id: string } | null)?.id ?? null;
      setJarroId(jId);

      const [sucR, usrR] = await Promise.all([
        supabase.from("sucursales").select("id,nombre").eq("activo", true).order("nombre"),
        supabase.from("usuarios").select("id,nombre,apellido"),
      ]);
      setSucursales((sucR.data as Sucursal[]) ?? []);
      setUsuarios((usrR.data as UsuarioRow[]) ?? []);

      if (jId) {
        const [stR, invR] = await Promise.all([
          supabase.from("stock_sucursal").select("sucursal_id,cantidad").eq("insumo_id", jId),
          supabase
            .from("inventario_cierre")
            .select("id,turno_id,cantidad_ideal,cantidad_real,diferencia,created_at,turnos(sucursal_id,tomador_id,closed_at)")
            .eq("insumo_id", jId)
            .order("created_at", { ascending: false })
            .limit(500),
        ]);
        setStock((stR.data as StockRow[]) ?? []);
        setInventarios((invR.data as unknown as InvRow[]) ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const userMap = useMemo(() => {
    const m = new Map<string, string>();
    usuarios.forEach((u) => m.set(u.id, `${u.nombre}${u.apellido ? " " + u.apellido : ""}`));
    return m;
  }, [usuarios]);

  const ultimoPorSuc = useMemo(() => {
    const m = new Map<string, InvRow>();
    inventarios.forEach((i) => {
      const sid = i.turnos?.sucursal_id;
      if (!sid) return;
      if (!m.has(sid)) m.set(sid, i);
    });
    return m;
  }, [inventarios]);

  const stockMap = useMemo(() => {
    const m = new Map<string, number>();
    stock.forEach((s) => m.set(s.sucursal_id, Number(s.cantidad) || 0));
    return m;
  }, [stock]);

  const filas = useMemo(() => {
    return sucursales.map((s) => {
      const sys = stockMap.get(s.id) ?? 0;
      const inv = ultimoPorSuc.get(s.id);
      const real = inv?.cantidad_real ?? null;
      const diff = real != null ? Number(real) - sys : null;
      return {
        sucursal: s,
        sys,
        real,
        diff,
        fecha: inv?.turnos?.closed_at ?? inv?.created_at ?? null,
      };
    });
  }, [sucursales, stockMap, ultimoPorSuc]);

  const totalCirculacion = useMemo(() => filas.reduce((a, f) => a + f.sys, 0), [filas]);
  const negativas = useMemo(() => filas.filter((f) => f.diff != null && f.diff < 0).length, [filas]);
  const mayorPerdida = useMemo(() => {
    const inicioMes = new Date();
    inicioMes.setDate(1);
    inicioMes.setHours(0, 0, 0, 0);
    const acc = new Map<string, number>();
    inventarios.forEach((i) => {
      const sid = i.turnos?.sucursal_id;
      if (!sid) return;
      const fecha = new Date(i.created_at);
      if (fecha < inicioMes) return;
      const d = Number(i.diferencia ?? 0);
      if (d < 0) acc.set(sid, (acc.get(sid) ?? 0) + d);
    });
    let worst: { sucursal: string; perdida: number } | null = null;
    acc.forEach((v, k) => {
      if (!worst || v < worst.perdida) {
        worst = { sucursal: sucursales.find((s) => s.id === k)?.nombre ?? "—", perdida: v };
      }
    });
    return worst;
  }, [inventarios, sucursales]);

  const chartData = useMemo(() => {
    const hace30 = new Date();
    hace30.setDate(hace30.getDate() - 30);
    const byDate = new Map<string, Record<string, number | string>>();
    inventarios.forEach((i) => {
      const fecha = new Date(i.created_at);
      if (fecha < hace30) return;
      const sid = i.turnos?.sucursal_id;
      const sucNom = sucursales.find((s) => s.id === sid)?.nombre;
      if (!sucNom) return;
      const key = fecha.toISOString().slice(0, 10);
      const row = byDate.get(key) ?? { fecha: key };
      // último valor del día
      row[sucNom] = Number(i.cantidad_real ?? i.cantidad_ideal ?? 0);
      byDate.set(key, row);
    });
    return Array.from(byDate.values()).sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
  }, [inventarios, sucursales]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!jarroId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">Control de Jarros</h1>
        <div className="rounded-lg border border-warning/40 bg-warning/10 p-4 text-sm text-warning">
          No se encontró el insumo "Jarro de vidrio" en el catálogo.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Control de Jarros</h1>
        <p className="text-sm text-muted-foreground">Stock, conteo real y evolución por sucursal</p>
      </div>

      {/* Métricas globales */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <Package className="h-4 w-4" /> Total en circulación
          </div>
          <div className="text-3xl font-bold tabular-nums">{totalCirculacion}</div>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <AlertTriangle className="h-4 w-4" /> Sucursales con diferencia
          </div>
          <div className="flex items-center gap-2">
            <span className="text-3xl font-bold tabular-nums">{negativas}</span>
            {negativas > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/30">
                negativa
              </span>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-5">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground mb-1">
            <TrendingDown className="h-4 w-4" /> Mayor pérdida del mes
          </div>
          {mayorPerdida ? (
            <div>
              <div className="text-xl font-bold">{mayorPerdida.sucursal}</div>
              <div className="text-sm text-destructive font-semibold">{mayorPerdida.perdida} jarros</div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Sin pérdidas este mes</div>
          )}
        </div>
      </div>

      {/* Tabla principal */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted">
            <tr>
              <th className="text-left px-4 py-3 font-medium">Sucursal</th>
              <th className="text-right px-4 py-3 font-medium">Stock sistema</th>
              <th className="text-right px-4 py-3 font-medium">Último inventario (real)</th>
              <th className="text-right px-4 py-3 font-medium">Diferencia</th>
              <th className="text-right px-4 py-3 font-medium">Último cierre</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr
                key={f.sucursal.id}
                onClick={() => setOpenSuc(f.sucursal)}
                className="border-t cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <td className="px-4 py-3 font-semibold">{f.sucursal.nombre}</td>
                <td className="px-4 py-3 text-right tabular-nums">{f.sys}</td>
                <td className="px-4 py-3 text-right tabular-nums">{f.real ?? "—"}</td>
                <td className="px-4 py-3 text-right">
                  {f.diff != null ? (
                    <span className={cn("inline-block text-xs font-semibold px-2.5 py-1 rounded-full border tabular-nums", diffBg(f.diff))}>
                      {f.diff > 0 ? "+" : ""}{f.diff}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground tabular-nums">
                  {f.fecha ? new Date(f.fecha).toLocaleDateString("es-CL") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gráfico */}
      <div className="rounded-lg border bg-card p-5">
        <h2 className="text-lg font-bold mb-4">Evolución últimos 30 días</h2>
        {chartData.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center">Sin datos de inventario en los últimos 30 días</div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                <Legend />
                {sucursales.map((s, idx) => (
                  <Line
                    key={s.id}
                    type="monotone"
                    dataKey={s.nombre}
                    stroke={COLORS[idx % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <Dialog open={!!openSuc} onOpenChange={(v) => !v && setOpenSuc(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-2xl">{openSuc?.nombre} — Historial de jarros</DialogTitle>
          </DialogHeader>
          {openSuc && (
            <HistorialSucursal
              sucursalId={openSuc.id}
              inventarios={inventarios}
              userMap={userMap}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HistorialSucursal({
  sucursalId,
  inventarios,
  userMap,
}: {
  sucursalId: string;
  inventarios: InvRow[];
  userMap: Map<string, string>;
}) {
  const rows = useMemo(
    () => inventarios.filter((i) => i.turnos?.sucursal_id === sucursalId),
    [inventarios, sucursalId],
  );

  if (rows.length === 0) {
    return <div className="text-sm text-muted-foreground py-6 text-center">Sin historial de inventario</div>;
  }

  return (
    <div className="overflow-auto -mx-6 px-6">
      <table className="w-full text-sm">
        <thead className="bg-muted sticky top-0">
          <tr>
            <th className="text-left px-3 py-2 font-medium">Fecha</th>
            <th className="text-right px-3 py-2 font-medium">Stock sistema</th>
            <th className="text-right px-3 py-2 font-medium">Conteo real</th>
            <th className="text-right px-3 py-2 font-medium">Diferencia</th>
            <th className="text-left px-3 py-2 font-medium">Tomador</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const diff = Number(r.diferencia ?? (r.cantidad_real != null ? r.cantidad_real - r.cantidad_ideal : 0));
            return (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2 tabular-nums">
                  {new Date(r.turnos?.closed_at ?? r.created_at).toLocaleDateString("es-CL")}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.cantidad_ideal}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.cantidad_real ?? "—"}</td>
                <td className={cn("px-3 py-2 text-right tabular-nums font-semibold", diffClass(diff))}>
                  {r.cantidad_real != null ? (diff > 0 ? `+${diff}` : diff) : "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {r.turnos?.tomador_id ? userMap.get(r.turnos.tomador_id) ?? "—" : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}