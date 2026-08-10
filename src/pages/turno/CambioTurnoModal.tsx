import { useEffect, useMemo, useState } from "react";
import { Loader2, X, ArrowRightLeft, AlertTriangle, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Turno } from "./TurnoPage";

const TOLERANCIA = 500;
const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

interface Usuario { id: string; nombre: string; nombre_completo: string | null }
interface PagoTurno { monto: number; metodo: string }
interface GastoLite { monto: number; metodo: string | null; concepto: string }
interface PagoDesp { total_a_pagar: number }

export default function CambioTurnoModal({
  turno, open, onOpenChange, onCambio,
}: {
  turno: Turno;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCambio: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [sucursalNombre, setSucursalNombre] = useState("");

  const [tomadores, setTomadores] = useState<Usuario[]>([]);
  const [nuevoId, setNuevoId] = useState<string>("");

  const [pagos, setPagos] = useState<PagoTurno[]>([]);
  const [gastos, setGastos] = useState<GastoLite[]>([]);
  const [pagosDesp, setPagosDesp] = useState<PagoDesp[]>([]);

  const [efectivoDeclarado, setEfectivoDeclarado] = useState("");
  const [observacion, setObservacion] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setNuevoId("");
    setEfectivoDeclarado("");
    setObservacion("");
    cargar();
    // eslint-disable-next-line
  }, [open, turno.id]);

  const cargar = async () => {
    setLoading(true);
    try {
      const [usRes, pgRes, gaRes, pdRes, suRes] = await Promise.all([
        supabase.from("usuarios")
          .select("id,nombre,nombre_completo,rol,sucursal_id,activo")
          .eq("sucursal_id", turno.sucursal_id)
          .eq("rol", "tomador_pedidos")
          .eq("activo", true),
        supabase.from("pagos_turno").select("monto,metodo").eq("turno_id", turno.id),
        supabase.from("gastos_turno").select("monto,metodo,concepto").eq("turno_id", turno.id),
        supabase.from("pago_despachadores").select("total_a_pagar").eq("turno_id", turno.id).eq("pagado", true),
        supabase.from("sucursales").select("nombre").eq("id", turno.sucursal_id).maybeSingle(),
      ]);
      const us = ((usRes.data as Usuario[]) ?? []).filter((u) => u.id !== turno.tomador_id);
      setTomadores(us);
      setPagos((pgRes.data as PagoTurno[]) ?? []);
      setGastos((gaRes.data as GastoLite[]) ?? []);
      setPagosDesp((pdRes.data as PagoDesp[]) ?? []);
      setSucursalNombre(((suRes.data as { nombre?: string } | null)?.nombre) ?? "");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error cargando datos");
    } finally {
      setLoading(false);
    }
  };

  const totalEfectivoVentas = pagos.filter((p) => p.metodo === "efectivo").reduce((a, p) => a + p.monto, 0);
  const esIngresoCaja = (c: string) => c.startsWith("Ingreso caja chica");
  const totalGastosEfectivo = gastos
    .filter((g) => g.metodo === "efectivo" && !esIngresoCaja(g.concepto))
    .reduce((a, g) => a + g.monto, 0);
  const totalPagoDesp = pagosDesp.reduce((a, p) => a + (p.total_a_pagar > 0 ? p.total_a_pagar : 0), 0);
  const efectivoEsperado = turno.caja_chica_apertura + totalEfectivoVentas - totalGastosEfectivo - totalPagoDesp;
  const declarado = parseInt(efectivoDeclarado || "0", 10) || 0;
  const diferencia = declarado - efectivoEsperado;
  const cuadra = efectivoDeclarado !== "" && Math.abs(diferencia) < TOLERANCIA;
  const descuadre = efectivoDeclarado !== "" && !cuadra;

  const nuevoNombre = useMemo(() => {
    const u = tomadores.find((t) => t.id === nuevoId);
    return u ? (u.nombre_completo || u.nombre) : "";
  }, [tomadores, nuevoId]);

  const confirmar = async () => {
    if (!nuevoId) { toast.error("Seleccioná el nuevo responsable"); return; }
    if (efectivoDeclarado === "") { toast.error("Ingresá el efectivo contado"); return; }
    if (descuadre && !observacion.trim()) { toast.error("Observación obligatoria si hay descuadre"); return; }
    setSaving(true);
    try {
      const { error: e1 } = await supabase
        .from("cambios_turno")
        .insert({
          turno_id: turno.id,
          tomador_saliente_id: turno.tomador_id,
          tomador_entrante_id: nuevoId,
          efectivo_sistema: efectivoEsperado,
          efectivo_declarado: declarado,
          diferencia,
          observacion: descuadre ? observacion.trim() : null,
        });
      if (e1) throw e1;
      const { error: e2 } = await supabase
        .from("turnos")
        .update({ tomador_id: nuevoId })
        .eq("id", turno.id);
      if (e2) throw e2;
      toast.success(`✅ Turno transferido a ${nuevoNombre}`);
      onOpenChange(false);
      onCambio();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error al transferir turno");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 bg-background border-0 flex flex-col gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border flex-row items-center justify-between space-y-0 gap-4">
          <div className="min-w-0 flex items-center gap-3">
            <div className="h-10 w-10 rounded-full border border-primary/40 bg-primary/10 text-primary flex items-center justify-center">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <DialogTitle className="font-display text-2xl uppercase tracking-wider truncate">
              Cambio de turno{sucursalNombre && ` — ${sucursalNombre}`}
            </DialogTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
            </div>
          ) : (
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Stepper */}
              <div className="flex items-center gap-3">
                {[1, 2].map((n) => (
                  <div key={n} className="flex items-center gap-2 flex-1">
                    <span className={`h-8 w-8 rounded-full flex items-center justify-center font-bold text-sm border ${step >= (n as 1|2) ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"}`}>
                      {n}
                    </span>
                    <span className={`text-xs uppercase tracking-widest ${step >= (n as 1|2) ? "text-foreground" : "text-muted-foreground"}`}>
                      {n === 1 ? "Responsable" : "Resumen de caja"}
                    </span>
                    {n === 1 && <span className="flex-1 h-px bg-border" />}
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                  <h3 className="font-display text-xl">Seleccionar nuevo responsable</h3>
                  <p className="text-sm text-muted-foreground">
                    El turno actual seguirá abierto y los pedidos / despachadores se mantienen sin cambios.
                  </p>
                  <div className="space-y-2">
                    <Label>Nuevo responsable</Label>
                    <Select value={nuevoId} onValueChange={setNuevoId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tomador de pedidos…" />
                      </SelectTrigger>
                      <SelectContent>
                        {tomadores.length === 0 ? (
                          <div className="px-3 py-2 text-sm text-muted-foreground">
                            No hay otros tomadores en esta sucursal
                          </div>
                        ) : tomadores.map((u) => (
                          <SelectItem key={u.id} value={u.id}>
                            {u.nombre_completo || u.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end pt-2">
                    <Button onClick={() => setStep(2)} disabled={!nuevoId}>
                      Continuar
                    </Button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <div className="bg-card border border-border rounded-xl p-6 space-y-3">
                    <h3 className="font-display text-xl mb-2">Resumen de caja al momento del cambio</h3>
                    <Row label="Caja chica inicial" value={fmtCLP(turno.caja_chica_apertura)} />
                    <Row label="Ingresos efectivo (ventas)" value={fmtCLP(totalEfectivoVentas)} />
                    <Row label="Gastos en efectivo" value={`- ${fmtCLP(totalGastosEfectivo)}`} negative />
                    <Row label="Pagos a despachadores" value={`- ${fmtCLP(totalPagoDesp)}`} negative />
                    <div className="border-t border-border pt-3 mt-2 flex items-center justify-between">
                      <span className="font-display text-lg uppercase tracking-wider">Efectivo en caja</span>
                      <span className="font-display text-2xl text-primary">{fmtCLP(efectivoEsperado)}</span>
                    </div>
                  </div>

                  <div className="bg-card border border-border rounded-xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground uppercase tracking-widest">Nuevo responsable</span>
                      <span className="font-display text-lg">{nuevoNombre}</span>
                    </div>
                    <div className="space-y-2">
                      <Label>¿Cuánto efectivo contás en caja?</Label>
                      <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="0"
                        value={efectivoDeclarado}
                        onChange={(e) => setEfectivoDeclarado(e.target.value)}
                        className="text-2xl h-14 font-display"
                      />
                    </div>

                    {cuadra && (
                      <div className="flex items-center gap-2 text-success bg-success/10 border border-success/30 rounded-lg p-3">
                        <Check className="h-4 w-4" /> Caja cuadra correctamente
                      </div>
                    )}

                    {descuadre && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-warning bg-warning/10 border border-warning/30 rounded-lg p-3">
                          <AlertTriangle className="h-4 w-4" />
                          Descuadre de {fmtCLP(Math.abs(diferencia))} {diferencia > 0 ? "(sobra)" : "(falta)"}
                        </div>
                        <div className="space-y-2">
                          <Label>Observación del descuadre *</Label>
                          <Textarea
                            value={observacion}
                            onChange={(e) => setObservacion(e.target.value)}
                            placeholder="Explicá el motivo del descuadre…"
                            rows={3}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex justify-between">
                    <Button variant="outline" onClick={() => setStep(1)} disabled={saving}>
                      Volver
                    </Button>
                    {cuadra ? (
                      <Button
                        onClick={confirmar}
                        disabled={saving}
                        className="bg-success hover:bg-success/90 text-success-foreground"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Confirmar cambio de turno ✓
                      </Button>
                    ) : (
                      <Button
                        onClick={confirmar}
                        disabled={saving || efectivoDeclarado === "" || (descuadre && !observacion.trim())}
                        className="bg-orange-500 hover:bg-orange-600 text-white"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                        Tomar turno con descuadre
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value, negative }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono ${negative ? "text-destructive" : "text-foreground"}`}>{value}</span>
    </div>
  );
}