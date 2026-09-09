import { useEffect, useRef, useState } from "react";
import { Loader2, Pencil, ImageIcon, Upload, Plus, Trash2, Tags } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";

// ── Interfaces ────────────────────────────────────────────────────────────────

interface Categoria { id: string; nombre: string; orden: number | null }
interface Producto {
  id: string;
  nombre: string;
  precio: number;
  activo: boolean | null;
  tiene_alcohol: boolean | null;
  imagen_url: string | null;
  categoria_id: string | null;
}
interface Insumo { id: string; nombre: string; unidad: string | null; tipo: string }
interface FilaReceta { insumoId: string; cantidad: string; tempId: string }

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const iniciales = (n: string) =>
  n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");

function Thumb({ p }: { p: Producto }) {
  if (p.imagen_url) {
    return (
      <img src={p.imagen_url} alt={p.nombre}
        className="h-12 w-12 rounded-md object-cover border border-border" loading="lazy" />
    );
  }
  return (
    <div className="h-12 w-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
      {iniciales(p.nombre) || "—"}
    </div>
  );
}

// ── Modal: Nueva Categoría ────────────────────────────────────────────────────

function NuevaCategoriaModal({
  open, categorias, onClose, onSaved,
}: { open: boolean; categorias: Categoria[]; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState("");
  const [orden, setOrden] = useState("1");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      const maxOrden = categorias.reduce((m, c) => Math.max(m, c.orden ?? 0), 0);
      setOrden(String(maxOrden + 1));
      setNombre("");
    }
  }, [open, categorias]);

  const guardar = async () => {
    if (!nombre.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" });
      return;
    }
    const ordenNum = parseInt(orden, 10);
    if (isNaN(ordenNum) || ordenNum < 1) {
      toast({ title: "El orden debe ser un número mayor a 0", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("categorias").insert({ nombre: nombre.trim(), orden: ordenNum });
    setSaving(false);
    if (error) { toast({ title: "Error al crear categoría", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Categoría creada", description: `"${nombre.trim()}" agregada exitosamente.` });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">Nueva categoría</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="cat-nombre">Nombre *</Label>
            <Input
              id="cat-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Gins"
              maxLength={80}
              onKeyDown={(e) => e.key === "Enter" && guardar()}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cat-orden">Orden de display *</Label>
            <Input
              id="cat-orden"
              type="number"
              min={1}
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Las categorías existentes van del 1 al{" "}
              {categorias.reduce((m, c) => Math.max(m, c.orden ?? 0), 0)}.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear categoría
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Nuevo Producto + Receta ────────────────────────────────────────────

function NuevoProductoModal({
  open, categorias, onClose, onSaved,
}: { open: boolean; categorias: Categoria[]; onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("0");
  const [categoriaId, setCategoriaId] = useState("");
  const [tieneAlcohol, setTieneAlcohol] = useState(true);
  const [activo, setActivo] = useState(true);
  const [imagenUrl, setImagenUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [filas, setFilas] = useState<FilaReceta[]>([]);

  useEffect(() => {
    if (!open) return;
    // Resetear form
    setNombre(""); setPrecio("0"); setCategoriaId("");
    setTieneAlcohol(true); setActivo(true); setImagenUrl(""); setFilas([]);
    // Cargar insumos activos
    supabase
      .from("insumos")
      .select("id, nombre, unidad, tipo")
      .eq("activo", true)
      .order("nombre")
      .then(({ data }) => setInsumos((data as Insumo[]) ?? []));
  }, [open]);

  const agregarFila = () =>
    setFilas((f) => [...f, { insumoId: "", cantidad: "1", tempId: crypto.randomUUID() }]);

  const eliminarFila = (tempId: string) =>
    setFilas((f) => f.filter((x) => x.tempId !== tempId));

  const updateFila = (tempId: string, field: "insumoId" | "cantidad", val: string) =>
    setFilas((f) => f.map((x) => (x.tempId === tempId ? { ...x, [field]: val } : x)));

  const guardar = async () => {
    if (!nombre.trim()) {
      toast({ title: "El nombre es obligatorio", variant: "destructive" }); return;
    }
    const precioNum = parseInt(precio, 10);
    if (isNaN(precioNum) || precioNum < 0) {
      toast({ title: "Precio inválido", variant: "destructive" }); return;
    }
    if (!categoriaId) {
      toast({ title: "Seleccioná una categoría", variant: "destructive" }); return;
    }

    // Validar filas de receta
    const filasValidas = filas.filter((f) => f.insumoId && Number(f.cantidad) > 0);
    const filasIncompletas = filas.filter((f) => !f.insumoId || Number(f.cantidad) <= 0);
    if (filasIncompletas.length > 0) {
      toast({ title: "Hay filas de receta incompletas", description: "Completá o eliminá las filas vacías.", variant: "destructive" });
      return;
    }

    setSaving(true);
    try {
      // 1. Insertar producto
      const { data: prod, error: prodErr } = await supabase
        .from("productos")
        .insert({
          nombre: nombre.trim(),
          precio: precioNum,
          categoria_id: categoriaId,
          tiene_alcohol: tieneAlcohol,
          activo,
          imagen_url: imagenUrl.trim() || null,
        })
        .select("id")
        .single();
      if (prodErr) throw prodErr;

      // 2. Insertar receta (solo si hay filas)
      if (filasValidas.length > 0) {
        const { error: recErr } = await supabase.from("recetas").insert(
          filasValidas.map((f) => ({
            producto_id: prod.id,
            insumo_id: f.insumoId,
            cantidad: Number(f.cantidad),
          }))
        );
        if (recErr) throw recErr;
      }

      toast({
        title: "Producto creado",
        description: `"${nombre.trim()}"${filasValidas.length > 0 ? ` con ${filasValidas.length} insumo${filasValidas.length > 1 ? "s" : ""} en receta.` : "."}`,
      });
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast({
        title: "Error al crear producto",
        description: e instanceof Error ? e.message : "No se pudo crear el producto",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const precioNum = parseInt(precio, 10);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">Nuevo producto</DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-1">
          <div className="space-y-6 py-1">

            {/* ── Datos del producto ───────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-4">
              {/* Nombre — ancho completo */}
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="np-nombre">Nombre *</Label>
                <Input
                  id="np-nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Tropical Gin"
                  maxLength={100}
                />
              </div>

              {/* Precio */}
              <div className="space-y-1.5">
                <Label htmlFor="np-precio">Precio (CLP) *</Label>
                <Input
                  id="np-precio"
                  type="number"
                  min={0}
                  step={100}
                  value={precio}
                  onChange={(e) => setPrecio(e.target.value)}
                />
                {!isNaN(precioNum) && precioNum > 0 && (
                  <p className="text-xs text-muted-foreground font-mono">{fmtCLP(precioNum)}</p>
                )}
              </div>

              {/* Categoría */}
              <div className="space-y-1.5">
                <Label>Categoría *</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* URL de imagen */}
              <div className="col-span-2 space-y-1.5">
                <Label htmlFor="np-img">URL de imagen (opcional)</Label>
                <Input
                  id="np-img"
                  value={imagenUrl}
                  onChange={(e) => setImagenUrl(e.target.value)}
                  placeholder="https://…"
                />
              </div>

              {/* Toggles */}
              <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Tiene alcohol</p>
                </div>
                <Switch checked={tieneAlcohol} onCheckedChange={setTieneAlcohol} />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Activo</p>
                  <p className="text-xs text-muted-foreground">Visible para pedidos</p>
                </div>
                <Switch checked={activo} onCheckedChange={setActivo} />
              </div>
            </div>

            {/* ── Receta de insumos ─────────────────────────────────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">Receta de insumos</h3>
                  <p className="text-xs text-muted-foreground">
                    Opcional — podés agregar la receta ahora o después desde Costos
                  </p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={agregarFila}>
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  Agregar insumo
                </Button>
              </div>

              {filas.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-secondary/40">
                      <tr className="text-left text-[11px] text-muted-foreground uppercase tracking-wider">
                        <th className="px-3 py-2">Insumo</th>
                        <th className="px-3 py-2 w-32">Cantidad</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody>
                      {filas.map((fila) => {
                        const insumoSel = insumos.find((i) => i.id === fila.insumoId);
                        return (
                          <tr key={fila.tempId} className="border-t border-border">
                            <td className="px-3 py-2">
                              <Select
                                value={fila.insumoId}
                                onValueChange={(v) => updateFila(fila.tempId, "insumoId", v)}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Seleccionar insumo…" />
                                </SelectTrigger>
                                <SelectContent>
                                  {insumos.map((i) => (
                                    <SelectItem key={i.id} value={i.id}>
                                      {i.nombre}
                                      {i.unidad ? ` (${i.unidad})` : ""}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <Input
                                  className="h-8 text-xs"
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  value={fila.cantidad}
                                  onChange={(e) => updateFila(fila.tempId, "cantidad", e.target.value)}
                                />
                                {insumoSel?.unidad && (
                                  <span className="text-[10px] text-muted-foreground shrink-0">
                                    {insumoSel.unidad}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive hover:text-destructive"
                                onClick={() => eliminarFila(fila.tempId)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {filas.length === 0 && (
                <div className="border border-dashed border-border rounded-lg py-6 text-center">
                  <p className="text-xs text-muted-foreground">
                    Sin insumos en la receta — el producto se crea igual
                  </p>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crear producto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: Editar Producto (existente) ────────────────────────────────────────

function EditarProductoModal({
  producto, categorias, onClose, onSaved,
}: {
  producto: Producto | null;
  categorias: Categoria[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState<string>("0");
  const [categoriaId, setCategoriaId] = useState<string>("");
  const [tieneAlcohol, setTieneAlcohol] = useState(true);
  const [activo, setActivo] = useState(true);
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (producto) {
      setNombre(producto.nombre);
      setPrecio(String(producto.precio ?? 0));
      setCategoriaId(producto.categoria_id ?? "");
      setTieneAlcohol(!!producto.tiene_alcohol);
      setActivo(!!producto.activo);
      setImagenFile(null);
      setPreview(producto.imagen_url ?? null);
    }
  }, [producto]);

  if (!producto) return null;

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/image\/(jpe?g|png|webp)/.test(f.type)) {
      toast({ title: "Formato inválido", description: "Usa JPG, PNG o WEBP.", variant: "destructive" });
      return;
    }
    setImagenFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const guardar = async () => {
    setSaving(true);
    try {
      let imagen_url = producto.imagen_url;

      if (imagenFile) {
        const ext = imagenFile.name.split(".").pop()?.toLowerCase() || "jpg";
        const path = `${producto.id}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("productos")
          .upload(path, imagenFile, { upsert: true, contentType: imagenFile.type, cacheControl: "3600" });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from("productos").getPublicUrl(path);
        imagen_url = `${pub.publicUrl}?v=${Date.now()}`;
      }

      const precioNum = parseInt(precio, 10);
      if (!nombre.trim()) throw new Error("El nombre es obligatorio");
      if (Number.isNaN(precioNum) || precioNum < 0) throw new Error("Precio inválido");

      const { error: updErr } = await supabase
        .from("productos")
        .update({
          nombre: nombre.trim(),
          precio: precioNum,
          categoria_id: categoriaId || null,
          tiene_alcohol: tieneAlcohol,
          activo,
          imagen_url,
        })
        .eq("id", producto.id);
      if (updErr) throw updErr;

      toast({ title: "Producto actualizado", description: nombre });
      onSaved();
    } catch (e: unknown) {
      toast({
        title: "Error al guardar",
        description: e instanceof Error ? e.message : "No se pudo guardar el producto",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!producto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl tracking-wide">Editar producto</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* IMAGEN */}
          <div className="space-y-3">
            <Label>Imagen</Label>
            <div className="aspect-square w-full rounded-lg border border-border bg-secondary/40 overflow-hidden flex items-center justify-center">
              {preview ? (
                <img src={preview} alt={nombre} className="w-full h-full object-cover" />
              ) : (
                <div className="flex flex-col items-center text-muted-foreground">
                  <ImageIcon className="h-10 w-10 mb-2" />
                  <span className="text-xs">Sin imagen</span>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" /> Cambiar imagen
            </Button>
            {imagenFile && <p className="text-xs text-muted-foreground truncate">Nueva: {imagenFile.name}</p>}
          </div>

          {/* DATOS */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ep-nombre">Nombre</Label>
              <Input id="ep-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={100} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ep-precio">Precio (CLP)</Label>
              <Input id="ep-precio" type="number" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} />
              {!isNaN(Number(precio)) && Number(precio) > 0 && (
                <p className="text-xs text-muted-foreground font-mono">{fmtCLP(Number(precio))}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              <Select value={categoriaId} onValueChange={setCategoriaId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label className="cursor-pointer">Tiene alcohol</Label>
              <Switch checked={tieneAlcohol} onCheckedChange={setTieneAlcohol} />
            </div>
            <div className="flex items-center justify-between rounded-md border border-border p-3">
              <Label className="cursor-pointer">Activo</Label>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

export default function ProductosPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Producto | null>(null);
  const [nuevaCatOpen, setNuevaCatOpen] = useState(false);
  const [nuevoProductoOpen, setNuevoProductoOpen] = useState(false);

  const cargar = async () => {
    const [pRes, cRes] = await Promise.all([
      supabase.from("productos").select("*").order("nombre"),
      supabase.from("categorias").select("*").order("orden"),
    ]);
    if (pRes.error) setError(pRes.error.message);
    if (cRes.error) setError(cRes.error.message);
    setProductos((pRes.data as Producto[]) ?? []);
    setCategorias((cRes.data as Categoria[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  const catNombre = (id: string | null) =>
    id ? categorias.find((c) => c.id === id)?.nombre ?? "—" : "—";

  const toggleActivo = async (p: Producto) => {
    const nuevo = !p.activo;
    setProductos(prev => prev.map(x => x.id === p.id ? { ...x, activo: nuevo } : x));
    const { error } = await supabase.from("productos").update({ activo: nuevo }).eq("id", p.id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
      setProductos(prev => prev.map(x => x.id === p.id ? { ...x, activo: p.activo } : x));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-foreground tracking-wide">Productos y precios</h1>
          <p className="text-muted-foreground text-sm">Catálogo completo dlitro</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" onClick={() => setNuevaCatOpen(true)}>
            <Tags className="h-4 w-4 mr-2" />
            Nueva Categoría
          </Button>
          <Button onClick={() => setNuevoProductoOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
          </div>
        ) : error ? (
          <div className="p-6 text-destructive">{error}</div>
        ) : productos.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">No hay productos cargados.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-secondary/40 border-b border-border">
              <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                <th className="px-4 py-3 w-20">Imagen</th>
                <th className="px-4 py-3">Producto</th>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-right">Precio</th>
                <th className="px-4 py-3">Activo</th>
                <th className="px-4 py-3 w-24 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0 hover:bg-secondary/20">
                  <td className="px-4 py-3"><Thumb p={p} /></td>
                  <td className="px-4 py-3 font-medium text-foreground">{p.nombre}</td>
                  <td className="px-4 py-3 text-muted-foreground">{catNombre(p.categoria_id)}</td>
                  <td className="px-4 py-3">
                    {p.tiene_alcohol ? (
                      <Badge variant="outline" className="border-primary/40 text-primary">Con alcohol</Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">Sin alcohol</Badge>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-foreground">{fmtCLP(p.precio)}</td>
                  <td className="px-4 py-3">
                    <Switch checked={!!p.activo} onCheckedChange={() => toggleActivo(p)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="icon" variant="ghost" onClick={() => setEditing(p)} aria-label="Editar">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <NuevaCategoriaModal
        open={nuevaCatOpen}
        categorias={categorias}
        onClose={() => setNuevaCatOpen(false)}
        onSaved={async () => { setNuevaCatOpen(false); await cargar(); }}
      />

      <NuevoProductoModal
        open={nuevoProductoOpen}
        categorias={categorias}
        onClose={() => setNuevoProductoOpen(false)}
        onSaved={async () => { setNuevoProductoOpen(false); await cargar(); }}
      />

      <EditarProductoModal
        producto={editing}
        categorias={categorias}
        onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await cargar(); }}
      />
    </div>
  );
}
