import { useEffect, useMemo, useState } from "react";
import { Loader2, Bike, Check, ChevronDown, Wallet, ClipboardList, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import PedidosDespachadorModal from "@/components/PedidosDespachadorModal";
import DespachoManualModal from "@/components/DespachoManualModal";

export interface Tarifa { id: string; horas: number; descripcion: string; monto: number }

export interface PrestamoInfo {
  id: string;
  monto: number;
  devuelto: boolean;
}

export interface PagarDespachadorProps {
  turnoId: string;
  td: {
    id: string;
    despachador_id: string;
    hora_entrada: string | null;
    hora_salida: string | null;
    pagado: boolean | null;
  };
  nombre: string;
  entregados: number;
  cobrado: number;
  /** Monto de despachos_manuales del turno (se suma al pago). */
  manuales?: number;
  /** Si ya hay un pago registrado (p. ej. al reabrir el modal). */
  montoYaPagado?: number | null;
  /** Todos los préstamos del despachador en este turno. */
  prestamos?: PrestamoInfo[];
  onPrestamoChange?: () => void;
  onManualesChange?: () => void;
  onPagado?: (totalPagado: number) => void;
  expanded?: boolean;
  onToggle?: (open: boolean) => void;
  /** true = pago anticipado antes de cerrar el turno (libera al despachador para otra sucursal) */
  cierreParcial?: boolean;
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export default function PagarDespachadorCard({
  turnoId, td, nombre, entregados, cobrado, manuales = 0, montoYaPagado, prestamos = [], onPrestamoChange, onManualesChange, onPagado, expanded, onToggle, cierreParcial = false,
}: PagarDespachadorProps) {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [tarifaSeleccionada, setTarifaSeleccionada] = useState<Tarifa | null>(null);
  const [bono, setBono] = useState<string>("0");
  const [saving, setSaving] = useState(false);
  const [pagado, setPagado] = useState<boolean>(!!td.pagado);
  const [pagadoEnCero, setPagadoEnCero] = useState(!!td.pagado && (montoYaPagado ?? null) === 0);
  const [montoPrestamo, setMontoPrestamo] = useState<string>("");
  const [prestamoSaving, setPrestamoSaving] = useState(false);
  const [pedidosOpen, setPedidosOpen] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [internalOpen, setInternalOpen] = useState<boolean>(!td.pagado && expanded === undefined ? false : false);
  const isControlled = expanded !== undefined;
  const open = isControlled ? !!expanded : internalOpen;
  const setOpen = (o: boolean) => {
    if (isControlled) onToggle?.(o);
    else setInternalOpen(o);
  };

  useEffect(() => {
    if (!td.pagado) return;
    if (montoYaPagado === 0) setPagadoEnCero(true);
    else if (montoYaPagado != null && montoYaPagado > 0) setPagadoEnCero(false);
  }, [td.pagado, montoYaPagado]);

  const horasReales = useMemo(() => {
    if (!td.hora_entrada) return 0;
    const fin = td.hora_salida ? new Date(td.hora_salida) : new Date();
    return Math.max(0, (fin.getTime() - new Date(td.hora_entrada).getTime()) / 3600000);
  }, [td.hora_entrada, td.hora_salida]);

  useEffect(() => {
    let cancel = false;
    (async () => {
      const { data } = await supabase.from("tarifas_despachador").select("*").order("horas");
      if (cancel) return;
      const list = (data as Tarifa[]) ?? [];
      setTarifas(list);
      const sug = [...list].sort((a, b) => a.horas - b.horas).filter((t) => t.horas <= horasReales).pop() ?? list[0] ?? null;
      setTarifaSeleccionada(sug);
    })();
    return () => { cancel = true; };
  }, [horasReales]);

  const prestamosPendientes = useMemo(
    () => prestamos.filter((p) => !p.devuelto),
    [prestamos],
  );
  const descuentoPrestamo = prestamosPendientes.reduce((acc, p) => acc + p.monto, 0);

  const base = tarifaSeleccionada?.monto ?? 0;
  const bonoNum = parseInt(bono || "0", 10) || 0;
  const totalDespachos = cobrado + manuales;
  const totalAPagar = base + bonoNum + totalDespachos - descuentoPrestamo;

  const registrarPrestamo = async () => {
    const monto = parseInt(montoPrestamo || "0", 10) || 0;
    if (monto <= 0) { toast.error("Ingresá un monto válido"); return; }
    setPrestamoSaving(true);
    try {
      const { error } = await supabase.from("prestamos_despachador").insert({
        turno_id: turnoId,
        despachador_id: td.despachador_id,
        monto,
        devuelto: false,
      });
      if (error) throw error;
      toast.success("Préstamo registrado");
      setMontoPrestamo("");
      onPrestamoChange?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setPrestamoSaving(false);
    }
  };

  const marcarPrestamosDevueltos = async () => {
    if (prestamosPendientes.length === 0) return;
    setPrestamoSaving(true);
    try {
      const { error } = await supabase
        .from("prestamos_despachador")
        .update({ devuelto: true })
        .in("id", prestamosPendientes.map((p) => p.id));
      if (error) throw error;
      toast.success(
        prestamosPendientes.length === 1
          ? "Vuelto devuelto"
          : `${prestamosPendientes.length} préstamos marcados como devueltos`,
      );
      onPrestamoChange?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setPrestamoSaving(false);
    }
  };

  const marcar = async (opts?: { forzarCero?: boolean }) => {
    const forzarCero = !!opts?.forzarCero;
    const montoFinal = forzarCero ? 0 : totalAPagar;
    if (montoFinal < 0) {
      toast.error("El total a pagar no puede ser negativo");
      return;
    }
    if (!forzarCero && !tarifaSeleccionada) {
      toast.error("Selecciona una tarifa");
      return;
    }
    setSaving(true);
    try {
      const ahora = new Date().toISOString();
      const { error: e1 } = await supabase
        .from("turno_despachadores")
        .update({ pagado: true, activo: false, hora_salida: ahora })
        .eq("turno_id", turnoId)
        .eq("despachador_id", td.despachador_id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("pago_despachadores").insert({
        turno_id: turnoId,
        despachador_id: td.despachador_id,
        horas_trabajadas: forzarCero ? 0 : (tarifaSeleccionada?.horas ?? 0),
        valor_hora: 0,
        base_por_horas: forzarCero ? 0 : base,
        bono: forzarCero ? 0 : bonoNum,
        total_a_pagar: montoFinal,
        pedidos_entregados: forzarCero ? 0 : entregados,
        total_despachos_cobrados: forzarCero ? 0 : totalDespachos,
        pagado: true,
        cierre_parcial: cierreParcial,
        fecha_pago: ahora,
      });
      if (e2) throw e2;

      // Si el préstamo se descontó del pago, marcarlo cobrado (evita doble egreso en caja).
      // No aplica a "No pagar ahora ($0)" — ahí no se descontó nada.
      if (!forzarCero && prestamosPendientes.length > 0) {
        const { error: e3 } = await supabase
          .from("prestamos_despachador")
          .update({ devuelto: true })
          .in("id", prestamosPendientes.map((p) => p.id));
        if (e3) throw e3;
        onPrestamoChange?.();
      }

      if (forzarCero || montoFinal === 0) {
        setBono("0");
        if (forzarCero) setTarifaSeleccionada(null);
        setPagadoEnCero(true);
      }
      setPagado(true);
      toast.success(
        forzarCero || montoFinal === 0
          ? `${nombre}: no pagado este turno ($0)`
          : `${nombre} pagado`,
      );
      setOpen(false);
      onPagado?.(montoFinal);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={`rounded-xl overflow-hidden transition-colors border ${
        pagadoEnCero
          ? "border-warning/50 bg-warning/5"
          : pagado
            ? "border-success/40 bg-card"
            : "border-border bg-card"
      }`}
    >
      <div className="flex items-stretch">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={`flex-1 min-w-0 flex items-center justify-between gap-3 p-4 transition-colors text-left ${
              pagadoEnCero ? "hover:bg-warning/10" : "hover:bg-secondary/30"
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ChevronDown className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : "-rotate-90"}`} />
              <Bike className={`h-5 w-5 shrink-0 ${pagadoEnCero ? "text-warning" : "text-primary"}`} />
              <h3 className="font-display text-lg uppercase tracking-wider truncate">{nombre}</h3>
              {pagadoEnCero && (
                <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded border border-warning/50 bg-warning/15 text-warning shrink-0">
                  ⏳ Pago pendiente
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-xs text-muted-foreground font-mono">{entregados} pedidos</span>
              {pagado ? (
                pagadoEnCero ? (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded border border-warning/50 bg-warning/15 text-warning">
                    $0
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded border border-success/40 bg-success/10 text-success">
                    <Check className="h-3 w-3" /> Pagado
                  </span>
                )
              ) : (
                <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded border border-warning/40 bg-warning/10 text-warning">
                  Pendiente
                </span>
              )}
            </div>
          </button>
        </CollapsibleTrigger>
        <div className="flex items-center pr-3 gap-1.5 shrink-0 border-l border-border/60">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 text-[10px] uppercase tracking-wider gap-1"
            onClick={() => setPedidosOpen(true)}
          >
            <ClipboardList className="h-3.5 w-3.5" />
            Ver pedidos
          </Button>
          {!pagado && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-[10px] uppercase tracking-wider gap-1 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => setManualOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Despacho manual
            </Button>
          )}
        </div>
      </div>
      <CollapsibleContent className="data-[state=open]:animate-accordion-down data-[state=closed]:animate-accordion-up">
        <div className="border-t border-border p-3 sm:p-4 bg-background/40">
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Pedidos entregados</span>
          <span className="font-mono text-foreground">{entregados}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Despachos de pedidos</span>
          <span className="font-mono text-foreground">{fmtCLP(cobrado)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Despachos manuales</span>
          <span className="font-mono text-foreground">{fmtCLP(manuales)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total despachos cobrados</span>
          <span className="font-mono text-success">{fmtCLP(totalDespachos)}</span>
        </div>
        <p className="text-[11px] text-muted-foreground italic">
          El despachador trae este dinero al local; se suma a su pago.
        </p>
      </div>

      <div className="mt-4 space-y-2">
        <Label className="label-upper">Horas trabajadas</Label>
        <p className="text-xs text-muted-foreground">
          Reales: <span className="font-mono">{horasReales.toFixed(2)} h</span>
        </p>
        <div className="grid grid-cols-1 min-[440px]:grid-cols-2 sm:grid-cols-3 gap-2">
          {tarifas.map((t) => {
            const sel = tarifaSeleccionada?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={pagado}
                onClick={() => setTarifaSeleccionada(t)}
                className={`p-2 rounded-md border text-left transition disabled:opacity-60 ${sel ? "border-primary bg-primary/10" : "border-border bg-background hover:border-primary/60"}`}
              >
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.descripcion}</div>
                <div className="font-mono text-sm text-foreground">{fmtCLP(t.monto)}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 min-[440px]:grid-cols-2 gap-3 min-[440px]:items-end">
        <div>
          <Label className="label-upper">Base por horas</Label>
          <div className="font-mono text-lg text-foreground mt-1">{fmtCLP(base)}</div>
        </div>
        <div>
          <Label className="label-upper">Bono (opcional)</Label>
          <Input
            type="number" value={bono} disabled={pagado}
            onChange={(e) => setBono(e.target.value)}
            className="bg-background font-mono mt-1"
          />
        </div>
      </div>

      {/* Préstamo de vuelto */}
      <div className="mt-4 rounded-md border border-border bg-background p-3">
        <div className="flex items-center gap-2 mb-2">
          <Wallet className="h-4 w-4 text-primary" />
          <span className="label-upper">Préstamo de vuelto</span>
        </div>
        {prestamosPendientes.length > 0 ? (
          <div className="space-y-2">
            {prestamosPendientes.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Monto prestado</span>
                <span className="font-mono text-foreground">{fmtCLP(p.monto)}</span>
              </div>
            ))}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estado</span>
              <span className="font-bold uppercase text-xs tracking-wider text-destructive">
                ❌ No devuelto{prestamosPendientes.length > 1 ? ` (${prestamosPendientes.length})` : ""}
              </span>
            </div>
            {!pagado && (
              <Button
                onClick={marcarPrestamosDevueltos}
                disabled={prestamoSaving}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {prestamoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-2" /> Devolvió el vuelto</>}
              </Button>
            )}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-border">
              <span className="text-muted-foreground">Descuento préstamo</span>
              <span className="font-mono text-destructive">- {fmtCLP(descuentoPrestamo)}</span>
            </div>
            {!pagado && (
              <div className="grid grid-cols-1 min-[440px]:grid-cols-[minmax(0,1fr)_auto] min-[440px]:items-end gap-2 pt-2 border-t border-border">
                <div className="flex-1">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={montoPrestamo}
                    onChange={(e) => setMontoPrestamo(e.target.value)}
                    placeholder="Otro préstamo…"
                    className="bg-background font-mono"
                  />
                </div>
                <Button
                  onClick={registrarPrestamo}
                  disabled={prestamoSaving || !montoPrestamo}
                  size="sm"
                  variant="outline"
                  className="w-full min-[440px]:w-auto uppercase text-xs tracking-wider"
                >
                  {prestamoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Agregar"}
                </Button>
              </div>
            )}
          </div>
        ) : prestamos.some((p) => p.devuelto) ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Estado</span>
              <span className="font-bold uppercase text-xs tracking-wider text-success">✅ Devuelto</span>
            </div>
            {!pagado && (
              <div className="grid grid-cols-1 min-[440px]:grid-cols-[minmax(0,1fr)_auto] min-[440px]:items-end gap-2 pt-2 border-t border-border">
                <div className="flex-1">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={montoPrestamo}
                    onChange={(e) => setMontoPrestamo(e.target.value)}
                    placeholder="0"
                    className="bg-background font-mono"
                  />
                </div>
                <Button
                  onClick={registrarPrestamo}
                  disabled={prestamoSaving || !montoPrestamo}
                  size="sm"
                  className="w-full min-[440px]:w-auto bg-primary text-primary-foreground hover:bg-primary/90 uppercase text-xs tracking-wider"
                >
                  {prestamoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
                </Button>
              </div>
            )}
          </div>
        ) : (
          !pagado && (
            <div className="grid grid-cols-1 min-[440px]:grid-cols-[minmax(0,1fr)_auto] min-[440px]:items-end gap-2">
              <div className="flex-1">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={montoPrestamo}
                  onChange={(e) => setMontoPrestamo(e.target.value)}
                  placeholder="0"
                  className="bg-background font-mono"
                />
              </div>
              <Button
                onClick={registrarPrestamo}
                disabled={prestamoSaving || !montoPrestamo}
                size="sm"
                className="w-full min-[440px]:w-auto bg-primary text-primary-foreground hover:bg-primary/90 uppercase text-xs tracking-wider"
              >
                {prestamoSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Registrar"}
              </Button>
            </div>
          )
        )}
      </div>

      <div className="border-t border-border mt-4 pt-3 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs text-muted-foreground uppercase tracking-wider">Total a pagar</span>
        <span className="font-mono text-2xl text-primary">{fmtCLP(totalAPagar)}</span>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1 text-right">
        {fmtCLP(base)} base{bonoNum > 0 && ` + ${fmtCLP(bonoNum)} bono`} + {fmtCLP(totalDespachos)} despachos
        {descuentoPrestamo > 0 && ` − ${fmtCLP(descuentoPrestamo)} préstamo`}
      </p>
      <p className="text-[10px] text-muted-foreground mt-1 text-right uppercase tracking-wider">
        Pago siempre en efectivo
      </p>

      {!pagado && (
        <div className="mt-3 space-y-2">
          <Button
            onClick={() => marcar()}
            disabled={saving || !tarifaSeleccionada || totalAPagar < 0}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Check className="h-4 w-4 mr-2" /> Marcar como pagado</>}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => marcar({ forzarCero: true })}
            disabled={saving}
            className="w-full uppercase tracking-wider font-bold text-muted-foreground"
          >
            No pagar ahora ($0)
          </Button>
        </div>
      )}
        </div>
      </CollapsibleContent>
    </Collapsible>
    <PedidosDespachadorModal
      open={pedidosOpen}
      onOpenChange={setPedidosOpen}
      turnoId={turnoId}
      despachadorId={td.despachador_id}
      nombre={nombre}
      onManualesChange={onManualesChange}
    />
    <DespachoManualModal
      open={manualOpen}
      onOpenChange={setManualOpen}
      turnoId={turnoId}
      despachadorId={td.despachador_id}
      nombre={nombre}
      onRegistrado={onManualesChange}
    />
    </>
  );
}
