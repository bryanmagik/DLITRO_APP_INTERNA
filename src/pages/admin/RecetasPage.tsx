import { useEffect, useMemo, useState } from "react";
import { Loader2, Trash2, Plus, Check, X, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Categoria { id: string; nombre: string; orden: number | null }
interface Producto { id: string; nombre: string; activo: boolean | null; categoria_id: string | null }
interface Insumo { id: string; nombre: string; unidad: string | null; activo: boolean | null }
interface Receta { id: string; producto_id: string; insumo_id: string; cantidad: number }

export default function RecetasPage() {
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const [nuevoInsumoId, setNuevoInsumoId] = useState<string>("");
  const [nuevaCantidad, setNuevaCantidad] = useState<string>("");

  const load = async () => {
    const [cRes, pRes, iRes] = await Promise.all([
      supabase.from("categorias").select("*").order("orden"),
      supabase.from("productos").select("id,nombre,activo,categoria_id").eq("activo", true).order("nombre"),
      supabase.from("insumos").select("id,nombre,unidad,activo").eq("activo", true).order("nombre"),
    ]);
    setCategorias((cRes.data as Categoria[]) ?? []);
    setProductos((pRes.data as Producto[]) ?? []);
    setInsumos((iRes.data as Insumo[]) ?? []);
    setLoading(false);
  };

  const loadRecetas = async (productoId: string) => {
    const { data, error } = await supabase
      .from("recetas")
      .select("*")
      .eq("producto_id", productoId);
    if (error) { toast.error(error.message); return; }
    setRecetas((data as Receta[]) ?? []);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (selectedId) loadRecetas(selectedId);
    else setRecetas([]);
  }, [selectedId]);

  const productosPorCategoria = useMemo(() => {
    const map = new Map<string, Producto[]>();
    for (const p of productos) {
      const key = p.categoria_id ?? "_sin";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [productos]);

  const selected = productos.find((p) => p.id === selectedId) ?? null;
  const insumoById = (id: string) => insumos.find((i) => i.id === id);

  const insumosDisponibles = insumos.filter(
    (i) => !recetas.some((r) => r.insumo_id === i.id)
  );

  const handleSaveCantidad = async (recetaId: string) => {
    const val = parseFloat(editValue);
    if (isNaN(val) || val <= 0) { toast.error("Cantidad inválida"); return; }
    const { error } = await supabase.from("recetas").update({ cantidad: val }).eq("id", recetaId);
    if (error) { toast.error(error.message); return; }
    toast.success("Cantidad actualizada");
    setEditingId(null);
    if (selectedId) loadRecetas(selectedId);
  };

  const handleDelete = async (recetaId: string) => {
    const { error } = await supabase.from("recetas").delete().eq("id", recetaId);
    if (error) { toast.error(error.message); return; }
    toast.success("Insumo eliminado de la receta");
    if (selectedId) loadRecetas(selectedId);
  };

  const handleAdd = async () => {
    if (!selectedId || !nuevoInsumoId) { toast.error("Seleccioná insumo"); return; }
    const val = parseFloat(nuevaCantidad);
    if (isNaN(val) || val <= 0) { toast.error("Cantidad inválida"); return; }
    const { error } = await supabase.from("recetas").insert({
      producto_id: selectedId,
      insumo_id: nuevoInsumoId,
      cantidad: val,
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Insumo agregado");
    setNuevoInsumoId("");
    setNuevaCantidad("");
    loadRecetas(selectedId);
  };

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-foreground tracking-wide">Recetas</h1>
        <p className="text-muted-foreground text-sm">Insumos consumidos por cada producto</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
        {/* Sidebar productos */}
        <div className="bg-card border border-border rounded-xl overflow-hidden max-h-[70vh] overflow-y-auto">
          {categorias.map((cat) => {
            const items = productosPorCategoria.get(cat.id) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={cat.id}>
                <div className="px-4 py-2 bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                  {cat.nombre}
                </div>
                {items.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedId(p.id)}
                    className={`w-full text-left px-4 py-2.5 text-sm border-b border-border last:border-0 hover:bg-secondary/20 ${
                      selectedId === p.id ? "bg-primary/10 text-primary font-semibold" : "text-foreground"
                    }`}
                  >
                    {p.nombre}
                  </button>
                ))}
              </div>
            );
          })}
        </div>

        {/* Panel receta */}
        <div className="bg-card border border-border rounded-xl p-6">
          {!selected ? (
            <div className="text-muted-foreground text-center py-12">
              Seleccioná un producto para ver su receta
            </div>
          ) : (
            <>
              <h2 className="font-display text-2xl text-foreground mb-4">{selected.nombre}</h2>

              <table className="w-full text-sm mb-6">
                <thead className="border-b border-border">
                  <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="py-2">Insumo</th>
                    <th className="py-2 w-32">Cantidad</th>
                    <th className="py-2 w-20">Unidad</th>
                    <th className="py-2 w-24 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {recetas.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-muted-foreground">
                        Esta receta no tiene insumos cargados.
                      </td>
                    </tr>
                  ) : recetas.map((r) => {
                    const ins = insumoById(r.insumo_id);
                    const isEditing = editingId === r.id;
                    return (
                      <tr key={r.id} className="border-b border-border last:border-0">
                        <td className="py-2.5 text-foreground">{ins?.nombre ?? "—"}</td>
                        <td className="py-2.5">
                          {isEditing ? (
                            <Input
                              autoFocus
                              type="number"
                              step="0.01"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveCantidad(r.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                              className="h-8 w-24"
                            />
                          ) : (
                            <span
                              className="font-mono cursor-pointer hover:text-primary"
                              onClick={() => { setEditingId(r.id); setEditValue(String(r.cantidad)); }}
                            >
                              {r.cantidad}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-muted-foreground">{ins?.unidad ?? "—"}</td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isEditing ? (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleSaveCantidad(r.id)}>
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditingId(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(r.id); setEditValue(String(r.cantidad)); }}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(r.id)}>
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="border-t border-border pt-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Agregar insumo</div>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={nuevoInsumoId} onValueChange={setNuevoInsumoId}>
                    <SelectTrigger className="w-64">
                      <SelectValue placeholder="Elegir insumo…" />
                    </SelectTrigger>
                    <SelectContent>
                      {insumosDisponibles.map((i) => (
                        <SelectItem key={i.id} value={i.id}>
                          {i.nombre} {i.unidad ? `(${i.unidad})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Cantidad"
                    value={nuevaCantidad}
                    onChange={(e) => setNuevaCantidad(e.target.value)}
                    className="w-32"
                  />
                  <Button onClick={handleAdd}>
                    <Plus className="h-4 w-4" /> Agregar
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}