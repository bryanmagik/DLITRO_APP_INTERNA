import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Phone, Pencil, Plus, KeyRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useToast } from "@/hooks/use-toast";

interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  telefono: string | null;
  latitud: number | null;
  longitud: number | null;
  activo: boolean | null;
  clave_canje: string | null;
}

// ── Estado inicial del formulario ────────────────────────────────────────────

const FORM_VACIO = {
  nombre: "",
  direccion: "",
  latitud: "",
  longitud: "",
  telefono: "",
  activo: true,
  clave_canje: "",
};

type FormState = typeof FORM_VACIO;

// ── Modal de creación / edición ───────────────────────────────────────────────

function SucursalModal({
  open,
  sucursal,
  onClose,
  onGuardado,
}: {
  open: boolean;
  sucursal: Sucursal | null;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormState>(FORM_VACIO);
  const [guardando, setGuardando] = useState(false);
  const [errores, setErrores] = useState<Partial<Record<keyof FormState, string>>>({});

  // Poblar form cuando se abre en modo edición
  useEffect(() => {
    if (open) {
      if (sucursal) {
        setForm({
          nombre: sucursal.nombre,
          direccion: sucursal.direccion,
          latitud: sucursal.latitud != null ? String(sucursal.latitud) : "",
          longitud: sucursal.longitud != null ? String(sucursal.longitud) : "",
          telefono: sucursal.telefono ?? "",
          activo: sucursal.activo ?? true,
          clave_canje: sucursal.clave_canje ?? "",
        });
      } else {
        setForm(FORM_VACIO);
      }
      setErrores({});
    }
  }, [open, sucursal]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const validar = (): boolean => {
    const e: Partial<Record<keyof FormState, string>> = {};
    if (!form.nombre.trim()) e.nombre = "El nombre es requerido";
    if (!form.direccion.trim()) e.direccion = "La dirección es requerida";
    setErrores(e);
    return Object.keys(e).length === 0;
  };

  const guardar = async () => {
    if (!validar()) return;
    setGuardando(true);

    const payload = {
      nombre: form.nombre.trim(),
      direccion: form.direccion.trim(),
      latitud: form.latitud !== "" ? Number(form.latitud) : null,
      longitud: form.longitud !== "" ? Number(form.longitud) : null,
      telefono: form.telefono.trim() || null,
      activo: form.activo,
      clave_canje: form.clave_canje.trim() || null,
    };

    const { error } = sucursal
      ? await supabase.from("sucursales").update(payload).eq("id", sucursal.id)
      : await supabase.from("sucursales").insert(payload);

    setGuardando(false);

    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
      return;
    }

    toast({
      title: sucursal ? "Sucursal actualizada" : "Sucursal creada",
      description: `"${payload.nombre}" guardada correctamente.`,
    });
    onGuardado();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">
            {sucursal ? "Editar sucursal" : "Nueva sucursal"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Nombre */}
          <div className="space-y-1.5">
            <Label htmlFor="s-nombre">Nombre *</Label>
            <Input
              id="s-nombre"
              value={form.nombre}
              onChange={(e) => set("nombre", e.target.value)}
              placeholder="Ej: dlitro Providencia"
              className={errores.nombre ? "border-destructive" : ""}
            />
            {errores.nombre && <p className="text-xs text-destructive">{errores.nombre}</p>}
          </div>

          {/* Dirección con autocomplete */}
          <div className="space-y-1.5">
            <Label htmlFor="s-direccion">Dirección *</Label>
            <AddressAutocomplete
              value={form.direccion}
              onChange={(v) => set("direccion", v)}
              onSelect={({ address, lat, lng }) => {
                set("direccion", address);
                set("latitud", String(lat));
                set("longitud", String(lng));
              }}
              placeholder="Buscar dirección en Chile…"
              hasError={!!errores.direccion}
            />
            {errores.direccion && <p className="text-xs text-destructive">{errores.direccion}</p>}
          </div>

          {/* Lat / Lng (readonly) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="s-lat">Latitud</Label>
              <Input
                id="s-lat"
                value={form.latitud}
                readOnly
                placeholder="Auto"
                className="bg-muted text-muted-foreground cursor-default"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="s-lng">Longitud</Label>
              <Input
                id="s-lng"
                value={form.longitud}
                readOnly
                placeholder="Auto"
                className="bg-muted text-muted-foreground cursor-default"
              />
            </div>
          </div>

          {/* Teléfono */}
          <div className="space-y-1.5">
            <Label htmlFor="s-tel">Teléfono</Label>
            <Input
              id="s-tel"
              value={form.telefono}
              onChange={(e) => set("telefono", e.target.value)}
              placeholder="+56 9 XXXX XXXX"
            />
          </div>

          {/* Clave de canje */}
          <div className="space-y-1.5">
            <Label htmlFor="s-canje">Clave de canje</Label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="s-canje"
                value={form.clave_canje}
                onChange={(e) => set("clave_canje", e.target.value)}
                placeholder="Clave que autoriza canjes"
                className="pl-9"
              />
            </div>
          </div>

          {/* Activo */}
          <div className="flex items-center justify-between rounded-lg border border-border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Sucursal activa</p>
              <p className="text-xs text-muted-foreground">Visible en el sistema y en el mapa</p>
            </div>
            <Switch
              checked={form.activo}
              onCheckedChange={(v) => set("activo", v)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function SucursalesPage() {
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [sucursalEdit, setSucursalEdit] = useState<Sucursal | null>(null);

  const cargar = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sucursales")
      .select("*")
      .order("nombre");
    if (error) setError(error.message);
    setSucursales((data as Sucursal[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const abrirNueva = () => { setSucursalEdit(null); setModalOpen(true); };
  const abrirEditar = (s: Sucursal) => { setSucursalEdit(s); setModalOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-foreground tracking-wide">Sucursales</h1>
          <p className="text-muted-foreground text-sm">Sucursales dlitro activas en Santiago</p>
        </div>
        <Button onClick={abrirNueva} className="shrink-0">
          <Plus className="h-4 w-4 mr-2" />
          Nueva Sucursal
        </Button>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
        </div>
      ) : error ? (
        <div className="p-6 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
          {error}
        </div>
      ) : sucursales.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
          No hay sucursales cargadas todavía.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sucursales.map((s) => (
            <div
              key={s.id}
              className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <h3 className="font-display text-2xl text-foreground tracking-wide">
                  {s.nombre}
                </h3>
                <div className="flex items-center gap-2 shrink-0">
                  {s.activo ? (
                    <Badge className="bg-success/15 text-success border-success/30">Activa</Badge>
                  ) : (
                    <Badge variant="outline" className="text-muted-foreground">Inactiva</Badge>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => abrirEditar(s)}
                    title="Editar sucursal"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{s.direccion}</span>
                </div>
                {s.telefono && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Phone className="h-4 w-4 flex-shrink-0" />
                    <span>{s.telefono}</span>
                  </div>
                )}
                {s.clave_canje && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <KeyRound className="h-4 w-4 flex-shrink-0" />
                    <span className="font-mono text-xs">{s.clave_canje}</span>
                  </div>
                )}
                {s.latitud != null && s.longitud != null && (
                  <div className="text-xs text-muted-foreground/70 pt-1 border-t border-border">
                    {Number(s.latitud).toFixed(5)}, {Number(s.longitud).toFixed(5)}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <SucursalModal
        open={modalOpen}
        sucursal={sucursalEdit}
        onClose={() => setModalOpen(false)}
        onGuardado={cargar}
      />
    </div>
  );
}
