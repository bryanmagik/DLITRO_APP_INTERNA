import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import InventarioInsumosTable, {
  type InventarioRow,
  calcCantidadReal,
  conteoTextoRow,
  filaCompleta,
} from "./InventarioInsumosTable";

interface Insumo {
  id: string; nombre: string; unidad: string | null; tipo: string;
  formato_mayor: string | null; unidades_por_formato: number | null; ml_por_unidad: number | null;
}

export default function RealizarInventarioModal({
  open, onOpenChange, turnoId, sucursalId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  turnoId: string;
  sucursalId: string;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [inv, setInv] = useState<InventarioRow[]>([]);

  useEffect(() => {
    if (!open) return;
    setMotivo("");
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("insumos")
        .select("id,nombre,unidad,tipo,formato_mayor,unidades_por_formato,ml_por_unidad")
        .eq("activo", true).order("nombre");
      if (!alive) return;
      const insumos = (data as Insumo[]) ?? [];
      setInv(insumos.map((i) => ({
        insumo_id: i.id,
        nombre: i.nombre,
        unidad: i.unidad ?? "",
        tipo: i.tipo,
        formato_mayor: i.formato_mayor ?? null,
        unidades_por_formato: i.unidades_por_formato != null ? Number(i.unidades_por_formato) : null,
        ml_por_unidad: i.ml_por_unidad != null ? Number(i.ml_por_unidad) : null,
        cantidadReal: 0,
        contado: false,
      })));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [open]);

  const updateInv = (id: string, patch: Partial<Pick<InventarioRow, "cantidadReal" | "contado">>) =>
    setInv((prev) => prev.map((r) => r.insumo_id === id ? { ...r, ...patch } : r));

  const todosListos = inv.length > 0 && inv.every(filaCompleta);

  const guardar = async () => {
    if (!motivo.trim()) {
      toast.error("Indicá el motivo del inventario");
      return;
    }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const { data: inv1, error: e1 } = await supabase
        .from("inventarios_parciales")
        .insert({
          turno_id: turnoId,
          sucursal_id: sucursalId,
          usuario_id: userRes.user?.id ?? null,
          motivo: motivo.trim(),
        })
        .select("id")
        .single();
      if (e1) throw e1;
      const items = inv.map((r) => ({
        inventario_id: (inv1 as { id: string }).id,
        insumo_id: r.insumo_id,
        cantidad_real: calcCantidadReal(r),
        conteo_original: conteoTextoRow(r),
      }));
      const { error: e2 } = await supabase.from("inventarios_parciales_items").insert(items);
      if (e2) throw e2;
      toast.success("✅ Inventario guardado");
      onOpenChange(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error guardando inventario");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background border-border max-w-none w-screen h-screen sm:rounded-none p-0 flex flex-col">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="font-display text-2xl">Realizar inventario</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="space-y-2 max-w-3xl">
            <Label className="label-upper">Motivo del inventario *</Label>
            <Textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ej: Solicitado por logística"
              rows={2}
              className="bg-card"
            />
          </div>
          {loading ? (
            <div className="p-12 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
            </div>
          ) : (
            <InventarioInsumosTable inv={inv} updateInv={updateInv} />
          )}
        </div>
        <div className="border-t border-border px-6 py-4 flex items-center justify-between bg-card gap-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={guardar}
            disabled={!todosListos || saving || !motivo.trim()}
            size="lg"
            className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold px-8"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar inventario"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}