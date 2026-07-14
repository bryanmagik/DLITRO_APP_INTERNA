import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Turno } from "../TurnoPage";
import PagarDespachadorCard from "@/components/PagarDespachadorCard";
import BuscadorDespachadores from "@/components/BuscadorDespachadores";
import {
  type DespachadorBusqueda,
  fetchDespachadoresGlobales,
  nombreDespachador,
} from "@/lib/despachadoresBusqueda";

interface TD {
  id: string;
  despachador_id: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  pagado: boolean | null;
  activo: boolean | null;
}
interface Usuario { id: string; nombre: string; nombre_completo: string | null }
interface PedidoLite { despachador_id: string | null; estado: string; costo_despacho: number | null }
interface Prestamo { id: string; despachador_id: string; monto: number; devuelto: boolean }

export default function DespachadoresTab({ turno }: { turno: Turno }) {
  const [tds, setTds] = useState<TD[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [pedidos, setPedidos] = useState<PedidoLite[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [loading, setLoading] = useState(true);

  const [agregarOpen, setAgregarOpen] = useState(false);
  const [despachadoresGlobales, setDespachadoresGlobales] = useState<DespachadorBusqueda[]>([]);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);

  const cargar = async () => {
    const [tdRes, peRes, prRes] = await Promise.all([
      supabase.from("turno_despachadores").select("*").eq("turno_id", turno.id),
      supabase.from("pedidos").select("despachador_id,estado,costo_despacho").eq("turno_id", turno.id),
      supabase.from("prestamos_despachador").select("id,despachador_id,monto,devuelto").eq("turno_id", turno.id),
    ]);
    const tdRows = (tdRes.data as TD[]) ?? [];
    setTds(tdRows);
    setPedidos((peRes.data as PedidoLite[]) ?? []);
    setPrestamos((prRes.data as Prestamo[]) ?? []);
    if (tdRows.length > 0) {
      const ids = tdRows.map((r) => r.despachador_id);
      const { data: us } = await supabase
        .from("usuarios").select("id,nombre,nombre_completo").in("id", ids);
      setUsuarios((us as Usuario[]) ?? []);
    } else {
      setUsuarios([]);
    }
    setLoading(false);
  };

  const recargarPrestamos = async () => {
    const { data } = await supabase
      .from("prestamos_despachador")
      .select("id,despachador_id,monto,devuelto")
      .eq("turno_id", turno.id);
    setPrestamos((data as Prestamo[]) ?? []);
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [turno.id]);

  // Realtime: refrescar pedidos cuando cambien en este turno
  useEffect(() => {
    const ch = supabase
      .channel(`desp-pedidos-${turno.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `turno_id=eq.${turno.id}` },
        async () => {
          const { data } = await supabase
            .from("pedidos")
            .select("despachador_id,estado,costo_despacho")
            .eq("turno_id", turno.id);
          setPedidos((data as PedidoLite[]) ?? []);
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [turno.id]);

  const nombreDe = (id: string) => {
    const u = usuarios.find((x) => x.id === id);
    return u ? (u.nombre_completo || u.nombre) : "Despachador";
  };

  const metricas = (despId: string) => {
    const propios = pedidos.filter((p) => p.despachador_id === despId);
    const entregados = propios.filter((p) => p.estado === "entregado");
    const cobrado = entregados.reduce((acc, p) => acc + (p.costo_despacho ?? 0), 0);
    return { entregados: entregados.length, cobrado };
  };

  const abrirAgregar = async () => {
    setAgregarOpen(true);
    setCargandoBusqueda(true);
    const { data, error } = await fetchDespachadoresGlobales();
    if (error) toast.error(`Error cargando despachadores: ${error}`);
    setDespachadoresGlobales(data);
    setCargandoBusqueda(false);
  };

  const sumarDespachador = async (d: DespachadorBusqueda) => {
    const { error } = await supabase.from("turno_despachadores").insert({
      turno_id: turno.id, despachador_id: d.id, activo: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success(`${nombreDespachador(d)} agregado`);
    setAgregarOpen(false);
    cargar();
  };

  const idsEnTurno = tds.map((t) => t.despachador_id);

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={abrirAgregar} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="h-4 w-4 mr-2" /> Agregar despachador
        </Button>
      </div>

      {tds.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
          No hay despachadores en este turno
        </div>
      ) : (
        <div className="space-y-2">
          {tds.map((td) => {
            const m = metricas(td.despachador_id);
            const pr = prestamos.find((p) => p.despachador_id === td.despachador_id) ?? null;
            return (
              <PagarDespachadorCard
                key={td.id}
                turnoId={turno.id}
                td={td}
                nombre={nombreDe(td.despachador_id)}
                entregados={m.entregados}
                cobrado={m.cobrado}
                prestamo={pr}
                cierreParcial
                onPrestamoChange={recargarPrestamos}
                expanded={openId === td.id}
                onToggle={(o) => setOpenId(o ? td.id : null)}
                onPagado={() => cargar()}
              />
            );
          })}
        </div>
      )}

      {/* Modal agregar */}
      <Dialog open={agregarOpen} onOpenChange={setAgregarOpen}>
        <DialogContent className="bg-card border-border max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">Agregar despachador</DialogTitle>
          </DialogHeader>
          <BuscadorDespachadores
            despachadores={despachadoresGlobales}
            loading={cargandoBusqueda}
            excluirIds={idsEnTurno}
            turnoIdActual={turno.id}
            onSeleccionar={sumarDespachador}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
