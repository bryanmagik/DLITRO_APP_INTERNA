import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turnoId: string;
  despachadorId: string;
  nombre: string;
  onRegistrado?: () => void;
}

export default function DespachoManualModal({
  open, onOpenChange, turnoId, despachadorId, nombre, onRegistrado,
}: Props) {
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setConcepto("");
    setMonto("");
  };

  const registrar = async () => {
    const conceptoTrim = concepto.trim();
    const montoNum = parseInt(monto || "0", 10);
    if (!conceptoTrim) {
      toast.error("Ingresá un concepto");
      return;
    }
    if (!Number.isFinite(montoNum) || montoNum <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("despachos_manuales").insert({
        turno_id: turnoId,
        despachador_id: despachadorId,
        concepto: conceptoTrim,
        monto: montoNum,
      });
      if (error) throw error;
      toast.success("Despacho manual registrado");
      reset();
      onOpenChange(false);
      onRegistrado?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl uppercase tracking-wider">
            Despacho manual — {nombre}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="label-upper">Concepto</Label>
            <Input
              value={concepto}
              onChange={(e) => setConcepto(e.target.value)}
              placeholder='ej: "Carrera extra", "Pedido cancelado"'
              className="bg-background"
              disabled={saving}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="label-upper">Monto</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono text-sm">$</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                className="bg-background font-mono pl-7"
                disabled={saving}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={registrar}
              disabled={saving}
              className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Registrar</>}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
