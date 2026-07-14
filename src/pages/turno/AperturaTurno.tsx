import { useEffect, useState } from "react";
import { Loader2, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import BuscadorDespachadores from "@/components/BuscadorDespachadores";
import {
  type DespachadorBusqueda,
  fetchDespachadoresGlobales,
} from "@/lib/despachadoresBusqueda";

export default function AperturaTurno({ sucursalId, onAbierto }: { sucursalId: string; onAbierto: () => void }) {
  const { perfil } = useAuthStore();
  const [despachadores, setDespachadores] = useState<DespachadorBusqueda[]>([]);
  const [seleccionados, setSeleccionados] = useState<DespachadorBusqueda[]>([]);
  const [cajaChica, setCajaChica] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await fetchDespachadoresGlobales();
      if (error) {
        console.error("[AperturaTurno] error cargando despachadores:", error);
        toast.error(`Error cargando despachadores: ${error}`);
      }
      setDespachadores(data);
      setLoading(false);
    })();
  }, []);

  const agregar = (d: DespachadorBusqueda) => {
    if (seleccionados.some((s) => s.id === d.id)) return;
    setSeleccionados((prev) => [...prev, d]);
  };

  const quitar = (id: string) => {
    setSeleccionados((prev) => prev.filter((d) => d.id !== id));
  };

  const abrir = async (e: React.FormEvent) => {
    e.preventDefault();
    const monto = parseInt(cajaChica || "0", 10);
    if (Number.isNaN(monto) || monto < 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    if (!perfil) return;
    setSaving(true);
    try {
      const { data: existente } = await supabase
        .from("turnos")
        .select("id")
        .eq("sucursal_id", sucursalId)
        .eq("estado", "abierto")
        .maybeSingle();
      if (existente) {
        toast.error("Ya hay un turno abierto en esta sucursal");
        onAbierto();
        return;
      }

      const { data: turno, error } = await supabase
        .from("turnos")
        .insert({
          sucursal_id: sucursalId,
          tomador_id: perfil.id,
          caja_chica_apertura: monto,
          estado: "abierto",
        })
        .select()
        .single();
      if (error) throw error;

      if (seleccionados.length > 0 && turno) {
        const rows = seleccionados.map((d) => ({
          turno_id: turno.id,
          despachador_id: d.id,
          activo: true,
        }));
        const { error: errD } = await supabase.from("turno_despachadores").insert(rows);
        if (errD) throw errD;
      }
      toast.success("Turno abierto");
      onAbierto();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo abrir el turno");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="text-center mb-8">
        <h1 className="font-display text-5xl text-primary tracking-wide">Abrir turno</h1>
        <p className="text-muted-foreground mt-2 tracking-widest text-xs uppercase">
          Configurá la caja y el equipo del día
        </p>
      </div>

      <form onSubmit={abrir} className="bg-card border border-border rounded-xl p-6 space-y-6">
        <div className="space-y-2">
          <Label className="label-upper">Monto caja chica (CLP)</Label>
          <Input
            type="number"
            min={0}
            step={1000}
            value={cajaChica}
            onChange={(e) => setCajaChica(e.target.value)}
            placeholder="0"
            required
            className="bg-background h-12 text-2xl font-mono"
          />
        </div>

        <div className="space-y-3">
          <Label className="label-upper flex items-center gap-2">
            <Bike className="h-4 w-4" /> Despachadores que trabajan hoy
          </Label>

          <BuscadorDespachadores
            despachadores={despachadores}
            loading={loading}
            seleccionados={seleccionados}
            onSeleccionar={agregar}
            onQuitar={quitar}
            mostrarSeleccionados
          />
        </div>

        <Button
          type="submit"
          disabled={saving}
          className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest uppercase text-lg"
        >
          {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : "Abrir turno"}
        </Button>
      </form>
    </div>
  );
}
