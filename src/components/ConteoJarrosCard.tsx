import { useId } from "react";
import { Beer } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  fechaConteoJarros,
  type ConteoJarrosForm,
} from "@/lib/conteoJarros";

type CampoConteo = keyof ConteoJarrosForm;

const CAMPOS: Array<{ key: CampoConteo; label: string }> = [
  { key: "cajasConSticker", label: "Cajas de jarros con sticker" },
  { key: "cajasSinSticker", label: "Cajas de jarros sin stickers" },
  { key: "jarrosSueltos", label: "Jarros sueltos" },
  { key: "jarrosRotos", label: "Jarros rotos" },
];

export default function ConteoJarrosCard({
  sucursalNombre,
  value,
  onChange,
  disabled,
  fecha = new Date(),
  momento = "Inventario",
}: {
  sucursalNombre: string;
  value: ConteoJarrosForm;
  onChange: (next: ConteoJarrosForm) => void;
  disabled?: boolean;
  fecha?: Date;
  momento?: string;
}) {
  const id = useId();

  return (
    <fieldset className="space-y-4 rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
      <legend className="px-2 font-display text-xl text-primary">
        <span className="inline-flex items-center gap-2">
          <Beer className="h-5 w-5" aria-hidden="true" /> Conteo diario de jarros
        </span>
      </legend>

      <dl className="grid gap-2 rounded-lg border border-border bg-card p-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Sucursal</dt>
          <dd className="font-semibold text-foreground">{sucursalNombre}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Fecha</dt>
          <dd className="font-semibold capitalize text-foreground">{fechaConteoJarros(fecha)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wider text-muted-foreground">Momento</dt>
          <dd className="font-semibold text-foreground">{momento}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        Módulo opcional. Si ingresás un valor, completá los cuatro campos.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {CAMPOS.map((campo) => {
          const inputId = `${id}-${campo.key}`;
          return (
            <div key={campo.key} className="space-y-2">
              <Label htmlFor={inputId}>{campo.label}</Label>
              <Input
                id={inputId}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                required
                disabled={disabled}
                value={value[campo.key]}
                onChange={(event) => onChange({ ...value, [campo.key]: event.target.value })}
                placeholder="0"
                className="h-11 bg-background text-right font-mono text-lg"
              />
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}
