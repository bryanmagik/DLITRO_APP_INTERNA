import { useMemo, useState } from "react";
import { Check, Loader2, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  type DespachadorBusqueda,
  estaBloqueadoDespachador,
  filtrarDespachadoresBusqueda,
  nombreDespachador,
} from "@/lib/despachadoresBusqueda";

interface BuscadorDespachadoresProps {
  despachadores: DespachadorBusqueda[];
  loading?: boolean;
  excluirIds?: string[];
  turnoIdActual?: string;
  onSeleccionar: (d: DespachadorBusqueda) => void;
  seleccionados?: DespachadorBusqueda[];
  onQuitar?: (id: string) => void;
  mostrarSeleccionados?: boolean;
}

export default function BuscadorDespachadores({
  despachadores,
  loading = false,
  excluirIds = [],
  turnoIdActual,
  onSeleccionar,
  seleccionados = [],
  onQuitar,
  mostrarSeleccionados = false,
}: BuscadorDespachadoresProps) {
  const [busqueda, setBusqueda] = useState("");

  const excluir = useMemo(() => {
    const ids = new Set(excluirIds);
    if (mostrarSeleccionados) {
      seleccionados.forEach((d) => ids.add(d.id));
    }
    return ids;
  }, [excluirIds, mostrarSeleccionados, seleccionados]);

  const resultados = useMemo(
    () => filtrarDespachadoresBusqueda(despachadores, busqueda, excluir),
    [despachadores, busqueda, excluir],
  );

  const intentarSeleccionar = (d: DespachadorBusqueda) => {
    if (estaBloqueadoDespachador(d, { turnoIdActual })) {
      const suc = d.turnoActivoSucursal ?? "otra sucursal";
      toast.error(`${nombreDespachador(d)} ya está en un turno activo en ${suc}`);
      return;
    }
    onSeleccionar(d);
    setBusqueda("");
  };

  if (loading) {
    return (
      <div className="flex items-center text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando despachadores…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {mostrarSeleccionados && seleccionados.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {seleccionados.map((d) => (
            <Badge
              key={d.id}
              variant="outline"
              className="pl-2.5 pr-1 py-1.5 gap-1.5 bg-primary/10 border-primary/30 text-foreground"
            >
              <Check className="h-3 w-3 text-primary shrink-0" />
              <span className="text-sm">{nombreDespachador(d)}</span>
              {onQuitar && (
                <button
                  type="button"
                  onClick={() => onQuitar(d.id)}
                  className="rounded-full p-0.5 hover:bg-destructive/20 text-muted-foreground hover:text-destructive transition"
                  aria-label={`Quitar ${nombreDespachador(d)}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Search className="h-3.5 w-3.5" />
          Buscar despachador por nombre o RUT…
        </Label>
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Nombre o RUT…"
          className="bg-background"
          disabled={despachadores.length === 0}
        />
      </div>

      {despachadores.length === 0 ? (
        <p className="text-sm text-muted-foreground bg-secondary/30 rounded-md p-3">
          No hay despachadores activos en el sistema.
        </p>
      ) : busqueda.trim() ? (
        resultados.length === 0 ? (
          <p className="text-sm text-muted-foreground bg-secondary/30 rounded-md p-3">
            Sin resultados para &quot;{busqueda.trim()}&quot;
          </p>
        ) : (
          <div className="border border-border rounded-md divide-y divide-border max-h-64 overflow-auto">
            {resultados.map((d) => {
              const bloqueado = estaBloqueadoDespachador(d, { turnoIdActual });
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={bloqueado}
                  onClick={() => intentarSeleccionar(d)}
                  className={cn(
                    "w-full text-left px-3 py-2.5 transition text-sm",
                    bloqueado
                      ? "bg-destructive/5 cursor-not-allowed opacity-75"
                      : "hover:bg-muted/50",
                  )}
                >
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-base leading-none">
                      {bloqueado ? "🔴" : "✅"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("flex flex-wrap items-center gap-x-1 gap-y-1", bloqueado && "text-muted-foreground")}>
                        <span className={cn("font-medium", !bloqueado && "text-foreground")}>
                          {nombreDespachador(d)}
                        </span>
                        {d.rut && (
                          <span className="text-muted-foreground">— {d.rut}</span>
                        )}
                        {d.sucursal_nombre && (
                          <span className="text-muted-foreground">({d.sucursal_nombre})</span>
                        )}
                        {bloqueado && d.turnoActivoSucursal && (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-destructive/40 text-destructive bg-destructive/10">
                            En turno en {d.turnoActivoSucursal}
                          </Badge>
                        )}
                      </div>
                      {bloqueado && d.turnoActivoSucursal && (
                        <p className="text-xs text-destructive/80 mt-1 uppercase tracking-wide">
                          EN TURNO EN {d.turnoActivoSucursal.toUpperCase()}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      ) : (
        <p className="text-xs text-muted-foreground">
          Escribí nombre o RUT para buscar despachadores de cualquier sucursal.
        </p>
      )}
    </div>
  );
}
