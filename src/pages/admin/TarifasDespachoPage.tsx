import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { ArrowUp, ArrowDown, Save } from "lucide-react";

type Tarifa = {
  id: string;
  tramo: number;
  distancia_desde: number;
  distancia_hasta: number;
  descripcion: string;
  precio: number;
};

const fmt = (n: number) => "$" + n.toLocaleString("es-CL");

export default function TarifasDespachoPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [precios, setPrecios] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [ajuste, setAjuste] = useState<string>("");
  const [previewMode, setPreviewMode] = useState<null | "subir" | "bajar">(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tarifas_despacho")
      .select("*")
      .order("tramo");
    if (error) {
      toast({ title: "Error cargando tarifas", description: error.message, variant: "destructive" });
    } else {
      const rows = (data ?? []) as unknown as Tarifa[];
      setTarifas(rows);
      setPrecios(Object.fromEntries(rows.map((t) => [t.id, String(t.precio)])));
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const guardarFila = async (t: Tarifa) => {
    const nuevo = parseInt(precios[t.id] || "0", 10) || 0;
    const { error } = await supabase
      .from("tarifas_despacho")
      .update({ precio: nuevo, updated_at: new Date().toISOString() })
      .eq("id", t.id);
    if (error) {
      toast({ title: "Error al guardar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `Tramo ${t.tramo} actualizado`, description: `${t.descripcion}: ${fmt(nuevo)}` });
      load();
    }
  };

  const montoAjuste = parseInt(ajuste || "0", 10) || 0;

  const previewNuevoPrecio = (precioActual: number) => {
    if (!previewMode || !montoAjuste) return precioActual;
    const delta = previewMode === "subir" ? montoAjuste : -montoAjuste;
    return Math.max(0, precioActual + delta);
  };

  const confirmarAjuste = async () => {
    if (!previewMode || !montoAjuste) return;
    const updates = tarifas.map((t) =>
      supabase
        .from("tarifas_despacho")
        .update({ precio: previewNuevoPrecio(t.precio), updated_at: new Date().toISOString() })
        .eq("id", t.id)
    );
    const results = await Promise.all(updates);
    const fail = results.find((r) => r.error);
    if (fail?.error) {
      toast({ title: "Error en ajuste", description: fail.error.message, variant: "destructive" });
    } else {
      toast({ title: "Ajuste aplicado", description: `Se ${previewMode === "subir" ? "aumentaron" : "redujeron"} todos los tramos en ${fmt(montoAjuste)}` });
      setPreviewMode(null);
      setAjuste("");
      load();
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-3xl font-display tracking-wide">Tarifas de Despacho</h1>
        <p className="text-sm text-muted-foreground">Precio cobrado al cliente según la distancia calculada por Google Maps.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Tabla de tarifas por distancia</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Cargando…</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tramo</TableHead>
                  <TableHead>Distancia</TableHead>
                  <TableHead className="w-[180px]">Precio</TableHead>
                  <TableHead className="w-[140px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tarifas.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-semibold">Tramo {t.tramo}</TableCell>
                    <TableCell>{t.descripcion}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        value={precios[t.id] ?? ""}
                        onChange={(e) => setPrecios({ ...precios, [t.id]: e.target.value })}
                        className="font-mono"
                      />
                    </TableCell>
                    <TableCell>
                      <Button size="sm" onClick={() => guardarFila(t)}>
                        <Save className="h-4 w-4 mr-1" /> Guardar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Subir o bajar precio a todos los tramos</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div className="flex-1 min-w-[200px]">
              <Label htmlFor="ajuste">¿Cuánto querés ajustar?</Label>
              <Input
                id="ajuste"
                type="number"
                min="0"
                value={ajuste}
                onChange={(e) => { setAjuste(e.target.value); setPreviewMode(null); }}
                placeholder="500"
                className="font-mono"
              />
            </div>
            <Button
              variant={previewMode === "subir" ? "default" : "outline"}
              disabled={!montoAjuste}
              onClick={() => setPreviewMode("subir")}
            >
              <ArrowUp className="h-4 w-4 mr-1" /> Subir a todos
            </Button>
            <Button
              variant={previewMode === "bajar" ? "default" : "outline"}
              disabled={!montoAjuste}
              onClick={() => setPreviewMode("bajar")}
            >
              <ArrowDown className="h-4 w-4 mr-1" /> Bajar a todos
            </Button>
          </div>

          {previewMode && montoAjuste > 0 && (
            <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
              <p className="text-sm font-semibold uppercase tracking-wider">Vista previa del ajuste</p>
              {tarifas.map((t) => {
                const nuevo = previewNuevoPrecio(t.precio);
                return (
                  <div key={t.id} className="flex justify-between font-mono text-sm">
                    <span>Tramo {t.tramo}</span>
                    <span>
                      {fmt(t.precio)} → <span className="font-bold text-primary">{fmt(nuevo)}</span>
                    </span>
                  </div>
                );
              })}
              <Button className="w-full mt-2" onClick={confirmarAjuste}>
                Confirmar ajuste
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
