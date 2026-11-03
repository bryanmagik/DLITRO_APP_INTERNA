import { useEffect, useState } from "react";
import { History, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AUDIT_EVENTS, auditDate, type OrderAuditCardsResult } from "@/lib/orderAudit";
import OrderAuditCards from "./OrderAuditCards";
import AuditoriaDespachosLegacy from "./AuditoriaDespachosLegacy";
import AuditoriaResumen, { type SummarySelection } from "./AuditoriaResumen";

interface Option { id: string; nombre: string }
interface Options { personas: Option[]; sucursales: Option[] }
const EMPTY_FILTERS = { actor: "", sucursal: "", turno: "", numero: "", evento: "", desde: "", hasta: "" };

export default function AuditoriaDespachosPage() {
  const perfil = useAuthStore((state) => state.perfil);
  const puedeVerResumen = perfil?.rol === "superadmin" || perfil?.rol === "contador_rrhh";
  const [tab, setTab] = useState(puedeVerResumen ? "resumen" : "pedidos");
  const [historyFilters, setHistoryFilters] = useState<SummarySelection | undefined>();
  return <div className="space-y-5">
    <div><h1 className="font-display text-3xl flex items-center gap-2"><History className="h-6 w-6 text-primary" /> Auditoría</h1>
      <p className="text-sm text-muted-foreground mt-1">Revisa quién actuó, qué cambió y en qué momento. Una diferencia requiere revisión; por sí sola no demuestra una pérdida.</p></div>
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="h-auto flex-wrap justify-start">{puedeVerResumen && <TabsTrigger value="resumen">Resumen</TabsTrigger>}<TabsTrigger value="pedidos">Historial de pedidos</TabsTrigger>
        {perfil?.rol === "superadmin" && <TabsTrigger value="despachos">Registros de despacho</TabsTrigger>}</TabsList>
      {puedeVerResumen && <TabsContent forceMount value="resumen" className="data-[state=inactive]:hidden"><AuditoriaResumen onInspect={(filters) => { setHistoryFilters(filters); setTab("pedidos"); }} /></TabsContent>}
      <TabsContent value="pedidos"><OrderHistory key={JSON.stringify(historyFilters)} initialFilters={historyFilters} /></TabsContent>
      {tab === "despachos" && perfil?.rol === "superadmin" && <TabsContent value="despachos"><AuditoriaDespachosLegacy /></TabsContent>}
    </Tabs>
  </div>;
}

