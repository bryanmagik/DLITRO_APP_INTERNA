import { useEffect, useState } from "react";
import { Clock, Loader2, User, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Turno } from "./TurnoPage";

export default function UnirseTurnoActivo({
  turno,
  onUnirse,
}: {
  turno: Turno;
  onUnirse: () => void;
}) {
  const [tomadorNombre, setTomadorNombre] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("usuarios")
        .select("nombre, nombre_completo")
        .eq("id", turno.tomador_id)
        .maybeSingle();
      const u = data as { nombre?: string; nombre_completo?: string | null } | null;
      setTomadorNombre(u?.nombre_completo || u?.nombre || "Tomador");
      setLoading(false);
    })();
  }, [turno.tomador_id]);

  const horaApertura = turno.created_at
    ? new Date(turno.created_at).toLocaleString("es-CL", {
        weekday: "long",
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

  return (
    <div className="max-w-lg mx-auto">
      <div className="text-center mb-8">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-full bg-success/15 text-success mb-4">
          <Users className="h-8 w-8" />
        </div>
        <h1 className="font-display text-5xl text-primary tracking-wide">Turno activo</h1>
        <p className="text-muted-foreground mt-2 tracking-widest text-xs uppercase">
          Ya hay un turno abierto en esta sucursal
        </p>
      </div>

      <div className="bg-card border border-success/30 rounded-xl p-6 space-y-6">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border">
              <User className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Abierto por</div>
                <div className="font-semibold text-foreground">{tomadorNombre}</div>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-background border border-border">
              <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Hora de apertura</div>
                <div className="font-medium text-foreground capitalize">{horaApertura}</div>
              </div>
            </div>
          </div>
        )}

        <Button
          type="button"
          onClick={onUnirse}
          disabled={loading}
          className="w-full h-14 bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-widest uppercase text-lg"
        >
          Unirse al turno
        </Button>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="block w-full">
                <Button
                  type="button"
                  variant="outline"
                  disabled
                  className="w-full h-12 uppercase tracking-wider text-muted-foreground pointer-events-none"
                >
                  Abrir nuevo turno
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>
              <p>Ya hay un turno abierto en esta sucursal</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </div>
  );
}
