import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Copy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/use-toast";
import { TIPOS_INSUMO, InsumoFull, estadoStock } from "@/lib/logistica";
import StockColumnasCells from "@/components/StockColumnasCells";
import { cn } from "@/lib/utils";
import { INVENTARIO_SELECT } from "@/lib/inventarioOperativo";

interface Sucursal { id: string; nombre: string }
interface StockRow {
  sucursal_id: string;
  insumo_id: string;
  cantidad: number;
  stock_minimo: number | null;
  stock_minimo_observacion: number;
  stock_minimo_critico: number;
}

type Edits = Record<string, { obs: string; crit: string }>;

export default function StockMinimosPage() {
  const [loading, setLoading] = useState(true);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [insumos, setInsumos] = useState<InsumoFull[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [sucId, setSucId] = useState<string>("");
  const [edits, setEdits] = useState<Edits>({});
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyDest, setCopyDest] = useState<string>("");
  const [savingAll, setSavingAll] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const [insR, sucR, stR] = await Promise.all([
      supabase
        .from("insumos")
        .select(INVENTARIO_SELECT)
        .eq("activo", true)
        .order("orden_visual", { ascending: true, nullsFirst: false })
        .order("orden_presentacion", { ascending: true })
        .order("nombre"),
      supabase.from("sucursales").select("id,nombre").eq("activo", true).order("nombre"),
      supabase
        .from("stock_sucursal")
        .select("sucursal_id,insumo_id,cantidad,stock_minimo,stock_minimo_observacion,stock_minimo_critico"),
    ]);
    setInsumos((insR.data as InsumoFull[]) ?? []);
    const sucs = (sucR.data as Sucursal[]) ?? [];
    setSucursales(sucs);
    setStock((stR.data as StockRow[]) ?? []);
    setSucId((prev) => prev || sucs[0]?.id || "");
    setLoading(false);
  };

  useEffect(() => {
    cargar();
  }, []);

  // Reset edits cuando cambia sucursal
  useEffect(() => {
    setEdits({});
  }, [sucId]);

  const stockMap = useMemo(() => {
    const m = new Map<string, StockRow>();
    stock.filter((s) => s.sucursal_id === sucId).forEach((s) => m.set(s.insumo_id, s));
    return m;
  }, [stock, sucId]);

  const grupos = useMemo(() => {
    const out: Record<string, InsumoFull[]> = {};
    TIPOS_INSUMO.forEach((t) => (out[t] = []));
    insumos.forEach((i) => {
      if (out[i.tipo]) out[i.tipo].push(i);
    });
    return out;
  }, [insumos]);

  const valorObs = (insumoId: string) => {
    if (edits[insumoId]?.obs !== undefined) return edits[insumoId].obs;
    return String(stockMap.get(insumoId)?.stock_minimo_observacion ?? 0);
  };
  const valorCrit = (insumoId: string) => {
    if (edits[insumoId]?.crit !== undefined) return edits[insumoId].crit;
    return String(stockMap.get(insumoId)?.stock_minimo_critico ?? 0);
  };

  const setEdit = (insumoId: string, key: "obs" | "crit", value: string) => {
    setEdits((p) => ({
      ...p,
      [insumoId]: {
        obs: p[insumoId]?.obs ?? String(stockMap.get(insumoId)?.stock_minimo_observacion ?? 0),
        crit: p[insumoId]?.crit ?? String(stockMap.get(insumoId)?.stock_minimo_critico ?? 0),
        [key]: value,
      },
    }));
  };

  const guardarFila = async (insumoId: string) => {
    if (!sucId) return;
    const obs = Number(valorObs(insumoId)) || 0;
    const crit = Number(valorCrit(insumoId)) || 0;
    if (crit > obs && obs > 0) {
      toast({ title: "Inválido", description: "El mínimo crítico debe ser ≤ al mínimo observación.", variant: "destructive" });
      return;
    }
    const row = stockMap.get(insumoId);
    if (row) {
      const { error } = await supabase
        .from("stock_sucursal")
        .update({
          stock_minimo_observacion: obs,
          stock_minimo_critico: crit,
          stock_minimo: obs,
        })
        .eq("sucursal_id", sucId)
        .eq("insumo_id", insumoId);
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      const { error } = await supabase.from("stock_sucursal").insert({
        sucursal_id: sucId,
        insumo_id: insumoId,
        cantidad: 0,
        stock_minimo_observacion: obs,
        stock_minimo_critico: crit,
        stock_minimo: obs,
      });
      if (error) return toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setEdits((p) => {
      const n = { ...p };
      delete n[insumoId];
      return n;
    });
    toast({ title: "Guardado" });
    cargar();
  };

  const guardarTodo = async () => {
    if (!sucId) return;
    const ids = Object.keys(edits);
    if (ids.length === 0) return;
    setSavingAll(true);
    for (const id of ids) {
      await guardarFila(id);
    }
    setSavingAll(false);
  };

  const copiarConfig = async () => {
    if (!sucId || !copyDest || sucId === copyDest) return;
    const origen = stock.filter((s) => s.sucursal_id === sucId);
    for (const r of origen) {
      const existente = stock.find((s) => s.sucursal_id === copyDest && s.insumo_id === r.insumo_id);
      if (existente) {
        await supabase
          .from("stock_sucursal")
          .update({
            stock_minimo_observacion: r.stock_minimo_observacion,
            stock_minimo_critico: r.stock_minimo_critico,
            stock_minimo: r.stock_minimo_observacion,
          })
          .eq("sucursal_id", copyDest)
          .eq("insumo_id", r.insumo_id);
      } else {
        await supabase.from("stock_sucursal").insert({
          sucursal_id: copyDest,
          insumo_id: r.insumo_id,
          cantidad: 0,
          stock_minimo_observacion: r.stock_minimo_observacion,
          stock_minimo_critico: r.stock_minimo_critico,
          stock_minimo: r.stock_minimo_observacion,
        });
      }
    }
    toast({ title: "Configuración copiada" });
    setCopyOpen(false);
    setCopyDest("");
    cargar();
  };

  const hayCambios = Object.keys(edits).length > 0;

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Stock Mínimos por Sucursal</h1>
          <p className="text-sm text-muted-foreground">
            Configura el mínimo de observación (🟡) y crítico (🔴) por insumo
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCopyOpen(true)} disabled={!sucId}>
            <Copy className="h-4 w-4 mr-1" /> Copiar configuración
          </Button>
          <Button onClick={guardarTodo} disabled={!hayCambios || savingAll}>
            <Save className="h-4 w-4 mr-1" /> Guardar todo
          </Button>
        </div>
      </div>

      {/* Tabs de sucursales */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-2">
        {sucursales.map((s) => (
          <button
            key={s.id}
            onClick={() => setSucId(s.id)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
              sucId === s.id
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70",
            )}
          >
            {s.nombre}
          </button>
        ))}
      </div>

      <div className="space-y-5">
        {TIPOS_INSUMO.map((tipo) => {
          const rows = grupos[tipo];
          if (!rows?.length) return null;
          return (
            <div key={tipo} className="border border-border rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-muted/40 text-xs uppercase tracking-widest font-bold text-muted-foreground">
                {tipo === "Aseo" ? "Útiles de aseo" : tipo}
              </div>
              <table className="w-full text-sm">
                <thead className="bg-muted/20 border-b border-border">
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2">Insumo</th>
                    <th className="px-3 py-2 text-right">Cajas</th>
                    <th className="px-3 py-2 text-right">Unidades</th>
                    <th className="px-3 py-2 text-right">Total ML/GR</th>
                    <th className="px-3 py-2 text-right w-32">🟡 Observación</th>
                    <th className="px-3 py-2 text-right w-32">🔴 Crítico</th>
                    <th className="px-3 py-2 text-center w-28">Estado</th>
                    <th className="px-3 py-2 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((ins) => {
                    const row = stockMap.get(ins.id);
                    const cant = Number(row?.cantidad ?? 0);
                    const obs = Number(valorObs(ins.id)) || 0;
                    const crit = Number(valorCrit(ins.id)) || 0;
                    const st = estadoStock(cant, obs, crit);
                    const dirty = !!edits[ins.id];
                    return (
                      <tr key={ins.id} className="border-t border-border">
                        <td className="px-3 py-2">{ins.nombre}</td>
                        <StockColumnasCells cantidad={cant} insumo={ins} sinStock className={st.cls} padding="sm" />
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={valorObs(ins.id)}
                            onChange={(e) => setEdit(ins.id, "obs", e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <Input
                            type="number"
                            inputMode="decimal"
                            value={valorCrit(ins.id)}
                            onChange={(e) => setEdit(ins.id, "crit", e.target.value)}
                            className="h-8 text-right"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full", st.bg, st.cls)}>
                            {st.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button
                            size="sm"
                            variant={dirty ? "default" : "outline"}
                            onClick={() => guardarFila(ins.id)}
                          >
                            Guardar
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })}
      </div>

      <Dialog open={copyOpen} onOpenChange={setCopyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar configuración a otra sucursal</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se copiarán los mínimos (observación y crítico) de{" "}
              <span className="font-semibold text-foreground">
                {sucursales.find((s) => s.id === sucId)?.nombre}
              </span>{" "}
              a la sucursal seleccionada.
            </p>
            <div>
              <Label>Sucursal destino</Label>
              <Select value={copyDest} onValueChange={setCopyDest}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona sucursal" />
                </SelectTrigger>
                <SelectContent>
                  {sucursales
                    .filter((s) => s.id !== sucId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nombre}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={copiarConfig} disabled={!copyDest}>
              Copiar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