function OrderHistory({ initialFilters }: { initialFilters?: SummarySelection }) {
  const [draft, setDraft] = useState({ ...EMPTY_FILTERS, ...initialFilters });
  const [filters, setFilters] = useState({ ...EMPTY_FILTERS, ...initialFilters });
  const [options, setOptions] = useState<Options>({ personas: [], sucursales: [] });
  const [page, setPage] = useState(0);
  const [data, setData] = useState<OrderAuditCardsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true); setError(null); setData(null);
    (async () => {
      try {
        const queryFilters = filters;
        if (queryFilters.turno && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(queryFilters.turno)) throw new Error("Ingresa un identificador de turno válido.");
        if (queryFilters.desde && queryFilters.hasta && queryFilters.desde > queryFilters.hasta) throw new Error("La fecha de inicio debe ser anterior o igual a la final.");
        const [history, choices] = await Promise.all([
          supabase.rpc("listar_pedidos_auditoria", {
            p_actor: queryFilters.actor || null, p_sucursal: queryFilters.sucursal || null, p_turno: queryFilters.turno || null,
            p_numero: queryFilters.numero ? Number(queryFilters.numero) : null, p_evento: queryFilters.evento || null,
            p_desde: queryFilters.desde || null,
            p_hasta: queryFilters.hasta || null,
            p_pagina: page,
          }), supabase.rpc("opciones_auditoria_pedidos"),
        ]);
        if (history.error) throw new Error(history.error.message);
        if (choices.error) throw new Error(choices.error.message);
        if (!active) return;
        setData(history.data as unknown as OrderAuditCardsResult);
        setOptions(choices.data as unknown as Options);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "No se pudo cargar la auditoría.");
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [filters, page, reload]);

  const field = (key: keyof typeof draft, value: string) => setDraft((previous) => ({ ...previous, [key]: value }));
  return <div className="space-y-4">
    <form className="rounded-xl border bg-card p-4 space-y-4" onSubmit={(e) => { e.preventDefault(); setPage(0); setFilters({ ...draft }); }}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <FilterSelect id="audit-persona" label="Realizado por" value={draft.actor} onChange={(value) => field("actor", value)} options={options.personas} />
        <FilterSelect id="audit-sucursal" label="Sucursal" value={draft.sucursal} onChange={(value) => field("sucursal", value)} options={options.sucursales} />
        <FilterSelect id="audit-evento" label="Acción" value={draft.evento} onChange={(value) => field("evento", value)} options={Object.entries(AUDIT_EVENTS).map(([id,nombre]) => ({ id,nombre }))} />
        <div className="space-y-1"><Label htmlFor="audit-numero">Número de pedido</Label><Input id="audit-numero" type="number" min="1" step="1" value={draft.numero} onChange={(e) => field("numero",e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="audit-desde">Desde jornada</Label><Input id="audit-desde" type="date" value={draft.desde} onChange={(e) => field("desde",e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor="audit-hasta">Hasta jornada (incluida)</Label><Input id="audit-hasta" type="date" value={draft.hasta} onChange={(e) => field("hasta",e.target.value)} /></div>
        <div className="space-y-1 sm:col-span-2"><Label htmlFor="audit-turno">Identificador de turno</Label><Input id="audit-turno" value={draft.turno} onChange={(e) => field("turno",e.target.value.trim())} placeholder="Opcional" /></div>
      </div>
      <div className="flex flex-wrap gap-2"><Button type="submit" disabled={loading}>Aplicar filtros</Button>
        <Button type="button" variant="outline" onClick={() => { setDraft(EMPTY_FILTERS); setFilters(EMPTY_FILTERS); setPage(0); }}>Limpiar</Button>
        <Button type="button" variant="outline" onClick={() => setReload((r) => r+1)} disabled={loading}><RefreshCw className="h-4 w-4 mr-2" /> Actualizar</Button></div>
    </form>
    {loading ? <div role="status" className="flex justify-center gap-2 p-10"><Loader2 className="h-5 w-5 animate-spin" /> Cargando historial…</div>
      : error ? <div role="alert" className="rounded-lg border border-destructive p-5 space-y-3"><p>{error}</p><Button variant="outline" onClick={() => setReload((r) => r+1)}>Reintentar</Button></div>
      : data && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[['Eventos',data.total],['Pedidos creados',data.creados],['Pedidos con modificaciones',data.modificados],['Pedidos cancelados',data.cancelados]].map(([label,value]) => <div key={label} className="rounded-lg border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}
        </div>
        <p className="text-xs text-muted-foreground">Resumen de los filtros aplicados por jornada DLITRO. Un pedido puede aparecer en varias categorías; estos conteos no son ventas ni utilidad. Horas de Chile.</p>
        <p className="text-sm text-muted-foreground">{data.cobertura_desde ? `Registro automático disponible desde ${auditDate(data.cobertura_desde)}.` : "Todavía no hay eventos del registro automático."} Los registros históricos tienen cobertura parcial. Jarros declarados o informados no equivalen a recepción física verificada.</p>
        {data.pedidos.length === 0 ? <p className="rounded-lg border bg-card p-10 text-center">No hay pedidos para estas jornadas y filtros.</p>
          : <OrderAuditCards key={`${JSON.stringify(filters)}:${page}:${reload}`} cards={data.pedidos} />}
        <div className="flex flex-wrap justify-between items-center gap-3"><p className="text-sm">{data.total_pedidos === 0 ? '0 pedidos' : `${page*50+1}–${Math.min((page+1)*50,data.total_pedidos)} de ${data.total_pedidos} pedidos`}</p><div className="flex gap-2"><Button variant="outline" disabled={page===0} onClick={() => setPage((p)=>p-1)}>Anterior</Button><Button variant="outline" disabled={(page+1)*50>=data.total_pedidos} onClick={() => setPage((p)=>p+1)}>Siguiente</Button></div></div>
      </>}
  </div>;
}

function FilterSelect({ id,label,value,onChange,options }: { id:string; label:string; value:string; onChange:(value:string)=>void; options:Option[] }) {
  return <div className="space-y-1"><Label htmlFor={id}>{label}</Label><select id={id} value={value} onChange={(e)=>onChange(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><option value="">Todas las opciones</option>{options.map((option)=><option key={option.id} value={option.id}>{option.nombre}</option>)}</select></div>;
}
