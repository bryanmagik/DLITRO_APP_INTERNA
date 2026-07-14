import { useEffect, useMemo, useState } from "react";
import { Loader2, GitCompareArrows } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { formatearStockDisplay, fmtNumCl } from "@/utils/stockUtils";
import {
  ESTILO_NIVEL_DIF,
  nivelDiferencia,
  pctDiferencia,
} from "@/lib/inventarioCierre";
import { cn } from "@/lib/utils";

interface Sucursal { id: string; nombre: string }
interface Insumo {
  id: string;
  nombre: string;
  unidad: string | null;
  formato_mayor: string | null;
  unidades_por_formato: number | null;
  ml_por_unidad: number | null;
}
interface InvRow {
  id: string;
  turno_id: string;
  insumo_id: string;
  cantidad_ideal: number;
  cantidad_real: number | null;
  diferencia: number | null;
  conteo_original: string | null;
}
interface Turno {
  id: string;
  sucursal_id: string;
  fecha_dlitro: string | null;
  closed_at: string | null;
}

function fmtDiferencia(n: number, unidad: string) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${fmtNumCl(Math.abs(n))} ${unidad}`;
}

export default function DiferenciasPage() {
  const [loading, setLoading] = useState(true);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [inventarios, setInventarios] = useState<InvRow[]>([]);
  const [sucursalId, setSucursalId] = useState("");
  const [fecha, setFecha] = useState("");
  const [soloSignificativas, setSoloSignificativas] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [suR, insR, tuR] = await Promise.all([
        supabase.from("sucursales").select("id,nombre").eq("activo", true).order("nombre"),
        supabase.from("insumos").select("id,nombre,unidad,formato_mayor,unidades_por_formato,ml_por_unidad").eq("activo", true),
        supabase
          .from("turnos")
          .select("id,sucursal_id,fecha_dlitro,closed_at")
          .eq("estado", "cerrado")
          .not("fecha_dlitro", "is", null)
          .order("fecha_dlitro", { ascending: false })
          .limit(500),
      ]);
      const sucs = (suR.data as Sucursal[]) ?? [];
      setSucursales(sucs);
      setInsumos((insR.data as Insumo[]) ?? []);
      const turs = (tuR.data as Turno[]) ?? [];
      setTurnos(turs);
      if (sucs.length > 0) setSucursalId(sucs[0].id);
      const fechas = [...new Set(turs.map((t) => t.fecha_dlitro).filter(Boolean))] as string[];
      if (fechas.length > 0) setFecha(fechas[0]);
      setLoading(false);
    })();
  }, []);

  const fechasDisponibles = useMemo(() => {
    const set = new Set<string>();
    turnos
      .filter((t) => t.sucursal_id === sucursalId && t.fecha_dlitro)
      .forEach((t) => set.add(t.fecha_dlitro!));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [turnos, sucursalId]);

  useEffect(() => {
    if (!fechasDisponibles.length) return;
    if (!fecha || !fechasDisponibles.includes(fecha)) {
      setFecha(fechasDisponibles[0]);
    }
  }, [fechasDisponibles, fecha]);

  useEffect(() => {
    if (!sucursalId || !fecha) {
      setInventarios([]);
      return;
    }
    let alive = true;
    (async () => {
      const turnoIds = turnos
        .filter((t) => t.sucursal_id === sucursalId && t.fecha_dlitro === fecha)
        .map((t) => t.id);
      if (turnoIds.length === 0) {
        if (alive) setInventarios([]);
        return;
      }
      const { data } = await supabase
        .from("inventario_cierre")
        .select("id,turno_id,insumo_id,cantidad_ideal,cantidad_real,diferencia,conteo_original")
        .in("turno_id", turnoIds);
      if (alive) setInventarios((data as InvRow[]) ?? []);
    })();
    return () => { alive = false; };
  }, [sucursalId, fecha, turnos]);

  const insumoMap = useMemo(() => new Map(insumos.map((i) => [i.id, i])), [insumos]);

  const filas = useMemo(() => {
    return inventarios
      .map((ic) => {
        const ins = insumoMap.get(ic.insumo_id);
        const real = ic.cantidad_real ?? 0;
        const ideal = ic.cantidad_ideal;
        const diff = real - ideal;
        const pct = pctDiferencia(ideal, real);
        const nivel = nivelDiferencia(pct);
        return { ic, ins, real, ideal, diff, pct, nivel };
      })
      .filter((r) => !soloSignificativas || r.pct > 5)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [inventarios, insumoMap, soloSignificativas]);

  const turnosDelDia = turnos.filter((t) => t.sucursal_id === sucursalId && t.fecha_dlitro === fecha);

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-3xl flex items-center gap-2">
          <GitCompareArrows className="h-8 w-8 text-primary" /> Diferencias
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Comparación entre stock contado por el tomador y el calculado por el sistema al cierre de turno.
        </p>
      </div>

      <div className="bg-card border border-border rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
        <div>
          <Label className="label-upper">Sucursal</Label>
          <select
            value={sucursalId}
            onChange={(e) => setSucursalId(e.target.value)}
            className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            {sucursales.map((s) => (
              <option key={s.id} value={s.id}>{s.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <Label className="label-upper">Fecha dlitro</Label>
          <select
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full mt-1 h-10 px-3 rounded-md border border-input bg-background text-sm"
          >
            {fechasDisponibles.length === 0 ? (
              <option value="">Sin fechas</option>
            ) : fechasDisponibles.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3 pb-1">
          <Switch id="solo-dif" checked={soloSignificativas} onCheckedChange={setSoloSignificativas} />
          <Label htmlFor="solo-dif" className="text-sm cursor-pointer">
            Solo diferencias &gt; 5%
          </Label>
        </div>
      </div>

      {turnosDelDia.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {turnosDelDia.length} turno(s) cerrado(s) en esta fecha · {inventarios.length} insumos inventariados
        </p>
      )}

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 border-b border-border">
            <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
              <th className="px-4 py-3">Insumo</th>
              <th className="px-4 py-3">Contado (tomador)</th>
              <th className="px-4 py-3">Calculado (sistema)</th>
              <th className="px-4 py-3 text-right">Diferencia</th>
              <th className="px-4 py-3 text-right">% Diferencia</th>
              <th className="px-4 py-3 text-center">Estado</th>
            </tr>
          </thead>
          <tbody>
            {filas.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {inventarios.length === 0
                    ? "No hay inventarios de cierre para esta sucursal y fecha."
                    : "No hay diferencias que cumplan el filtro seleccionado."}
                </td>
              </tr>
            ) : filas.map(({ ic, ins, real, ideal, diff, pct, nivel }) => {
              const est = ESTILO_NIVEL_DIF[nivel];
              const unidad = ins?.unidad || "ml";
              const contadoTxt = formatearStockDisplay(real, ins) ?? "—";
              const sistemaTxt = formatearStockDisplay(ideal, ins) ?? "—";
              return (
                <tr key={ic.id} className={cn("border-b border-border last:border-0", est.bg)}>
                  <td className="px-4 py-2 font-medium">{ins?.nombre ?? "—"}</td>
                  <td className={cn("px-4 py-2 font-mono text-sm", est.cls)}>{contadoTxt}</td>
                  <td className="px-4 py-2 font-mono text-sm text-muted-foreground">{sistemaTxt}</td>
                  <td className={cn("px-4 py-2 text-right font-mono", est.cls)}>
                    {fmtDiferencia(diff, unidad)}
                    {ic.conteo_original && (
                      <div className="text-[10px] text-muted-foreground font-sans mt-0.5">{ic.conteo_original}</div>
                    )}
                  </td>
                  <td className={cn("px-4 py-2 text-right font-mono font-semibold", est.cls)}>
                    {pct < 0.5 ? "0%" : `${pct.toFixed(0)}%`}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <Badge variant="outline" className={cn("text-[10px] uppercase", est.cls, est.bg)}>
                      {nivel === "ok" ? "🟢" : nivel === "warn" ? "🟡" : "🔴"} {est.label}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
