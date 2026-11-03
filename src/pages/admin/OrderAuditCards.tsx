import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { AUDIT_EVENTS, auditChanges, auditDate, type OrderAuditCard, type OrderAuditEvent, type OrderAuditResult } from "@/lib/orderAudit";

export default function OrderAuditCards({ cards }: { cards: OrderAuditCard[] }) {
  const [open, setOpen] = useState<string[]>([]);
  const journeys = [...new Set(cards.map((card) => card.jornada))];
  return <div className="space-y-5">{journeys.map((journey) => <section key={journey ?? 'unknown'} aria-label={journey ? `Jornada DLITRO ${journey}` : 'Jornada sin identificar'}>
    <h2 className="font-semibold mb-3">{journey ? `Jornada DLITRO · ${journey.split('-').reverse().join('-')}` : 'Jornada sin identificar'}</h2>
    <Accordion type="multiple" value={open} onValueChange={setOpen} className="space-y-3">
      {cards.filter((card) => card.jornada === journey).map((card) => {
        const key = `${card.jornada}:${card.tarjeta_id}`;
        return <AccordionItem value={key} key={key} className="rounded-xl border bg-card px-4">
          <AccordionTrigger className="text-left gap-3 hover:no-underline">
            <span className="space-y-1 min-w-0"><span className="block font-semibold">Pedido {card.numero_pedido ?? 'sin número'}</span>
              <span className="block text-sm font-normal text-muted-foreground break-words">{card.sucursal_nombre} · {card.eventos_coincidentes} {card.eventos_coincidentes === 1 ? 'movimiento coincide' : 'movimientos coinciden'} con los filtros</span>
              <span className="block text-xs font-normal text-muted-foreground">Último movimiento: {auditDate(card.ultimo_movimiento)}</span>
            </span>
          </AccordionTrigger>
          <AccordionContent>
            {card.jornada_recuperada && <p className="text-xs text-muted-foreground mb-3">Jornada recuperada del turno actual del pedido; puede diferir de la original si fue trasladado.</p>}
            {card.jornada_estimada && <p className="text-xs text-muted-foreground mb-3">Sin jornada de turno disponible: estimada por la hora del registro, con corte a las 06:00 de Chile.</p>}
            {card.pedido_ref ? <OrderMovements order={card.pedido_ref} enabled={open.includes(key)} /> : <p>Este registro no conserva una referencia de pedido para consultar su historial.</p>}
          </AccordionContent>
        </AccordionItem>;
      })}
    </Accordion>
  </section>)}</div>;
}

function OrderMovements({ order, enabled }: { order: string; enabled: boolean }) {
  const [events, setEvents] = useState<OrderAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true); setError(null); setEvents([]);
    (async () => {
      try {
        const response = await supabase.rpc("historial_completo_pedido_auditoria", { p_pedido: order });
        if (response.error) throw new Error(response.error.message);
        const result = response.data as unknown as OrderAuditResult;
        if (result.eventos.length !== result.total) throw new Error("No se pudo cargar el historial completo. Vuelve a intentarlo.");
        if (active) setEvents(result.eventos);
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "No se pudo cargar el historial."); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [order,enabled,retry]);
  if (loading) return <p role="status" className="flex gap-2 py-4"><Loader2 className="h-5 w-5 animate-spin" />Cargando todos los movimientos…</p>;
  if (error) return <div role="alert" className="space-y-3"><p>{error}</p><Button variant="outline" onClick={() => setRetry((value) => value + 1)}>Reintentar historial</Button></div>;
  return <div className="space-y-3"><p className="text-sm text-muted-foreground">Historial completo: {events.length} {events.length === 1 ? 'movimiento' : 'movimientos'}. Incluye todas las personas y acciones, con fecha y hora exactas de Chile. Más recientes primero.</p>{events.length ? <ol className="space-y-3" aria-label="Cronología de pedidos, más recientes primero">{events.map((event) => <li key={event.id} className="rounded-xl border bg-card p-4 space-y-3">
            <div className="flex flex-wrap gap-2 items-center justify-between"><div className="flex flex-wrap gap-2 items-center"><Badge variant="outline">{AUDIT_EVENTS[event.tipo_evento ?? ''] ?? event.tipo_evento ?? 'Registro histórico'}</Badge>
              <span>Pedido #{event.numero_pedido ?? 'sin número'}</span></div><time className="text-xs text-muted-foreground">{auditDate(event.created_at)}</time></div>
            <p className="text-sm"><strong>{event.actor_nombre ?? (event.origen_evento === 'historico' ? 'Autor histórico no registrado' : event.usuario_id ? 'Autor sin nombre registrado' : 'Sistema / integración')}</strong> · {event.sucursal_resuelta_nombre ?? event.sucursal_nombre ?? 'Sucursal sin identificar'} · Estado: {event.estado_pedido ?? 'No registrado'}</p>
            {event.sucursal_recuperada && <p className="text-xs text-muted-foreground">Sucursal recuperada del pedido actual; no registrada en el evento original.</p>}
            <p className="text-xs text-muted-foreground break-all">Turno: {event.turno_id ?? 'No registrado'} · {event.origen_evento === 'historico' ? 'Histórico: evidencia parcial' : event.origen_evento === 'automatico' ? 'Evento automático' : 'Registrado por el servidor'}{event.usuario_id && event.tomador_id && event.usuario_id !== event.tomador_id ? ' · Modificó un pedido tomado por otra persona' : ''}</p>
            <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left"><th className="p-2">Dato</th><th className="p-2">Antes</th><th className="p-2">Después</th></tr></thead>
              <tbody>{auditChanges(event).map((change) => <tr key={change.field} className="border-t align-top"><th className="p-2 font-medium text-left">{change.label}</th><td className="p-2 max-w-72 whitespace-pre-wrap break-words text-muted-foreground">{change.before}</td><td className="p-2 max-w-72 whitespace-pre-wrap break-words">{change.after}</td></tr>)}</tbody></table></div>
            {event.motivo && <p className="text-sm break-words">Motivo: {event.motivo}</p>}
          </li>)}</ol> : <p>No hay movimientos registrados para este pedido.</p>}</div>;
}
