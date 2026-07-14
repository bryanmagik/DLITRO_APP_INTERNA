import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

interface Insumo {
  id: string; nombre: string; unidad: string | null; tipo: string;
  costo_unitario: number; activo: boolean | null;
}
interface Producto {
  id: string; nombre: string; precio: number;
  categoria_id: string | null; activo: boolean | null;
}
interface Categoria { id: string; nombre: string }
interface Receta { id: string; producto_id: string; insumo_id: string; cantidad: number }

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(n));

/* ---------- inline edit cell ---------- */
function InlineNumber({
  value, onSave, suffix, confirm,
}: {
  value: number;
  onSave: (v: number) => Promise<void> | void;
  suffix?: string;
  confirm?: (v: number) => boolean; // if true → require confirm dialog (handled by caller via onSave wrapper)
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(value));
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!editing) setVal(String(value)); }, [value, editing]);

  const commit = async () => {
    const n = Number(val.replace(",", "."));
    if (!isFinite(n) || n < 0) {
      toast.error("Valor inválido");
      return;
    }
    if (n === value) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(n); setEditing(false); }
    finally { setSaving(false); }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className="w-full text-right tabular-nums hover:bg-muted/50 px-2 py-1 rounded"
      >
        {value > 0 ? (suffix === "CLP" ? fmtCLP(value) : `${value}${suffix ?? ""}`) :
          <span className="text-muted-foreground">{suffix === "CLP" ? "$0" : `0${suffix ?? ""}`}</span>}
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <Input
        type="number"
        inputMode="decimal"
        min="0"
        step="0.01"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") { setEditing(false); setVal(String(value)); }
        }}
        autoFocus
        className="h-8 w-28 text-right"
      />
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={commit} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </Button>
      <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditing(false); setVal(String(value)); }}>
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default function CostosPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [recetas, setRecetas] = useState<Receta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [searchIns, setSearchIns] = useState("");
  const [searchRec, setSearchRec] = useState("");

  // Confirm dialog state (for product price change)
  const [confirmPrice, setConfirmPrice] = useState<{
    producto: Producto; nuevo: number;
  } | null>(null);

  const load = async () => {
    setLoading(true);
    const [iRes, pRes, cRes, rRes] = await Promise.all([
      supabase.from("insumos").select("*").order("tipo").order("nombre"),
      supabase.from("productos").select("id,nombre,precio,categoria_id,activo").eq("activo", true).order("nombre"),
      supabase.from("categorias").select("id,nombre").order("orden"),
      supabase.from("recetas").select("id,producto_id,insumo_id,cantidad"),
    ]);
    setInsumos((iRes.data as Insumo[]) ?? []);
    setProductos((pRes.data as Producto[]) ?? []);
    setCategorias((cRes.data as Categoria[]) ?? []);
    setRecetas((rRes.data as Receta[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const insumoMap = useMemo(() => {
    const m = new Map<string, Insumo>();
    insumos.forEach((i) => m.set(i.id, i));
    return m;
  }, [insumos]);

  const productoMap = useMemo(() => {
    const m = new Map<string, Producto>();
    productos.forEach((p) => m.set(p.id, p));
    return m;
  }, [productos]);

  const catMap = useMemo(() => {
    const m = new Map<string, string>();
    categorias.forEach((c) => m.set(c.id, c.nombre));
    return m;
  }, [categorias]);

  const costoPorProducto = useMemo(() => {
    const m = new Map<string, number>();
    recetas.forEach((r) => {
      const ins = insumoMap.get(r.insumo_id);
      if (!ins) return;
      const c = Number(ins.costo_unitario ?? 0) * Number(r.cantidad ?? 0);
      m.set(r.producto_id, (m.get(r.producto_id) ?? 0) + c);
    });
    return m;
  }, [recetas, insumoMap]);

  /* ---------- Save handlers ---------- */
  const saveCostoInsumo = async (id: string, val: number) => {
    const { error } = await supabase.from("insumos").update({ costo_unitario: val }).eq("id", id);
    if (error) { toast.error("Error al guardar", { description: error.message }); return; }
    toast.success("Costo actualizado");
    await load();
  };

  const savePrecioProducto = async (id: string, val: number) => {
    const { error } = await supabase.from("productos").update({ precio: Math.round(val) }).eq("id", id);
    if (error) { toast.error("Error al guardar", { description: error.message }); return; }
    toast.success("Precio actualizado");
    await load();
  };

  const saveCantidadReceta = async (id: string, val: number) => {
    const { error } = await supabase.from("recetas").update({ cantidad: val }).eq("id", id);
    if (error) { toast.error("Error al guardar", { description: error.message }); return; }
    toast.success("Receta actualizada");
    await load();
  };

  /* ---------- Filtered lists ---------- */
  const productosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    return productos.filter((p) => !q || p.nombre.toLowerCase().includes(q));
  }, [productos, search]);

  const insumosPrep = useMemo(
    () => insumos.filter((i) => (i.tipo ?? "").toLowerCase() === "preparación" || (i.tipo ?? "").toLowerCase() === "preparacion"),
    [insumos],
  );
  const insumosPrepFiltrados = useMemo(() => {
    const q = searchIns.trim().toLowerCase();
    return insumosPrep.filter((i) => !q || i.nombre.toLowerCase().includes(q));
  }, [insumosPrep, searchIns]);

  const recetasRows = useMemo(() => {
    const rows = recetas
      .map((r) => {
        const p = productoMap.get(r.producto_id);
        const i = insumoMap.get(r.insumo_id);
        if (!p || !i) return null;
        return {
          id: r.id,
          producto: p.nombre,
          insumo: i.nombre,
          unidad: i.unidad ?? "—",
          cantidad: Number(r.cantidad ?? 0),
          costoUnit: Number(i.costo_unitario ?? 0),
        };
      })
      .filter(Boolean) as Array<{
        id: string; producto: string; insumo: string; unidad: string;
        cantidad: number; costoUnit: number;
      }>;
    const q = searchRec.trim().toLowerCase();
    const filtered = !q ? rows : rows.filter((r) =>
      r.producto.toLowerCase().includes(q) || r.insumo.toLowerCase().includes(q));
    return filtered.sort((a, b) =>
      a.producto.localeCompare(b.producto) || a.insumo.localeCompare(b.insumo));
  }, [recetas, productoMap, insumoMap, searchRec]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Costos por Trago</h1>
        <p className="text-sm text-muted-foreground">
          Gestión de precios, costos de insumos y recetas.
        </p>
      </div>

      <Tabs defaultValue="tragos" className="space-y-4">
        <TabsList>
          <TabsTrigger value="tragos">Tragos y Márgenes</TabsTrigger>
          <TabsTrigger value="insumos">Insumos y Costos</TabsTrigger>
          <TabsTrigger value="recetas">Recetas</TabsTrigger>
        </TabsList>

        {/* TAB 1 */}
        <TabsContent value="tragos" className="space-y-3">
          <div className="flex justify-end">
            <div className="relative w-72">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar trago…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
            </div>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trago</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="text-right">Precio venta</TableHead>
                  <TableHead className="text-right">Costo insumos</TableHead>
                  <TableHead className="text-right">Margen $</TableHead>
                  <TableHead className="text-right">% Margen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productosFiltrados.map((p) => {
                  const costo = costoPorProducto.get(p.id) ?? 0;
                  const margen = p.precio - costo;
                  const pct = p.precio > 0 ? (margen / p.precio) * 100 : 0;
                  const sinCosto = costo === 0;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.nombre}</TableCell>
                      <TableCell className="text-muted-foreground">{catMap.get(p.categoria_id ?? "") ?? "—"}</TableCell>
                      <TableCell>
                        <InlineNumber
                          value={p.precio}
                          suffix="CLP"
                          onSave={(v) => new Promise<void>((resolve) => {
                            setConfirmPrice({ producto: p, nuevo: Math.round(v) });
                            // resolve immediately so input exits edit mode; actual save happens in dialog
                            resolve();
                          })}
                        />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sinCosto ? <span className="text-muted-foreground">{fmtCLP(0)}</span> : fmtCLP(costo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sinCosto ? "—" : fmtCLP(margen)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {sinCosto ? (
                          <Badge variant="outline">sin costo</Badge>
                        ) : (
                          <Badge variant={pct >= 60 ? "default" : pct >= 30 ? "secondary" : "destructive"}>
                            {pct.toFixed(1)}%
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {productosFiltrados.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sin productos</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 2 */}
        <TabsContent value="insumos" className="space-y-3">
          <div className="flex justify-end">
            <div className="relative w-72">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar insumo…" value={searchIns} onChange={(e) => setSearchIns(e.target.value)} className="pl-8" />
            </div>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Insumo</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Costo unitario</TableHead>
                  <TableHead>Última actualización</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {insumosPrepFiltrados.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.nombre}</TableCell>
                    <TableCell className="text-muted-foreground">{i.unidad ?? "—"}</TableCell>
                    <TableCell>
                      <InlineNumber
                        value={Number(i.costo_unitario ?? 0)}
                        suffix="CLP"
                        onSave={(v) => saveCostoInsumo(i.id, v)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">—</TableCell>
                  </TableRow>
                ))}
                {insumosPrepFiltrados.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">Sin insumos</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* TAB 3 */}
        <TabsContent value="recetas" className="space-y-3">
          <div className="flex justify-end">
            <div className="relative w-72">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar trago o insumo…" value={searchRec} onChange={(e) => setSearchRec(e.target.value)} className="pl-8" />
            </div>
          </div>
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Trago</TableHead>
                  <TableHead>Insumo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead>Unidad</TableHead>
                  <TableHead className="text-right">Costo parcial</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recetasRows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.producto}</TableCell>
                    <TableCell>{r.insumo}</TableCell>
                    <TableCell>
                      <InlineNumber
                        value={r.cantidad}
                        onSave={(v) => saveCantidadReceta(r.id, v)}
                      />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.unidad}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {r.costoUnit > 0 ? fmtCLP(r.cantidad * r.costoUnit) : <span className="text-muted-foreground">$0</span>}
                    </TableCell>
                  </TableRow>
                ))}
                {recetasRows.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sin recetas</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!confirmPrice} onOpenChange={(o) => !o && setConfirmPrice(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar cambio de precio</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmPrice && (
                <>
                  Vas a cambiar el precio de <b>{confirmPrice.producto.nombre}</b> de{" "}
                  <b>{fmtCLP(confirmPrice.producto.precio)}</b> a{" "}
                  <b>{fmtCLP(confirmPrice.nuevo)}</b>. Esto afecta las ventas activas y queda
                  registrado en el historial.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!confirmPrice) return;
                await savePrecioProducto(confirmPrice.producto.id, confirmPrice.nuevo);
                setConfirmPrice(null);
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
