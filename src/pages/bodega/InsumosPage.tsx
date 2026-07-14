import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, CheckCircle2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { TIPOS_INSUMO, type TipoInsumo } from "@/lib/logistica";

interface Insumo {
  id: string;
  nombre: string;
  tipo: string;
  unidad: string | null;
  formato_mayor: string | null;
  unidades_por_formato: number | null;
  ml_por_unidad: number | null;
  activo: boolean | null;
}

type Draft = {
  id?: string;
  nombre: string;
  tipo: TipoInsumo;
  unidad: string;
  tienePack: boolean;
  formato_mayor: string;
  unidades_por_formato: string;
  usaMl: boolean;
  ml_por_unidad: string;
  activo: boolean;
};

const emptyDraft: Draft = {
  nombre: "",
  tipo: "Preparación",
  unidad: "Unidad",
  tienePack: false,
  formato_mayor: "",
  unidades_por_formato: "",
  usaMl: false,
  ml_por_unidad: "",
  activo: true,
};

const fromInsumo = (i: Insumo): Draft => ({
  id: i.id,
  nombre: i.nombre,
  tipo: (TIPOS_INSUMO.includes(i.tipo as TipoInsumo) ? i.tipo : "Preparación") as TipoInsumo,
  unidad: i.unidad ?? "",
  tienePack: !!(i.formato_mayor && i.unidades_por_formato),
  formato_mayor: i.formato_mayor ?? "",
  unidades_por_formato: i.unidades_por_formato != null ? String(i.unidades_por_formato) : "",
  usaMl: i.ml_por_unidad != null && Number(i.ml_por_unidad) > 0,
  ml_por_unidad: i.ml_por_unidad != null ? String(i.ml_por_unidad) : "",
  activo: i.activo !== false,
});

