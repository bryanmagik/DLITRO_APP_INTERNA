import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Sparkles, Tag, Trash2, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";

const PROMO_PRECIO = 8000;

interface Categoria { id: string; nombre: string; orden: number | null }
interface Producto { id: string; nombre: string; precio: number; categoria_id: string | null }
interface PromoRow { id: string; producto_id: string | null; activo: boolean | null; precio_especial: number | null; dias_activos: string[] | null }
interface PromocionPrecio {
  id: string;
  producto_id: string;
  precio_promo: number;
  nombre: string | null;
  activo: boolean | null;
  producto?: { id: string; nombre: string; precio: number } | null;
}

const DIAS_SEMANA = [
  { key: "lunes", label: "L" },
  { key: "martes", label: "M" },
  { key: "miercoles", label: "M" },
  { key: "jueves", label: "J" },
  { key: "viernes", label: "V" },
  { key: "sabado", label: "S" },
  { key: "domingo", label: "D" },
];

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export default function PromocionesPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [promo, setPromo] = useState<PromoRow | null>(null);
  const [jarraPromo, setJarraPromo] = useState<PromoRow | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [jarraDias, setJarraDias] = useState<string[]>(["lunes", "sabado"]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingJarra, setSavingJarra] = useState(false);
  const [promosPrecio, setPromosPrecio] = useState<PromocionPrecio[]>([]);
  const [precioModalOpen, setPrecioModalOpen] = useState(false);
  const [precioFormProductoId, setPrecioFormProductoId] = useState("");
  const [precioFormPromo, setPrecioFormPromo] = useState("");
  const [precioFormNombre, setPrecioFormNombre] = useState("");
  const [precioFormActivo, setPrecioFormActivo] = useState(true);
  const [savingPrecio, setSavingPrecio] = useState(false);
  const [togglingPrecioId, setTogglingPrecioId] = useState<string | null>(null);
  const [deletingPrecioId, setDeletingPrecioId] = useState<string | null>(null);

  const load = async () => {
    const [pRes, cRes, promoRes, jarraRes, preciosRes] = await Promise.all([
      supabase.from("productos").select("id,nombre,precio,categoria_id").eq("activo", true).order("nombre"),
      supabase.from("categorias").select("*").order("orden"),
      supabase.from("promociones").select("id,producto_id,activo,precio_especial,dias_activos").eq("tipo", "sabor_del_dia").maybeSingle(),
      supabase.from("promociones").select("id,producto_id,activo,precio_especial,dias_activos").eq("tipo", "jarra_dorada").maybeSingle(),
      supabase.from("promociones_precio").select("id,producto_id,precio_promo,nombre,activo,producto:producto_id(id,nombre,precio)").order("created_at", { ascending: false }),
    ]);
    setProductos((pRes.data as Producto[]) ?? []);
    setCategorias((cRes.data as Categoria[]) ?? []);
    const pr = (promoRes.data as PromoRow | null) ?? null;
    setPromo(pr);
    if (pr?.producto_id) setSelectedId(pr.producto_id);
    const jp = (jarraRes.data as PromoRow | null) ?? null;
    setJarraPromo(jp);
    if (jp?.dias_activos && jp.dias_activos.length > 0) setJarraDias(jp.dias_activos);
    setPromosPrecio((preciosRes.data as PromocionPrecio[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const productosPorCat = useMemo(() => {
    const map = new Map<string, Producto[]>();
    for (const p of productos) {
      const key = p.categoria_id ?? "__sin__";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(p);
    }
    return map;
  }, [productos]);

  const activo = !!promo?.activo;
  const productoActivo = productos.find((p) => p.id === promo?.producto_id);

  const desactivarActual = async (current: PromoRow) => {
    if (current.producto_id && current.precio_especial != null) {
      const { error } = await supabase
        .from("productos")
        .update({ precio: current.precio_especial })
        .eq("id", current.producto_id);
      if (error) throw error;
    }
    const { error } = await supabase
      .from("promociones")
      .update({ activo: false })
      .eq("id", current.id);
    if (error) throw error;
  };

  const activarProducto = async (productoId: string) => {
    const prod = productos.find((p) => p.id === productoId);
    if (!prod) throw new Error("Producto no encontrado");
    const precioOriginal = prod.precio;

    if (promo) {
      const { error } = await supabase
        .from("promociones")
        .update({ producto_id: productoId, precio_especial: precioOriginal, activo: true })
        .eq("id", promo.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from("promociones").insert({
        nombre: "Sabor del Día",
        tipo: "sabor_del_dia",
        producto_id: productoId,
        precio_especial: precioOriginal,
        activo: true,
      });
      if (error) throw error;
    }
    const { error: upErr } = await supabase
      .from("productos")
      .update({ precio: PROMO_PRECIO })
      .eq("id", productoId);
    if (upErr) throw upErr;
  };

  const handleToggle = async (next: boolean) => {
    if (saving) return;
    if (next && !selectedId) {
      toast({ title: "Selecciona un producto primero", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      if (next) {
        if (promo?.activo && promo.producto_id && promo.producto_id !== selectedId) {
          await desactivarActual(promo);
        }
        await activarProducto(selectedId);
        toast({ title: "Promo activada" });
      } else {
        if (promo?.activo) await desactivarActual(promo);
        toast({ title: "Promo desactivada" });
      }
      await load();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleChangeProducto = async (newId: string) => {
    setSelectedId(newId);
    if (!activo || !promo) return;
    if (newId === promo.producto_id) return;
    setSaving(true);
    try {
      await desactivarActual(promo);
      await activarProducto(newId);
      toast({ title: "Promo cambiada", description: "Nuevo producto en promoción" });
      await load();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const guardarJarraDorada = async () => {
    if (savingJarra) return;
    setSavingJarra(true);
    try {
      if (jarraPromo) {
        const { error } = await supabase
          .from("promociones")
          .update({ dias_activos: jarraDias })
          .eq("id", jarraPromo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("promociones").insert({
          nombre: "Jarra Dorada",
          tipo: "jarra_dorada",
          dias_activos: jarraDias,
          activo: true,
        });
        if (error) throw error;
      }
      toast({ title: "Días de Jarra Dorada guardados" });
      await load();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setSavingJarra(false);
    }
  };

  const toggleDia = (key: string) => {
    setJarraDias((prev) =>
      prev.includes(key) ? prev.filter((d) => d !== key) : [...prev, key]
    );
  };

  const promosPrecioActivas = useMemo(
    () => promosPrecio.filter((p) => p.activo),
    [promosPrecio],
  );

  const productosConPromoActiva = useMemo(
    () => new Set(promosPrecio.filter((p) => p.activo).map((p) => p.producto_id)),
    [promosPrecio],
  );

  const abrirModalPrecio = () => {
    setPrecioFormProductoId("");
    setPrecioFormPromo("");
    setPrecioFormNombre("");
    setPrecioFormActivo(true);
    setPrecioModalOpen(true);
  };

  const guardarPrecioEspecial = async () => {
    if (savingPrecio) return;
    if (!precioFormProductoId) {
      toast({ title: "Selecciona un producto", variant: "destructive" });
      return;
    }
    const precioPromo = parseInt(precioFormPromo, 10);
    if (!precioPromo || precioPromo <= 0) {
      toast({ title: "Ingresa un precio promo válido", variant: "destructive" });
      return;
    }
    if (precioFormActivo && productosConPromoActiva.has(precioFormProductoId)) {
      toast({
        title: "Ya existe una promo activa",
        description: "Este producto ya tiene un precio especial activo. Desactívala antes de crear otra.",
        variant: "destructive",
      });
      return;
    }
    setSavingPrecio(true);
    try {
      const { error } = await supabase.from("promociones_precio").insert({
        producto_id: precioFormProductoId,
        precio_promo: precioPromo,
        nombre: precioFormNombre.trim() || null,
        activo: precioFormActivo,
      });
      if (error) throw error;
      toast({ title: "Precio especial guardado" });
      setPrecioModalOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast({
        title: "Error al guardar",
        description: msg.includes("promociones_precio_producto_activo_unique")
          ? "Este producto ya tiene una promo activa."
          : msg,
        variant: "destructive",
      });
    } finally {
      setSavingPrecio(false);
    }
  };

  const togglePrecioEspecial = async (row: PromocionPrecio, next: boolean) => {
    if (togglingPrecioId) return;
    if (next) {
      const otra = promosPrecio.find((p) => p.activo && p.producto_id === row.producto_id && p.id !== row.id);
      if (otra) {
        toast({
          title: "Promo duplicada",
          description: "Ya hay una promo activa para este producto.",
          variant: "destructive",
        });
        return;
      }
    }
    setTogglingPrecioId(row.id);
    try {
      const { error } = await supabase.from("promociones_precio").update({ activo: next }).eq("id", row.id);
      if (error) throw error;
      await load();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setTogglingPrecioId(null);
    }
  };

  const eliminarPrecioEspecial = async (id: string) => {
    if (deletingPrecioId) return;
    setDeletingPrecioId(id);
    try {
      const { error } = await supabase.from("promociones_precio").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Promoción eliminada" });
      await load();
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setDeletingPrecioId(null);
    }
  };

  const precioPromoPreview = parseInt(precioFormPromo, 10) || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl text-foreground tracking-wide">Promociones</h1>
        <p className="text-muted-foreground text-sm">Configura las promociones activas del catálogo</p>
      </div>

      {loading ? (
        <div className="p-12 flex items-center justify-center text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
        </div>
      ) : (
        <>
          <Card className="max-w-2xl">
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> Sabor del Día
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  El producto seleccionado tendrá precio promocional de {fmtCLP(PROMO_PRECIO)}.
                </p>
              </div>
              <div className="flex items-center gap-2 pt-1">
                <span className="text-xs text-muted-foreground">{activo ? "ON" : "OFF"}</span>
                <Switch checked={activo} disabled={saving} onCheckedChange={handleToggle} />
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-1.5 block">Producto en promoción</label>
                <Select value={selectedId} onValueChange={handleChangeProducto} disabled={saving}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un producto…" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => {
                      const items = productosPorCat.get(c.id) ?? [];
                      if (items.length === 0) return null;
                      return (
                        <SelectGroup key={c.id}>
                          <SelectLabel>{c.nombre}</SelectLabel>
                          {items.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nombre} — {fmtCLP(p.id === promo?.producto_id && promo?.activo && promo?.precio_especial != null ? promo.precio_especial : p.precio)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      );
                    })}
                    {(productosPorCat.get("__sin__") ?? []).length > 0 && (
                      <SelectGroup>
                        <SelectLabel>Sin categoría</SelectLabel>
                        {(productosPorCat.get("__sin__") ?? []).map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.nombre} — {fmtCLP(p.precio)}</SelectItem>
                        ))}
                      </SelectGroup>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {activo && productoActivo ? (
                <div className="rounded-lg border border-primary/40 bg-primary/10 p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-primary font-semibold">Promo activa</div>
                    <div className="text-foreground font-medium mt-0.5">{productoActivo.nombre}</div>
                    {promo?.precio_especial != null && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Precio original: {fmtCLP(promo.precio_especial)} · Se restaurará al desactivar
                      </div>
                    )}
                  </div>
                  <Badge className="bg-primary text-primary-foreground border-transparent text-base px-3 py-1">
                    ⭐ {fmtCLP(PROMO_PRECIO)}
                  </Badge>
                </div>
              ) : (
                <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                  No hay promoción activa.
                </div>
              )}
            </CardContent>
          </Card>

          {/* ───── PRECIOS ESPECIALES ───── */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Tag className="h-5 w-5 text-success" /> Precios Especiales
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Define precios promocionales por producto. Solo puede haber una promo activa por producto.
                </p>
              </div>
              <Button onClick={abrirModalPrecio} className="shrink-0">
                <Plus className="h-4 w-4 mr-1.5" /> Agregar precio especial
              </Button>
            </CardHeader>
            <CardContent>
              {promosPrecioActivas.length === 0 ? (
                <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
                  No hay precios especiales activos.
                </div>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Precio original</TableHead>
                        <TableHead className="text-right">Precio promo</TableHead>
                        <TableHead className="text-right">Ahorro</TableHead>
                        <TableHead>Descripción</TableHead>
                        <TableHead className="text-center">Activo</TableHead>
                        <TableHead className="w-12" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {promosPrecioActivas.map((row) => {
                        const prod = row.producto ?? productos.find((p) => p.id === row.producto_id);
                        const precioOriginal = prod?.precio ?? 0;
                        const ahorro = Math.max(0, precioOriginal - row.precio_promo);
                        return (
                          <TableRow key={row.id}>
                            <TableCell className="font-medium">{prod?.nombre ?? "—"}</TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">{fmtCLP(precioOriginal)}</TableCell>
                            <TableCell className="text-right font-mono text-success font-semibold">{fmtCLP(row.precio_promo)}</TableCell>
                            <TableCell className="text-right font-mono text-primary">{fmtCLP(ahorro)}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{row.nombre || "—"}</TableCell>
                            <TableCell className="text-center">
                              <Switch
                                checked={!!row.activo}
                                disabled={togglingPrecioId === row.id}
                                onCheckedChange={(v) => togglePrecioEspecial(row, v)}
                              />
                            </TableCell>
                            <TableCell>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive"
                                disabled={deletingPrecioId === row.id}
                                onClick={() => eliminarPrecioEspecial(row.id)}
                              >
                                {deletingPrecioId === row.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <Trash2 className="h-4 w-4" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {promosPrecio.some((p) => !p.activo) && (
                <p className="text-xs text-muted-foreground mt-3">
                  {promosPrecio.filter((p) => !p.activo).length} promoción(es) inactiva(s) no se muestran en el listado.
                </p>
              )}
            </CardContent>
          </Card>

          <Dialog open={precioModalOpen} onOpenChange={setPrecioModalOpen}>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Agregar precio especial</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div>
                  <Label>Producto</Label>
                  <Select value={precioFormProductoId} onValueChange={setPrecioFormProductoId}>
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Selecciona un producto…" />
                    </SelectTrigger>
                    <SelectContent>
                      {categorias.map((c) => {
                        const items = productosPorCat.get(c.id) ?? [];
                        if (items.length === 0) return null;
                        return (
                          <SelectGroup key={c.id}>
                            <SelectLabel>{c.nombre}</SelectLabel>
                            {items.map((p) => (
                              <SelectItem
                                key={p.id}
                                value={p.id}
                                disabled={productosConPromoActiva.has(p.id)}
                              >
                                {p.nombre} — {fmtCLP(p.precio)}
                                {productosConPromoActiva.has(p.id) ? " (ya en promo)" : ""}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                      {(productosPorCat.get("__sin__") ?? []).length > 0 && (
                        <SelectGroup>
                          <SelectLabel>Sin categoría</SelectLabel>
                          {(productosPorCat.get("__sin__") ?? []).map((p) => (
                            <SelectItem
                              key={p.id}
                              value={p.id}
                              disabled={productosConPromoActiva.has(p.id)}
                            >
                              {p.nombre} — {fmtCLP(p.precio)}
                              {productosConPromoActiva.has(p.id) ? " (ya en promo)" : ""}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="precio-promo">Precio promo</Label>
                  <Input
                    id="precio-promo"
                    type="number"
                    min={1}
                    value={precioFormPromo}
                    onChange={(e) => setPrecioFormPromo(e.target.value)}
                    placeholder="8000"
                    className="mt-1.5 font-mono"
                  />
                  {precioPromoPreview > 0 && (
                    <p className="text-sm text-success font-mono mt-1">{fmtCLP(precioPromoPreview)}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="precio-nombre">Nombre / descripción (opcional)</Label>
                  <Input
                    id="precio-nombre"
                    value={precioFormNombre}
                    onChange={(e) => setPrecioFormNombre(e.target.value)}
                    placeholder="Promo Verano"
                    className="mt-1.5"
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <Label htmlFor="precio-activo" className="cursor-pointer">Activo</Label>
                  <Switch id="precio-activo" checked={precioFormActivo} onCheckedChange={setPrecioFormActivo} />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setPrecioModalOpen(false)}>Cancelar</Button>
                <Button onClick={guardarPrecioEspecial} disabled={savingPrecio}>
                  {savingPrecio ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Guardar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ───── JARRA DORADA ───── */}
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-amber-500" /> Jarra Dorada
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Configura en qué días de la semana está disponible la Jarra Dorada para pedidos delivery.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm font-medium text-foreground mb-2 block">Días activos de la Jarra Dorada</label>
                <div className="flex flex-wrap gap-2">
                  {DIAS_SEMANA.map(({ key, label }) => {
                    const active = jarraDias.includes(key);
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => toggleDia(key)}
                        className={`h-10 w-10 rounded-full border text-sm font-bold transition ${
                          active
                            ? "bg-amber-500 text-white border-transparent"
                            : "border-border bg-card text-muted-foreground hover:border-amber-500/50"
                        }`}
                        title={key}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div className="flex gap-2 mt-2 text-xs text-muted-foreground">
                  {DIAS_SEMANA.map(({ key, label }) => (
                    <span key={key} className="w-10 text-center">{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                  ))}
                </div>
              </div>
              <Button
                onClick={guardarJarraDorada}
                disabled={savingJarra}
                className="bg-amber-500 text-white hover:bg-amber-600"
              >
                {savingJarra ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Guardar
              </Button>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
