import { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  METODOS_PAGO_CORRECCION,
  crearComposicionInicial,
  normalizarComposicionPagos,
  validarComposicionPagos,
  validarMotivoCorreccion,
  type MetodoPagoCorreccion,
  type PagoActualCorreccion,
  type PagoCorreccion,
  type PedidoCorregible,
} from "./CorreccionPedidoEntregado.logic";

interface CorreccionPedidoEntregadoProps {
  pedido: PedidoCorregible;
  pagosActuales: PagoActualCorreccion[];
  onSuccess: () => void;
}

const MOTIVOS: Record<string, string> = {
  forma_pago_incorrecta: "Forma de pago incorrecta",
  error_digitacion: "Error de digitación",
  informacion_cliente: "Información del cliente",
  otro: "Otro",
};

const fmtCLP = (n: number) => new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
}).format(n);

const labelMetodoPago = (metodo: string) => ({
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
  cortesia: "Cortesía",
}[metodo] ?? metodo);

export function CorreccionPedidoEntregado({
  pedido,
  pagosActuales,
  onSuccess,
}: CorreccionPedidoEntregadoProps) {
  const [open, setOpen] = useState(false);
  const [confirmacionOpen, setConfirmacionOpen] = useState(false);
  const [pagos, setPagos] = useState<PagoCorreccion[]>([]);
  const [notas, setNotas] = useState("");
  const [motivo, setMotivo] = useState("");
  const [detalleMotivo, setDetalleMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setOpen(false);
    setConfirmacionOpen(false);
    setPagos(crearComposicionInicial(pedido, pagosActuales));
    setNotas(pedido.notas ?? "");
    setMotivo("");
    setDetalleMotivo("");
  }, [pedido, pagosActuales]);

  const totalDistribuido = useMemo(
    () => pagos.reduce((sum, pago) => sum + Number(pago.monto || 0), 0),
    [pagos],
  );
  const diferencia = Number(pedido.total) - totalDistribuido;
  const errorPagos = validarComposicionPagos(pagos, pedido.total);

  if (pedido.estado !== "entregado") return null;

  const solicitarConfirmacion = () => {
    const errorMotivo = validarMotivoCorreccion(motivo, detalleMotivo);
    if (errorMotivo) {
      toast.error(errorMotivo);
      return;
    }
    if (errorPagos) {
      toast.error(errorPagos);
      return;
    }
    const composicionActual = normalizarComposicionPagos(crearComposicionInicial(pedido, pagosActuales));
    const composicionNueva = normalizarComposicionPagos(pagos);
    if (JSON.stringify(composicionActual) === JSON.stringify(composicionNueva)
      && notas.trim() === (pedido.notas ?? "").trim()) {
      toast.error("No hay cambios para guardar");
      return;
    }
    setConfirmacionOpen(true);
  };

  const guardar = async () => {
    const motivoCompleto = [MOTIVOS[motivo], detalleMotivo.trim()].filter(Boolean).join(": ");
    setSaving(true);
    const { error } = await supabase.rpc("corregir_pagos_pedido_entregado", {
      p_pedido_id: pedido.id,
      p_pagos: normalizarComposicionPagos(pagos),
      p_notas: notas,
      p_motivo: motivoCompleto,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setConfirmacionOpen(false);
    setOpen(false);
    toast.success("Corrección guardada y registrada en auditoría");
    onSuccess();
  };

  return (
    <>
      <section className="rounded-lg border border-warning/40 bg-warning/5 p-4 space-y-4">
        {!open ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium">Pedido cerrado</p>
              <p className="text-sm text-muted-foreground">
                Puedes corregir datos administrativos sin reabrir cocina ni logística.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => setOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" /> Corregir pedido
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="font-medium">Corrección administrativa post-cierre</p>
              <p className="text-sm text-muted-foreground">
                Este pedido ya fue entregado. Los cambios quedarán registrados en auditoría.
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Composición de pago</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={pagos.length >= METODOS_PAGO_CORRECCION.length}
                  onClick={() => {
                    const disponible = METODOS_PAGO_CORRECCION.find(
                      (metodoPago) => !pagos.some((pago) => pago.metodo === metodoPago),
                    );
                    if (disponible) {
                      setPagos((actual) => [
                        ...actual,
                        { metodo: disponible, monto: Math.max(diferencia, 0), referencia: "" },
                      ]);
                    }
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Agregar método
                </Button>
              </div>
              {pagos.map((pago, index) => (
                <div key={`${index}-${pago.metodo}`} className="grid gap-2 rounded-md border border-border bg-background p-3 sm:grid-cols-[1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label htmlFor={`metodo-correccion-${pedido.id}-${index}`}>Método</Label>
                    <Select
                      value={pago.metodo}
                      onValueChange={(value) => setPagos((actual) => actual.map(
                        (item, itemIndex) => itemIndex === index
                          ? { ...item, metodo: value as MetodoPagoCorreccion }
                          : item,
                      ))}
                    >
                      <SelectTrigger id={`metodo-correccion-${pedido.id}-${index}`}><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {METODOS_PAGO_CORRECCION.map((metodoPago) => (
                          <SelectItem
                            key={metodoPago}
                            value={metodoPago}
                            disabled={pagos.some((item, itemIndex) => itemIndex !== index && item.metodo === metodoPago)}
                          >
                            {labelMetodoPago(metodoPago)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`monto-correccion-${pedido.id}-${index}`}>Monto</Label>
                    <Input
                      id={`monto-correccion-${pedido.id}-${index}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      value={pago.monto || ""}
                      onChange={(event) => setPagos((actual) => actual.map(
                        (item, itemIndex) => itemIndex === index
                          ? { ...item, monto: Number(event.target.value) }
                          : item,
                      ))}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="self-end"
                    aria-label={`Eliminar ${labelMetodoPago(pago.metodo)}`}
                    disabled={pagos.length === 1}
                    onClick={() => setPagos((actual) => actual.filter((_, itemIndex) => itemIndex !== index))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <div className="grid gap-2 rounded-md border border-border p-3 text-sm sm:grid-cols-3">
                <div><span className="text-muted-foreground">Total pedido</span><p className="font-mono font-semibold">{fmtCLP(pedido.total)}</p></div>
                <div><span className="text-muted-foreground">Total distribuido</span><p className="font-mono font-semibold">{fmtCLP(totalDistribuido)}</p></div>
                <div>
                  <span className="text-muted-foreground">Diferencia pendiente</span>
                  <p className={cn("font-mono font-semibold", diferencia === 0 ? "text-success" : "text-destructive")}>{fmtCLP(diferencia)}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor={`motivo-correccion-${pedido.id}`}>Motivo obligatorio</Label>
                <Select value={motivo} onValueChange={setMotivo}>
                  <SelectTrigger id={`motivo-correccion-${pedido.id}`}><SelectValue placeholder="Selecciona un motivo" /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(MOTIVOS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`detalle-correccion-${pedido.id}`}>Detalle del motivo {motivo === "otro" ? "(obligatorio)" : "(opcional)"}</Label>
                <Textarea id={`detalle-correccion-${pedido.id}`} value={detalleMotivo} onChange={(event) => setDetalleMotivo(event.target.value)} rows={2} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={`notas-correccion-${pedido.id}`}>Observaciones administrativas</Label>
              <Textarea id={`notas-correccion-${pedido.id}`} value={notas} onChange={(event) => setNotas(event.target.value)} rows={3} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={saving} onClick={() => setOpen(false)}>Cancelar</Button>
              <Button type="button" disabled={saving || !!errorPagos} onClick={solicitarConfirmacion}>Revisar corrección</Button>
            </div>
          </div>
        )}
      </section>

      <AlertDialog open={confirmacionOpen} onOpenChange={setConfirmacionOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar corrección post-cierre</AlertDialogTitle>
            <AlertDialogDescription>
              El pedido seguirá entregado. Los cambios quedarán auditados y no se reactivará cocina ni logística.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={saving} onClick={(event) => { event.preventDefault(); void guardar(); }}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirmar y guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