export default function InsumosPage() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Insumo[]>([]);
  const [filtroTipo, setFiltroTipo] = useState<"todos" | TipoInsumo>("todos");
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const fetchAll = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("insumos")
      .select("id,nombre,tipo,unidad,formato_mayor,unidades_por_formato,ml_por_unidad,activo")
      .order("tipo")
      .order("nombre");
    if (error) toast.error("Error cargando insumos");
    setItems((data as Insumo[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (!mostrarInactivos && i.activo === false) return false;
      if (filtroTipo !== "todos" && i.tipo !== filtroTipo) return false;
      return true;
    });
  }, [items, filtroTipo, mostrarInactivos]);

  const grupos = useMemo(
    () => TIPOS_INSUMO.map((t) => ({ tipo: t, items: filtered.filter((i) => i.tipo === t) })).filter((g) => g.items.length > 0),
    [filtered],
  );

  const handleSave = async () => {
    if (!draft) return;
    if (!draft.nombre.trim()) return toast.error("El nombre es obligatorio");
    if (!draft.unidad.trim()) return toast.error("La unidad individual es obligatoria");
    if (draft.tienePack) {
      if (!draft.formato_mayor.trim()) return toast.error("Nombre del pack obligatorio");
      if (!draft.unidades_por_formato || Number(draft.unidades_por_formato) <= 0)
        return toast.error("Unidades por pack debe ser mayor a 0");
    }
    if (draft.usaMl && (!draft.ml_por_unidad || Number(draft.ml_por_unidad) <= 0))
      return toast.error("ML/GR por unidad debe ser mayor a 0");

    setSaving(true);
    const payload = {
      nombre: draft.nombre.trim(),
      tipo: draft.tipo,
      unidad: draft.unidad.trim(),
      formato_mayor: draft.tienePack ? draft.formato_mayor.trim() : null,
      unidades_por_formato: draft.tienePack ? Number(draft.unidades_por_formato) : null,
      ml_por_unidad: draft.usaMl ? Number(draft.ml_por_unidad) : null,
      activo: draft.activo,
    };
    let error;
    if (draft.id) {
      ({ error } = await supabase.from("insumos").update(payload).eq("id", draft.id));
    } else {
      ({ error } = await supabase.from("insumos").insert(payload));
    }
    setSaving(false);
    if (error) {
      toast.error(`Error guardando: ${error.message}`);
      return;
    }
    toast.success(draft.id ? "Insumo actualizado" : "Insumo creado");
    setDraft(null);
    fetchAll();
  };

  const toggleActivo = async (i: Insumo) => {
    const { error } = await supabase.from("insumos").update({ activo: !i.activo }).eq("id", i.id);
    if (error) return toast.error("No se pudo cambiar el estado");
    fetchAll();
  };

  if (loading)
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
      </div>
    );

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Insumos</h1>
          <p className="text-sm text-muted-foreground">Configuración de insumos, formatos y unidades.</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Tipo</Label>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as typeof filtroTipo)}>
              <SelectTrigger className="w-44 bg-background"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {TIPOS_INSUMO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={mostrarInactivos} onCheckedChange={setMostrarInactivos} id="show-inactive" />
            <Label htmlFor="show-inactive" className="text-xs uppercase tracking-wider text-muted-foreground">
              Mostrar inactivos
            </Label>
          </div>
          <Button onClick={() => setDraft({ ...emptyDraft })} className="gap-2">
            <Plus className="h-4 w-4" /> Nuevo Insumo
          </Button>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
          Sin insumos para mostrar.
        </div>
      ) : (
        <div className="space-y-6">
          {grupos.map((g) => (
            <div key={g.tipo} className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <h3 className="font-display text-sm uppercase tracking-widest text-muted-foreground px-2">{g.tipo}</h3>
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="bg-card border border-border rounded-xl overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-secondary/40 border-b border-border">
                    <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                      <th className="px-4 py-3">Insumo</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3">Formato Pack</th>
                      <th className="px-4 py-3 text-right">Unid/Pack</th>
                      <th className="px-4 py-3 text-right">ML o GR / Unidad</th>
                      <th className="px-4 py-3">Unidad</th>
                      <th className="px-4 py-3 text-center">Activo</th>
                      <th className="px-4 py-3 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.items.map((i) => (
                      <tr key={i.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-foreground font-medium">{i.nombre}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className="text-xs">{i.tipo}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{i.formato_mayor ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {i.unidades_por_formato ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-muted-foreground">
                          {i.ml_por_unidad != null && Number(i.ml_por_unidad) > 0 ? Number(i.ml_por_unidad) : "—"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{i.unidad ?? "—"}</td>
                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => toggleActivo(i)}
                            className="inline-flex items-center justify-center"
                            title={i.activo === false ? "Inactivo" : "Activo"}
                          >
                            {i.activo === false ? (
                              <XCircle className="h-5 w-5 text-destructive" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5 text-success" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button size="sm" variant="ghost" onClick={() => setDraft(fromInsumo(i))} className="h-8 w-8 p-0">
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(o) => !o && setDraft(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{draft?.id ? "Editar insumo" : "Nuevo insumo"}</DialogTitle>
          </DialogHeader>
          {draft && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nombre</Label>
                <Input value={draft.nombre} onChange={(e) => setDraft({ ...draft, nombre: e.target.value })} />
              </div>

              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={draft.tipo} onValueChange={(v) => setDraft({ ...draft, tipo: v as TipoInsumo })}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS_INSUMO.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm">¿Tiene formato Pack?</Label>
                  <p className="text-xs text-muted-foreground">Caja, pack, bidón, etc.</p>
                </div>
                <Switch
                  checked={draft.tienePack}
                  onCheckedChange={(v) => setDraft({ ...draft, tienePack: v })}
                />
              </div>

              {draft.tienePack && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Nombre del pack</Label>
                    <Input
                      placeholder="Caja, Pack, Bidón"
                      value={draft.formato_mayor}
                      onChange={(e) => setDraft({ ...draft, formato_mayor: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Unidades por pack</Label>
                    <Input
                      type="number" min="1" step="1"
                      value={draft.unidades_por_formato}
                      onChange={(e) => setDraft({ ...draft, unidades_por_formato: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Nombre de la unidad individual</Label>
                <Input
                  placeholder="Botella, Kilo, Unidad"
                  value={draft.unidad}
                  onChange={(e) => setDraft({ ...draft, unidad: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <div>
                  <Label className="text-sm">¿Se mide en ml o gr?</Label>
                  <p className="text-xs text-muted-foreground">Para líquidos o por peso.</p>
                </div>
                <Switch checked={draft.usaMl} onCheckedChange={(v) => setDraft({ ...draft, usaMl: v })} />
              </div>

              {draft.usaMl && (
                <div className="space-y-2">
                  <Label>ML o GR por unidad individual</Label>
                  <Input
                    type="number" min="0" step="0.01"
                    value={draft.ml_por_unidad}
                    onChange={(e) => setDraft({ ...draft, ml_por_unidad: e.target.value })}
                  />
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-border p-3">
                <Label className="text-sm">Activo</Label>
                <Switch checked={draft.activo} onCheckedChange={(v) => setDraft({ ...draft, activo: v })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDraft(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar cambios
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}