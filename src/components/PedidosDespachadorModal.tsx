import { useCallback, useEffect, useState } from "react";
import { Check, ClipboardList, Loader2, Pencil, RefreshCw, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Estado = "en_preparacion" | "listo" | "en_despacho" | "entregado" | "cancelado" | string;

const ESTADO_META: Record<string, { label: string; cls: string }> = {
  en_preparacion: { label: "En preparación", cls: "bg-warning/15 text-warning border-warning/30" },
  listo: { label: "Listo", cls: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  en_despacho: { label: "En despacho", cls: "bg-orange-500/15 text-orange-400 border-orange-500/30" },
  entregado: { label: "Entregado", cls: "bg-success/15 text-success border-success/30" },
  cancelado: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
};

interface PedidoDesp {
  numero_pedido: number;
  cliente_nombre: string;
  estado: Estado;
  total: number;
  costo_despacho: number | null;
  direccion_entrega: string | null;
}

interface DespachoManual {
  id: string;
  concepto: string;
  monto: number;
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

function normalizarEstado(estado: string): string {
  if (estado === "tomado") return "en_preparacion";
  return estado;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turnoId: string;
  despachadorId: string;
  nombre: string;
  onManualesChange?: () => void;
}

export default function PedidosDespachadorModal({
  open, onOpenChange, turnoId, despachadorId, nombre, onManualesChange,
}: Props) {
  const [pedidos, setPedidos] = useState<PedidoDesp[]>([]);
  const [manuales, setManuales] = useState<DespachoManual[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMonto, setEditingMonto] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const cargar = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [peRes, manRes] = await Promise.all([
        supabase
          .from("pedidos")
          .select("numero_pedido, cliente_nombre, estado, total, costo_despacho, direccion_entrega")
          .eq("turno_id", turnoId)
          .eq("despachador_id", despachadorId)
          .neq("estado", "cancelado")
          .order("numero_pedido", { ascending: false }),
        supabase
          .from("despachos_manuales")
          .select("id, concepto, monto")
          .eq("turno_id", turnoId)
          .eq("despachador_id", despachadorId)
          .order("created_at", { ascending: false }),
      ]);
      if (peRes.error) throw peRes.error;
      if (manRes.error) throw manRes.error;
      setPedidos(
        ((peRes.data as PedidoDesp[]) ?? []).map((p) => ({
          ...p,
          estado: normalizarEstado(p.estado),
        })),
      );
      setManuales((manRes.data as DespachoManual[]) ?? []);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [turnoId, despachadorId]);

  useEffect(() => {
    if (!open) return;
    cargar();
  }, [open, cargar]);

  useEffect(() => {
    if (!open) return;
    const ch = supabase
      .channel(`pedidos-desp-${turnoId}-${despachadorId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `turno_id=eq.${turnoId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { despachador_id?: string } | null;
          if (!row || row.despachador_id === despachadorId) cargar(true);
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "despachos_manuales", filter: `turno_id=eq.${turnoId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { despachador_id?: string } | null;
          if (!row || row.despachador_id === despachadorId) cargar(true);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [open, turnoId, despachadorId, cargar]);

  const eliminarManual = async (id: string) => {
    setDeletingId(id);
    try {
      const { error } = await supabase.from("despachos_manuales").delete().eq("id", id);
      if (error) throw error;
      setManuales((prev) => prev.filter((m) => m.id !== id));
      toast.success("Despacho manual eliminado");
      onManualesChange?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setDeletingId(null);
    }
  };

  const comenzarEdicion = (manual: DespachoManual) => {
    setEditingId(manual.id);
    setEditingMonto(String(manual.monto));
  };

  const cancelarEdicion = () => {
    setEditingId(null);
    setEditingMonto("");
  };

  const guardarMonto = async (id: string) => {
    const monto = Number.parseInt(editingMonto, 10);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("Ingresá un monto válido");
      return;
    }
    setSavingId(id);
    try {
      const { error } = await supabase
        .from("despachos_manuales")
        .update({ monto })
        .eq("id", id);
      if (error) throw error;
      setManuales((prev) => prev.map((m) => (m.id === id ? { ...m, monto } : m)));
      cancelarEdicion();
      toast.success("Monto actualizado");
      onManualesChange?.();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error");
    } finally {
      setSavingId(null);
    }
  };

  const total = pedidos.length;
  const entregados = pedidos.filter((p) => p.estado === "entregado").length;
  const enDespacho = pedidos.filter((p) => p.estado === "en_despacho").length;
  const totalDespachosPedidos = pedidos.reduce((sum, p) => sum + (p.costo_despacho ?? 0), 0);
  const totalManuales = manuales.reduce((sum, d) => sum + d.monto, 0);
  const totalDespachos = totalDespachosPedidos + totalManuales;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader className="flex-row items-center justify-between gap-2 space-y-0 pr-6">
          <DialogTitle className="font-display text-xl uppercase tracking-wider flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Pedidos de {nombre}
          </DialogTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => cargar(true)}
            disabled={refreshing || loading}
            className="uppercase tracking-wider text-xs shrink-0"
          >
            {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto min-h-0 space-y-3">
          <div className="border border-border rounded-lg divide-y divide-border">
            {loading ? (
              <div className="p-10 flex items-center justify-center text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando…
              </div>
            ) : pedidos.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No hay pedidos asignados
              </div>
            ) : (
              pedidos.map((p) => {
                const meta = ESTADO_META[p.estado] ?? {
                  label: p.estado,
                  cls: "bg-muted text-muted-foreground border-border",
                };
                return (
                  <div
                    key={p.numero_pedido}
                    className="px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5"
                  >
                    <span className="font-display text-lg font-bold text-primary leading-none shrink-0">
                      #{p.numero_pedido}
                    </span>
                    <span className="text-sm text-foreground truncate min-w-[7rem] max-w-[12rem] flex-1">
                      {p.cliente_nombre}
                    </span>
                    <Badge className={`${meta.cls} border text-[9px] px-1.5 py-0.5 font-bold uppercase tracking-wider shrink-0`} variant="outline">
                      {meta.label}
                    </Badge>
                    <span className="font-mono text-sm font-semibold text-foreground shrink-0 ml-auto">
                      {fmtCLP(p.total)}
                    </span>
                    {p.direccion_entrega && (
                      <p className="w-full text-[10px] text-muted-foreground truncate pl-0.5">
                        📍 {p.direccion_entrega}
                      </p>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1.5 px-0.5">
              Despachos manuales
            </p>
            <div className="border border-border rounded-lg divide-y divide-border">
              {loading ? null : manuales.length === 0 ? (
                <div className="p-4 text-center text-muted-foreground text-xs">
                  Sin despachos manuales
                </div>
              ) : (
                manuales.map((m) => (
                  <div key={m.id} className="px-3 py-2.5 flex items-center gap-3">
                    <span className="text-sm text-foreground truncate flex-1">{m.concepto}</span>
                    {editingId === m.id ? (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={editingMonto}
                          onChange={(e) => setEditingMonto(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") guardarMonto(m.id);
                            if (e.key === "Escape") cancelarEdicion();
                          }}
                          className="h-8 w-28 bg-background font-mono text-right"
                          autoFocus
                          disabled={savingId === m.id}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-success"
                          onClick={() => guardarMonto(m.id)}
                          disabled={savingId === m.id}
                          title="Guardar monto"
                        >
                          {savingId === m.id
                            ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            : <Check className="h-3.5 w-3.5" />}
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground"
                          onClick={cancelarEdicion}
                          disabled={savingId === m.id}
                          title="Cancelar"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <span className="font-mono text-sm font-semibold shrink-0">{fmtCLP(m.monto)}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-primary shrink-0"
                          onClick={() => comenzarEdicion(m)}
                          title="Editar monto"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      disabled={deletingId === m.id || editingId === m.id}
                      onClick={() => eliminarManual(m.id)}
                      title="Eliminar"
                    >
                      {deletingId === m.id
                        ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        : <Trash2 className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-1.5 text-sm shrink-0">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total pedidos asignados</span>
            <span className="font-mono font-semibold">{total}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">En despacho</span>
            <span className="font-mono font-semibold text-orange-400">{enDespacho}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Entregados</span>
            <span className="font-mono font-semibold text-success">{entregados}</span>
          </div>
          <div className="border-t border-border my-2" />
          <div className="flex justify-between">
            <span className="text-muted-foreground">Despachos de pedidos</span>
            <span className="font-mono font-semibold">{fmtCLP(totalDespachosPedidos)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Despachos manuales</span>
            <span className="font-mono font-semibold">{fmtCLP(totalManuales)}</span>
          </div>
          <div className="flex justify-between items-baseline">
            <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Total despachos
            </span>
            <span className="font-mono text-xl font-bold text-primary">{fmtCLP(totalDespachos)}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
