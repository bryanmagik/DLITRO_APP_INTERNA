import { useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
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

const esIngreso = (c: string) => c.startsWith("Ingreso caja chica");

export default function GastosTab({
  turno,
  refreshTurno,
}: {
  turno: Turno;
  refreshTurno: () => Promise<void>;
}) {
  const { perfil } = useAuthStore();
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [loading, setLoading] = useState(true);
  const [concepto, setConcepto] = useState("");
  const [monto, setMonto] = useState("");
  const [metodo, setMetodo] = useState<Metodo>("efectivo");
  const [saving, setSaving] = useState(false);

  const [eliminarGasto, setEliminarGasto] = useState<Gasto | null>(null);
  const [eliminando, setEliminando] = useState(false);

  const [editando, setEditando] = useState<Gasto | null>(null);
  const [editConcepto, setEditConcepto] = useState("");
  const [editMonto, setEditMonto] = useState("");
  const [editMetodo, setEditMetodo] = useState<Metodo>("efectivo");
  const [guardandoEdit, setGuardandoEdit] = useState(false);

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

  const abrirEditar = (g: Gasto) => {
    setEditando(g);
    setEditConcepto(g.concepto);
    setEditMonto(String(g.monto));
    setEditMetodo(g.metodo === "tarjeta" ? "tarjeta" : "efectivo");
  };

  const guardarEdicion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editando) return;
    const m = parseInt(editMonto, 10);
    if (!editConcepto.trim() || Number.isNaN(m) || m <= 0) {
      toast.error("Concepto y monto son obligatorios");
      return;
    }
    setGuardandoEdit(true);
    const { error } = await supabase
      .from("gastos_turno")
      .update({
        concepto: editConcepto.trim(),
        monto: m,
        metodo: editMetodo,
      })
      .eq("id", editando.id);
    setGuardandoEdit(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEditando(null);
    toast.success("Gasto actualizado");
    cargar();
  };

  const confirmarEliminar = async () => {
    if (!eliminarGasto) return;
    const esIngresoCaja = esIngreso(eliminarGasto.concepto);

    if (esIngresoCaja) {
      const nuevoSaldo = turno.caja_chica_apertura - eliminarGasto.monto;
      if (nuevoSaldo < 0) {
        toast.error("No se puede eliminar: la caja chica quedaría negativa");
        return;
      }

      setEliminando(true);
      const { error: delError } = await supabase
        .from("gastos_turno")
        .delete()
        .eq("id", eliminarGasto.id);

      if (delError) {
        setEliminando(false);
        toast.error(delError.message);
        return;
      }

      const { error: updError } = await supabase
        .from("turnos")
        .update({ caja_chica_apertura: nuevoSaldo })
        .eq("id", turno.id);

      setEliminando(false);
      if (updError) {
        toast.error(updError.message);
        return;
      }

      setEliminarGasto(null);
      toast.success("Ingreso de caja chica eliminado");
      await Promise.all([cargar(), refreshTurno()]);
      return;
    }

    setEliminando(true);
    const { error } = await supabase
      .from("gastos_turno")
      .delete()
      .eq("id", eliminarGasto.id);
    setEliminando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setEliminarGasto(null);
    toast.success("Gasto eliminado");
    cargar();
  };

  const totalGastosReales = gastos.filter((g) => !esIngreso(g.concepto)).reduce((a, g) => a + g.monto, 0);
  const totalIngresosCaja = gastos.filter((g) => esIngreso(g.concepto)).reduce((a, g) => a + g.monto, 0);
  const eliminarEsIngreso = eliminarGasto ? esIngreso(eliminarGasto.concepto) : false;
  const cajaQuedariaNegativa =
    eliminarEsIngreso &&
    !!eliminarGasto &&
    turno.caja_chica_apertura - eliminarGasto.monto < 0;

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
          <Input type="number" min={1} step={1} value={monto} onChange={(e) => setMonto(e.target.value)} className="bg-background font-mono" />
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
                  <th className="px-4 py-3 w-20"></th>
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
                      <div className="flex items-center justify-end gap-0.5">
                        {!ingreso && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-muted-foreground hover:text-foreground"
                            onClick={() => abrirEditar(g)}
                            title="Editar gasto"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setEliminarGasto(g)}
                          title={ingreso ? "Eliminar ingreso de caja chica" : "Eliminar gasto"}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
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

      <Dialog open={!!eliminarGasto} onOpenChange={(o) => !o && !eliminando && setEliminarGasto(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl flex items-center gap-2">
              ⚠️ {eliminarEsIngreso ? "¿Eliminar este ingreso de caja chica?" : "¿Eliminar este gasto?"}
            </DialogTitle>
          </DialogHeader>
          {eliminarGasto && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase text-xs tracking-wider">Concepto</p>
                <p className="text-foreground">{eliminarGasto.concepto}</p>
              </div>
              <div className="space-y-1">
                <p className="text-muted-foreground uppercase text-xs tracking-wider">Monto</p>
                <p className="font-mono text-foreground text-lg">{fmtCLP(eliminarGasto.monto)}</p>
              </div>
              {eliminarEsIngreso && (
                <p className="text-muted-foreground text-xs">Esta acción no se puede deshacer.</p>
              )}
              {cajaQuedariaNegativa && (
                <p className="text-destructive text-xs">
                  No se puede eliminar: la caja chica quedaría negativa
                  ({fmtCLP(turno.caja_chica_apertura)} − {fmtCLP(eliminarGasto.monto)}).
                </p>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              disabled={eliminando}
              onClick={() => setEliminarGasto(null)}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={eliminando || !eliminarGasto || cajaQuedariaNegativa}
              onClick={confirmarEliminar}
            >
              {eliminando ? <Loader2 className="h-4 w-4 animate-spin" /> : "Eliminar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editando} onOpenChange={(o) => !o && !guardandoEdit && setEditando(null)}>
        <DialogContent className="bg-card border-border max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display text-xl">Editar gasto</DialogTitle>
          </DialogHeader>
          <form onSubmit={guardarEdicion} className="space-y-3">
            <div className="space-y-2">
              <Label className="label-upper">Concepto</Label>
              <Input
                value={editConcepto}
                onChange={(e) => setEditConcepto(e.target.value)}
                maxLength={100}
                className="bg-background"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label className="label-upper">Monto</Label>
              <Input
                type="number"
                min={1}
                step={1}
                value={editMonto}
                onChange={(e) => setEditMonto(e.target.value)}
                className="bg-background font-mono"
              />
            </div>
            <div className="space-y-2">
              <Label className="label-upper">Método</Label>
              <Select value={editMetodo} onValueChange={(v) => setEditMetodo(v as Metodo)}>
                <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="efectivo">Efectivo</SelectItem>
                  <SelectItem value="tarjeta">Tarjeta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={guardandoEdit}
                onClick={() => setEditando(null)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={guardandoEdit}
                className="bg-primary text-primary-foreground hover:bg-primary/90 font-bold tracking-wider uppercase"
              >
                {guardandoEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
