import { useEffect, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Turno } from "../TurnoPage";

type Metodo = "efectivo" | "tarjeta";
interface Gasto {
  id: string;
  concepto: string;
  monto: number;
  metodo: Metodo | null;
  created_at: string | null;
}
const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

export default function GastosTab({ turno }: { turno: Turno }) {
  const { perfil } = useAuthStore();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [saving, setSaving] = useState(false);

  const cargar = async () => {
    const { data } = await supabase
      .from("gastos_turno")
      .select("id,concepto,monto,metodo,created_at")
      .eq("turno_id", turno.id)
      .order("created_at", { ascending: false });
    setGastos((data as Gasto[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [turno.id]);

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    const m = parseInt(monto, 10);
    if (!concepto.trim() || Number.isNaN(m) || m <= 0) {
      toast.error("Concepto y monto son obligatorios"); return;
    }
    setSaving(true);
    const { error } = await supabase.from("gastos_turno").insert({
      turno_id: turno.id,
      concepto: concepto.trim(),
      monto: m,
      metodo,
      usuario_id: perfil?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Gasto registrado");
    setConcepto(""); setMonto("");
    cargar();
  };

  const eliminar = async (id: string) => {
    const { error } = await supabase.from("gastos_turno").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    cargar();
  };

    const esIngreso = (c: string) => c.startsWith("Ingreso caja chica");
    const totalGastosReales = gastos.filter((g) => !esIngreso(g.concepto)).reduce((a, g) => a + g.monto, 0);
    const totalIngresosCaja = gastos.filter((g) => esIngreso(g.concepto)).reduce((a, g) => a + g.monto, 0);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
      <form onSubmit={agregar} className="bg-card border border-border rounded-xl p-4 space-y-3 h-fit">
        <h2 className="font-display text-2xl">Nuevo gasto</h2>
        <div className="space-y-2">
          <Label className="label-upper">Concepto</Label>
          <Input value={concepto} onChange={(e) => setConcepto(e.target.value)} maxLength={100} className="bg-background" />
        </div>
        <div className="space-y-2">
          <Label className="label-upper">Monto</Label>
          <Input type="number" min={1} value={monto} onChange={(e) => setMonto(e.target.value)} className="bg-background font-mono" />
        </div>
        <div className="space-y-2">
          <Label className="label-upper">Método</Label>
          <Select value={metodo} onValueChange={(v) => setMetodo(v as Metodo)}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="efectivo">Efectivo</SelectItem>
              <SelectItem value="tarjeta">Tarjeta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" disabled={saving} className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-wider uppercase">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-2" /> Agregar</>}
        </Button>
      </form>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>
        ) : gastos.length === 0 ? (
          <div className="p-12 text-center text-muted-foreground">Sin gastos registrados</div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 border-b border-border">
                <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                  <th className="px-4 py-3">Concepto</th>
                  <th className="px-4 py-3">Método</th>
                  <th className="px-4 py-3 text-right">Monto</th>
                  <th className="px-4 py-3 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g) => {
                  const ingreso = esIngreso(g.concepto);
                  return (
                  <tr key={g.id} className={`border-b border-border last:border-0 ${ingreso ? "bg-success/5" : ""}`}>
                    <td className="px-4 py-3 text-foreground">
                      {ingreso && <span className="mr-2 text-[10px] uppercase tracking-widest px-1.5 py-0.5 rounded bg-success/20 text-success border border-success/30">Ingreso</span>}
                      {g.concepto}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground uppercase text-xs tracking-wider">{g.metodo ?? "—"}</td>
                    <td className={`px-4 py-3 text-right font-mono ${ingreso ? "text-success" : "text-foreground"}`}>{ingreso ? "+" : ""}{fmtCLP(g.monto)}</td>
                    <td className="px-4 py-3">
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => eliminar(g.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-border px-4 py-3 space-y-1 bg-secondary/30">
              {totalIngresosCaja > 0 && (
                <div className="flex justify-between items-center">
                  <span className="uppercase tracking-wider text-xs text-muted-foreground">Ingresos caja chica</span>
                  <span className="font-mono text-sm text-success">+{fmtCLP(totalIngresosCaja)}</span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="uppercase tracking-wider text-xs text-muted-foreground">Total gastos</span>
                <span className="font-mono text-xl text-primary">{fmtCLP(totalGastosReales)}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
