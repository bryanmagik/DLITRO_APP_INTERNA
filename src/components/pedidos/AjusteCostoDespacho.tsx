import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw, Route } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  construirMotivoAjuste, MOTIVOS_AJUSTE_DESPACHO,
  validarCostoDespacho, validarMotivoAjuste,
} from "@/lib/ajusteCostoDespacho";

const fmtCLP = (valor: number) => `$${Math.round(valor).toLocaleString("es-CL")}`;

interface PedidoDespachoEditable {
  id: string;
  estado: string;
  tipo: string;
  distancia_km: number | null;
  costo_despacho: number | null;
  costo_despacho_calculado: number | null;
  updated_at: string | null;
  pago_registrado: boolean | null;
}

export function AjusteCostoDespacho({ pedido, onSaved }: {
  pedido: PedidoDespachoEditable;
  onSaved: () => void;
}) {
  const calculado = pedido.costo_despacho_calculado ?? pedido.costo_despacho ?? 0;
  const cobrado = pedido.costo_despacho ?? 0;
  const [valor, setValor] = useState(String(cobrado));
  const [motivo, setMotivo] = useState("");
  const [detalle, setDetalle] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValor(String(cobrado));
    setMotivo("");
    setDetalle("");
    setConfirmando(false);
  }, [pedido.id, cobrado]);

  const costo = validarCostoDespacho(valor);
  const diferencia = (costo ?? cobrado) - calculado;
  const ajustado = cobrado !== calculado;
  const errorMotivo = costo == null ? null : validarMotivoAjuste(costo, calculado, motivo, detalle);
  const cambio = costo != null && costo !== cobrado;
  const motivoFinal = useMemo(() => construirMotivoAjuste(motivo, detalle), [motivo, detalle]);

  const solicitarConfirmacion = () => {
    if (costo == null) { toast.error("Ingresa un monto entero entre $0 y $100.000."); return; }
    if (!cambio) { toast.info("El costo cobrado no cambió."); return; }
    if (errorMotivo) { toast.error(errorMotivo); return; }
    setConfirmando(true);
  };

  const guardar = async () => {
    if (costo == null || saving) return;
    if (!pedido.updated_at) { toast.error("No se pudo verificar la versión del pedido. Recarga e intenta nuevamente."); return; }
    setSaving(true);
    const { error } = await supabase.rpc("ajustar_costo_despacho_activo", {
      p_pedido_id: pedido.id,
      p_costo_cobrado: costo,
      p_motivo: costo === calculado ? "Restaurar tarifa calculada" : motivoFinal,
      p_expected_updated_at: pedido.updated_at,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setConfirmando(false);
    toast.success(costo === calculado ? "Tarifa calculada restaurada" : "Costo de despacho actualizado");
    onSaved();
  };

  return (
    <section className="rounded-lg border border-border bg-background p-3 space-y-3" aria-labelledby="despacho-tarifa-title">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="despacho-tarifa-title" className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
            <Route className="h-3.5 w-3.5" /> Despacho y tarifa
          </h3>
          <p className="text-xs text-muted-foreground">La distancia calculada no se modifica.</p>
        </div>
        {ajustado && <span className="text-[10px] rounded-full border px-2 py-1 font-semibold">Ajuste manual</span>}
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Distancia calculada</dt>
        <dd className="text-right font-mono">{pedido.distancia_km == null ? "Sin cálculo" : `${Number(pedido.distancia_km).toLocaleString("es-CL")} km`}</dd>
        <dt className="text-muted-foreground">Tarifa calculada</dt><dd className="text-right font-mono">{fmtCLP(calculado)}</dd>
        <dt className="font-medium">Costo cobrado</dt><dd className="text-right font-mono font-semibold">{fmtCLP(cobrado)}</dd>
        <dt className="text-muted-foreground">Diferencia</dt>
        <dd className="text-right font-mono" aria-label={`Diferencia ${diferencia >= 0 ? "positiva" : "negativa"} ${fmtCLP(Math.abs(diferencia))}`}>
          {diferencia > 0 ? "+" : diferencia < 0 ? "−" : ""}{fmtCLP(Math.abs(diferencia))}
        </dd>
      </dl>

      {pedido.pago_registrado && (
        <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs" role="status">
          <AlertTriangle className="h-4 w-4 shrink-0" /> El pedido tiene pagos registrados; un cambio de total será bloqueado.
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="costo-despacho-cobrado">Costo cobrado (CLP)</Label>
        <Input id="costo-despacho-cobrado" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} disabled={saving} />
        {costo == null && <p className="text-xs text-destructive" role="alert">Usa un entero entre $0 y $100.000.</p>}
      </div>

      {costo != null && costo !== calculado && (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="motivo-ajuste-despacho">Motivo del ajuste</Label>
            <Select value={motivo} onValueChange={setMotivo} disabled={saving}>
              <SelectTrigger id="motivo-ajuste-despacho"><SelectValue placeholder="Selecciona un motivo" /></SelectTrigger>
              <SelectContent>{MOTIVOS_AJUSTE_DESPACHO.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {(motivo === "Otro" || motivo) && (
            <div className="space-y-1.5">
              <Label htmlFor="detalle-ajuste-despacho">{motivo === "Otro" ? "Detalle obligatorio" : "Detalle opcional"}</Label>
              <Textarea id="detalle-ajuste-despacho" value={detalle} onChange={(e) => setDetalle(e.target.value)} maxLength={500} rows={2} disabled={saving} />
              <p className="text-right text-[10px] text-muted-foreground">{motivoFinal.length}/500</p>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        {ajustado && costo !== calculado && (
          <Button type="button" variant="outline" size="sm" onClick={() => { setValor(String(calculado)); setMotivo(""); setDetalle(""); }} disabled={saving}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Restaurar tarifa calculada
          </Button>
        )}
        <Button type="button" size="sm" onClick={solicitarConfirmacion} disabled={saving || !cambio || costo == null}>
          Guardar costo
        </Button>
      </div>

      <AlertDialog open={confirmando} onOpenChange={(open) => !saving && setConfirmando(open)}>
        <AlertDialogContent>
          <AlertDialogHeader><AlertDialogTitle>Confirmar cambio de despacho</AlertDialogTitle>
            <AlertDialogDescription>
              El costo cobrado cambiará de {fmtCLP(cobrado)} a {fmtCLP(costo ?? cobrado)} y el total del pedido se actualizará por la misma diferencia.
            </AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel disabled={saving}>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void guardar(); }} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirmar y guardar
            </AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
