import { useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { auditDate, auditDayBoundary } from "@/lib/orderAudit";
import { getDlitroDay } from "@/lib/dlitroDay";

interface Ranking { id: string | null; nombre: string; cambios: number; pedidos: number; recuperados?: number }
interface Dispatcher { id: string | null; nombre: string; jarros: number | null; promos?: number | null; sueltos?: number | null; pedidos: number; sin_dato: number }
interface Promotion { id: string | null; nombre: string; entregados: number; promociones: number; canjes: number; cumpleanos: number; trabajador: number; doradas: number; descuentos: number | null }
export interface AuditSummary {
  cambios: number; pedidos_modificados: number; historicos: number; sin_autor: number;
  entregados: number; jarros: number | null; jarros_sin_dato: number; promociones: number;
  jarros_promos?: number | null; jarros_sueltos?: number | null;
  cobertura_desde: string | null; personas: Ranking[]; sucursales: Ranking[];
  sucursales_recuperadas?: number; sin_sucursal?: number;
  despachadores: Dispatcher[]; promos_sucursales: Promotion[]; dias: { dia: string; cambios: number }[];
}
export interface SummarySelection { actor?: string; sucursal?: string; desde: string; hasta: string }
const initialPeriod = () => ({ desde: getDlitroDay(new Date(Date.now() - 29 * 86400000)), hasta: getDlitroDay(), sucursal: "" });
const money = (value: number | null) => value == null ? "Sin dato" : new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(value);
const jarBreakdown = (promos: number | null | undefined, sueltos: number | null | undefined) => promos == null || sueltos == null ? null : `${promos} ${promos === 1 ? 'promo' : 'promos'} + ${sueltos} ${sueltos === 1 ? 'jarro suelto' : 'jarros sueltos'}`;

export default function AuditoriaResumen({ onInspect }: { onInspect: (filters: SummarySelection) => void }) {
  const [draft, setDraft] = useState(initialPeriod);
  const [filters, setFilters] = useState(draft);
  const [data, setData] = useState<AuditSummary | null>(null);
  const [branches, setBranches] = useState<{ id: string; nombre: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setData(null);
    (async () => {
      try {
        if (!filters.desde || !filters.hasta || filters.desde > filters.hasta) throw new Error("Selecciona un período válido.");
        const [summary, options] = await Promise.all([
          supabase.rpc("resumen_auditoria_pedidos", { p_desde: auditDayBoundary(filters.desde), p_hasta: auditDayBoundary(filters.hasta, true), p_sucursal: filters.sucursal || null }),
          supabase.rpc("opciones_auditoria_pedidos"),
        ]);
        if (summary.error) throw new Error(summary.error.message);
        if (options.error) throw new Error(options.error.message);
        if (active) { setData(summary.data as unknown as AuditSummary); setBranches((options.data as unknown as { sucursales: typeof branches }).sucursales); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el resumen."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [filters, reload]);
  const inspect = (selection: Partial<SummarySelection>) => onInspect({ desde: filters.desde, hasta: filters.hasta, sucursal: filters.sucursal, ...selection });
  return <div className="space-y-5">
    <form className="rounded-xl border bg-card p-4 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); setFilters({ ...draft }); }}>
      <div className="space-y-1"><Label htmlFor="summary-desde">Desde</Label><Input id="summary-desde" type="date" required value={draft.desde} onChange={(e) => setDraft({ ...draft, desde: e.target.value })} /></div>
      <div className="space-y-1"><Label htmlFor="summary-hasta">Hasta (incluido)</Label><Input id="summary-hasta" type="date" required value={draft.hasta} onChange={(e) => setDraft({ ...draft, hasta: e.target.value })} /></div>
      <div className="space-y-1 min-w-48"><Label htmlFor="summary-sucursal">Sucursal</Label><select id="summary-sucursal" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={draft.sucursal} onChange={(e) => setDraft({ ...draft, sucursal: e.target.value })}><option value="">Todas las sucursales</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.nombre}</option>)}</select></div>
      <Button disabled={loading}>Ver resumen</Button><Button type="button" variant="outline" disabled={loading} onClick={() => setReload((n) => n + 1)}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </form>
    <p className="text-sm text-muted-foreground">Período por jornada DLITRO: se usa la fecha del turno, incluyendo su actividad después de medianoche. Cambios: acciones de esos pedidos, sin creaciones ni acciones automáticas, aunque se registren en otro día. Jarros y promociones: estado actual de pedidos de esas jornadas que ya están entregados. Cada pedido cuenta una vez. Sin fecha de turno, se estima la jornada con corte a las 06:00 de Chile.</p>
    {loading ? <p role="status" className="flex justify-center gap-2 p-10"><Loader2 className="h-5 w-5 animate-spin" />Cargando resumen…</p>
      : error ? <div role="alert" className="rounded-xl border border-destructive p-5"><p>{error}</p><Button className="mt-3" variant="outline" onClick={() => setReload((n) => n + 1)}>Reintentar</Button></div>
      : data && <>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[
          ["Cambios registrados", data.cambios, `${data.pedidos_modificados} pedidos distintos`],
          ["Persona con más cambios", data.personas.find((p) => p.id)?.nombre ?? "Sin autor identificado", `${data.personas.find((p) => p.id)?.cambios ?? 0} cambios`],
          ["Jarros informados por despachadores", jarBreakdown(data.jarros_promos, data.jarros_sueltos) ?? data.jarros ?? "Sin datos", `${data.jarros == null ? 'Sin total registrado' : `Total: ${data.jarros} jarros`} · ${data.jarros_sin_dato} pedidos sin cantidad registrada`],
          ["Pedidos con promoción o descuento", data.promociones, `${data.entregados} pedidos entregados en la selección`],
        ].map(([title,value,detail]) => <div key={title} className="rounded-xl border bg-card p-4"><p className="text-xs text-muted-foreground">{title}</p><p className="mt-2 text-xl font-semibold break-words">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>)}</div>
        <div className="rounded-xl border bg-card p-4 text-sm space-y-1"><p>{data.cobertura_desde ? `Registro automático desde ${auditDate(data.cobertura_desde)}.` : "Aún no hay cambios del registro automático."} {data.historicos} cambios históricos con cobertura parcial; {data.sin_autor} sin autor identificado.</p><p>Los jarros son cantidades informadas al entregar, pendientes de recepción física verificada. La cantidad de cambios por sí sola no demuestra una irregularidad.</p></div>
        {!!data.sucursales_recuperadas && <p className="text-sm text-muted-foreground">{data.sucursales_recuperadas} cambios históricos asociados a la sucursal actual de su pedido. Esa sucursal no quedó guardada al registrar el cambio y puede diferir si el pedido fue trasladado.</p>}
        {data.sucursales.some((row) => !row.id) && <p className="text-sm text-muted-foreground">{data.sucursales.filter((row) => !row.id).reduce((total, row) => total + row.cambios, 0)} cambios sin sucursal identificable: incluidos en el total, fuera del ranking de sucursales.</p>}
        <p className="text-sm text-muted-foreground">Jarros: cada promo representa un grupo de 4 jarros informados. Se calcula por pedido y después se suma; los jarros sueltos de pedidos distintos se conservan como sueltos. Este desglose no cuenta pedidos con descuentos.</p>
        <div className="grid xl:grid-cols-2 gap-4">
          <RankingPanel title="Personas que hacen más cambios" rows={data.personas.map((p) => ({ ...p, value: p.cambios, detail: `${p.pedidos} pedidos distintos`, inspect: p.id ? () => inspect({ actor: p.id! }) : undefined }))} unit="cambios" />
          <RankingPanel title="Sucursales con más cambios" rows={data.sucursales.filter((p) => p.id).map((p) => ({ ...p, value: p.cambios, detail: `${p.pedidos} pedidos distintos${p.recuperados ? ` · ${p.recuperados} cambios con sucursal recuperada del pedido actual` : ''}`, inspect: () => inspect({ sucursal: p.id! }) }))} unit="cambios" />
          <RankingPanel title="Despachadores con más jarros informados" rows={data.despachadores.map((p) => ({ ...p, value: p.jarros, displayValue: jarBreakdown(p.promos, p.sueltos) ?? undefined, detail: `${p.jarros == null ? 'Sin total registrado' : `Total: ${p.jarros} jarros`} · ${p.pedidos} pedidos · ${p.sin_dato} sin cantidad registrada` }))} unit="jarros" />
          <RankingPanel title="Sucursales con más promociones" rows={data.promos_sucursales.map((p) => ({ ...p, value: p.promociones, detail: `${p.entregados ? (100 * p.promociones / p.entregados).toFixed(1) : '0'}% de ${p.entregados} entregados · ${money(p.descuentos)} en descuentos registrados` }))} unit="pedidos" />
        </div>
        <RankingPanel title="Cambios por jornada DLITRO" rows={data.dias.map((d) => ({ id: d.dia, nombre: d.dia.split('-').reverse().join('-'), value: d.cambios, detail: '', inspect: () => inspect({ desde: d.dia, hasta: d.dia }) }))} unit="cambios" />
        <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold mb-3">Promociones por sucursal</h2><p className="text-xs text-muted-foreground mb-3">Pedidos entregados con promoción, cupón, jarra dorada o descuento. Las categorías pueden coincidir; no se suman para obtener el total.</p>
          {data.promos_sucursales.length === 0 ? <p className="text-sm text-muted-foreground">No hay pedidos entregados para estos filtros.</p> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr>{['Sucursal','Con promoción','Canje','Cumpleaños','Trabajador','Jarra dorada'].map((label) => <th key={label} className="text-left p-2 whitespace-nowrap">{label}</th>)}</tr></thead><tbody>{data.promos_sucursales.map((row) => <tr key={row.id ?? 'unknown'} className="border-t">{[row.nombre,row.promociones,row.canjes,row.cumpleanos,row.trabajador,row.doradas].map((value,index) => <td key={index} className="p-2">{value}</td>)}</tr>)}</tbody></table></div>}
        </section>
      </>}
  </div>;
}

function RankingPanel({ title, rows, unit }: { title: string; unit: string; rows: { id: string | null; nombre: string; value: number | null; displayValue?: string; detail: string; inspect?: () => void }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.value ?? 0));
  return <section className="rounded-xl border bg-card p-4"><h2 className="font-semibold mb-4">{title}</h2>{rows.length === 0 ? <p className="text-sm text-muted-foreground">No hay datos para estos filtros.</p> : <ol className="space-y-4 max-h-96 overflow-y-auto pr-1">{rows.map((row) => <li key={row.id ?? 'unknown'}><div className="flex flex-wrap items-start justify-between gap-3 text-sm"><span className="break-words">{row.nombre}</span><strong>{row.displayValue ?? (row.value == null ? 'Sin dato' : `${row.value} ${unit}`)}</strong></div><div aria-hidden="true" className="mt-2 h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-primary rounded-full" style={{ width: `${100 * (row.value ?? 0) / max}%` }} /></div><div className="flex flex-wrap justify-between gap-2 mt-1"><p className="text-xs text-muted-foreground">{row.detail}</p>{row.inspect && <Button variant="link" size="sm" className="p-0 h-auto" onClick={row.inspect}>Ver historial de {row.nombre}</Button>}</div></li>)}</ol>}</section>;
}
