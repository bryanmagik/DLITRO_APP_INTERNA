import { useEffect, useMemo, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle, AlertCircle, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { formatearCantidad, formatearMl, formatearPackIndividual } from "@/lib/formatoCantidad";

interface InvCierre {
  id: string;
  turno_id: string;
  insumo_id: string;
  cantidad_ideal: number;
  cantidad_real: number | null;
  diferencia: number | null;
  conteo_original: string | null;
  created_at: string | null;
}
interface Turno { id: string; sucursal_id: string; closed_at: string | null; created_at: string | null }
interface Sucursal { id: string; nombre: string }
interface Insumo {
  id: string;
  nombre: string;
  unidad: string | null;
  formato_mayor: string | null;
  unidades_por_formato: number | null;
  ml_por_unidad: number | null;
}

const fmtFecha = (s: string | null) =>
  s ? new Date(s).toLocaleString("es-CL", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const fmtNum = (n: number) => new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(n);

export default function InventariosPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<InvCierre[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [openTurno, setOpenTurno] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [ic, tu, su, ins] = await Promise.all([
        supabase.from("inventario_cierre").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("turnos").select("id,sucursal_id,closed_at,created_at").order("created_at", { ascending: false }).limit(200),
        supabase.from("sucursales").select("id,nombre"),
        supabase.from("insumos").select("id,nombre,unidad,formato_mayor,unidades_por_formato,ml_por_unidad"),
      ]);
      setRows((ic.data as InvCierre[]) ?? []);
      setTurnos((tu.data as Turno[]) ?? []);
      setSucursales((su.data as Sucursal[]) ?? []);
      setInsumos((ins.data as Insumo[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const turnosConInv = useMemo(() => {
    const turnoIds = new Set(rows.map((r) => r.turno_id));
    return turnos.filter((t) => turnoIds.has(t.id));
  }, [rows, turnos]);

  if (loading)
    return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-3xl">Historial de inventarios</h1>
        <p className="text-sm text-muted-foreground">Conteos de cierre por turno con comparación contra el sistema.</p>
      </div>

      {turnosConInv.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">Sin inventarios registrados.</div>
      ) : (
        <div className="space-y-3">
          {turnosConInv.map((t) => {
            const suc = sucursales.find((s) => s.id === t.sucursal_id);
            const filas = rows.filter((r) => r.turno_id === t.id);
            const conDif = filas.filter((r) => Math.abs((r.cantidad_real ?? 0) - r.cantidad_ideal) > 0.001).length;
            const isOpen = openTurno === t.id;
            return (
              <Collapsible key={t.id} open={isOpen} onOpenChange={() => setOpenTurno((cur) => (cur === t.id ? null : t.id))}>
                <div className="bg-card border border-border rounded-xl overflow-hidden">
                  <CollapsibleTrigger asChild>
                    <button type="button" className="w-full flex items-center justify-between gap-4 p-5 hover:bg-secondary/30 transition-colors text-left">
                      <div>
                        <h3 className="font-display text-xl">{suc?.nombre ?? "—"}</h3>
                        <p className="text-xs text-muted-foreground uppercase tracking-wider mt-1">
                          {fmtFecha(t.closed_at ?? t.created_at)} · {filas.length} insumos · {conDif > 0 ? `${conDif} con diferencia` : "todo cuadra"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {conDif === 0 ? (
                          <CheckCircle2 className="h-5 w-5 text-success" />
                        ) : (
                          <AlertTriangle className="h-5 w-5 text-warning" />
                        )}
                        <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </div>
                    </button>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="border-t border-border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-secondary/40 border-b border-border">
                          <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                            <th className="px-4 py-3">Insumo</th>
                            <th className="px-4 py-3">Conteo tomador</th>
                            <th className="px-4 py-3 text-right">Real (Pack + Individual)</th>
                            <th className="px-4 py-3 text-right">Real (ml/base)</th>
                            <th className="px-4 py-3 text-right">Sistema (Pack + Individual)</th>
                            <th className="px-4 py-3 text-right">Sistema (ml/base)</th>
                            <th className="px-4 py-3 text-right">Diferencia (Pack + Individual)</th>
                            <th className="px-4 py-3 text-right">Diferencia (ml/base)</th>
                            <th className="px-4 py-3 text-center">Estado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filas.map((r) => {
                            const ins = insumos.find((i) => i.id === r.insumo_id);
                            const u = ins?.unidad ?? "";
                            const real = Number(r.cantidad_real ?? 0);
                            const sis = Number(r.cantidad_ideal);
                            const dif = real - sis;
                            const tol = Math.max(1, sis * 0.02);
                            const status =
                              Math.abs(dif) < 0.001 ? "ok" : Math.abs(dif) <= tol ? "warn" : "bad";
                            const statusCfg = {
                              ok: { cls: "text-success", icon: CheckCircle2, label: "OK" },
                              warn: { cls: "text-warning", icon: AlertTriangle, label: "Atento" },
                              bad: { cls: "text-destructive", icon: AlertCircle, label: "Crítico" },
                            }[status];
                            const Icon = statusCfg.icon;
                            const mlReal = ins ? formatearMl(real, ins) : null;
                            const mlSis = ins ? formatearMl(sis, ins) : null;
                            const mlDif = ins ? formatearMl(Math.abs(dif), ins) : null;
                            return (
                              <tr key={r.id} className="border-b border-border last:border-0">
                                <td className="px-4 py-3 text-foreground font-medium">{ins?.nombre ?? "—"}</td>
                                <td className="px-4 py-3 text-muted-foreground">{r.conteo_original ?? "—"}</td>
                                <td className="px-4 py-3 text-right font-mono text-foreground">
                                  {ins ? formatearPackIndividual(real, ins) : `${fmtNum(real)} Individual`}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                                  {mlReal ?? `${fmtNum(real)} ${u}`}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                                  {ins ? formatearPackIndividual(sis, ins) : `${fmtNum(sis)} Individual`}
                                </td>
                                <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                                  {mlSis ?? `${fmtNum(sis)} ${u}`}
                                </td>
                                <td className={`px-4 py-3 text-right font-mono ${dif > 0 ? "text-success" : dif < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                  {dif === 0 ? "—" : `${dif > 0 ? "+" : "-"}${ins ? formatearPackIndividual(Math.abs(dif), ins) : `${fmtNum(Math.abs(dif))} Individual`}`}
                                </td>
                                <td className={`px-4 py-3 text-right font-mono text-xs ${dif > 0 ? "text-success" : dif < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                                  {Math.abs(dif) < 0.001 ? "—" : `${dif < 0 ? "-" : "+"}${mlDif ?? `${fmtNum(Math.abs(dif))} ${u}`}`}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className={`inline-flex items-center gap-1 text-xs uppercase tracking-wider ${statusCfg.cls}`}>
                                    <Icon className="h-3 w-3" /> {statusCfg.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            );
          })}
        </div>
      )}
    </div>
  );
}