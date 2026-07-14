import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Turno } from "./TurnoPage";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export const CAJA_CHICA_INGRESO_CONCEPTO = "Ingreso caja chica";

export default function AgregarCajaChicaModal({
  turno, open, onOpenChange, onAgregado,
}: {
  turno: Turno;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onAgregado: () => void;
}) {
  const { perfil } = useAuthStore();
  const [monto, setMonto] = useState("");
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setMonto(""); setMotivo(""); };

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseInt(monto, 10);
    if (Number.isNaN(m) || m <= 0) { toast.error("Monto inválido"); return; }
    if (!motivo.trim()) { toast.error("Motivo es obligatorio"); return; }
    setSaving(true);
    try {
      const nuevoTotal = turno.caja_chica_apertura + m;
      const { error: e1 } = await supabase
        .from("turnos")
        .update({ caja_chica_apertura: nuevoTotal })
        .eq("id", turno.id);
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("gastos_turno").insert({
        turno_id: turno.id,
        concepto: `${CAJA_CHICA_INGRESO_CONCEPTO} — ${motivo.trim()}`,
        monto: m,
        metodo: "efectivo",
        usuario_id: perfil?.id ?? null,
      });
      if (e2) throw e2;
      toast.success(`Caja chica reforzada con ${fmtCLP(m)}`);
      reset();
      onOpenChange(false);
      onAgregado();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Agregar caja chica</DialogTitle>
          <DialogDescription>
            Caja chica actual: <span className="font-mono text-primary">{fmtCLP(turno.caja_chica_apertura)}</span>
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={agregar} className="space-y-4">
          <div className="space-y-2">
            <Label className="label-upper">Monto a agregar $</Label>
            <Input
              type="number" min={1} value={monto}
              onChange={(e) => setMonto(e.target.value)}
              className="bg-background font-mono text-lg"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label className="label-upper">Motivo</Label>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={120}
              placeholder="Ej: Refuerzo enviado por encargado"
              className="bg-background"
            />
          </div>
          {monto && !Number.isNaN(parseInt(monto, 10)) && parseInt(monto, 10) > 0 && (
            <div className="text-sm text-muted-foreground border border-border rounded-md px-3 py-2 bg-secondary/30">
              Nuevo total: <span className="font-mono text-foreground">{fmtCLP(turno.caja_chica_apertura + parseInt(monto, 10))}</span>
            </div>
          )}
          <Button
            type="submit" disabled={saving}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" /> Agregar</>}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
