import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus } from "lucide-react";
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
interface ManualLite { despachador_id: string; monto: number }
interface PagoCero {
  despachador_id: string;
  nombre: string;
}

export default function DespachadoresTab({ turno }: { turno: Turno }) {
  const [tds, setTds] = useState<TD[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [pedidos, setPedidos] = useState<PedidoLite[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [manuales, setManuales] = useState<ManualLite[]>([]);
  const [pagosCero, setPagosCero] = useState<PagoCero[]>([]);
  const [montosPagados, setMontosPagados] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const [agregarOpen, setAgregarOpen] = useState(false);
  const [despachadoresGlobales, setDespachadoresGlobales] = useState<DespachadorBusqueda[]>([]);
  const [cargandoBusqueda, setCargandoBusqueda] = useState(false);

  const [openId, setOpenId] = useState<string | null>(null);

  const cargarPagosDesp = async () => {
    const { data } = await supabase
      .from("pago_despachadores")
      .select("despachador_id, total_a_pagar, usuarios:despachador_id(nombre, apellido, nombre_completo)")
      .eq("turno_id", turno.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (data as any[]) ?? [];
    const montos: Record<string, number> = {};
    const cero: PagoCero[] = [];
    for (const p of rows) {
      const id = p.despachador_id as string;
      const total = Number(p.total_a_pagar) || 0;
      montos[id] = total;
      if (total === 0) {
        const nombre =
          p.usuarios?.nombre_completo ||
          [p.usuarios?.nombre, p.usuarios?.apellido].filter(Boolean).join(" ").trim() ||
          "Despachador";
        cero.push({ despachador_id: id, nombre });
      }
    }
    setMontosPagados(montos);
    setPagosCero(cero);
  };

  const cargar = async () => {
    const [tdRes, peRes, prRes, manRes] = await Promise.all([
      supabase.from("turno_despachadores").select("*").eq("turno_id", turno.id),
      supabase.from("pedidos").select("despachador_id,estado,costo_despacho").eq("turno_id", turno.id),
      supabase.from("prestamos_despachador").select("id,despachador_id,monto,devuelto").eq("turno_id", turno.id),
      supabase.from("despachos_manuales").select("despachador_id,monto").eq("turno_id", turno.id),
    ]);
    const tdRows = (tdRes.data as TD[]) ?? [];
    setTds(tdRows);
    setPedidos((peRes.data as PedidoLite[]) ?? []);
    setPrestamos((prRes.data as Prestamo[]) ?? []);
    setManuales((manRes.data as ManualLite[]) ?? []);
    if (tdRows.length > 0) {
      const ids = tdRows.map((r) => r.despachador_id);
      const { data: us } = await supabase
        .from("usuarios").select("id,nombre,nombre_completo").in("id", ids);
      setUsuarios((us as Usuario[]) ?? []);
    } else {
      setUsuarios([]);
    }
    await cargarPagosDesp();
    setLoading(false);
  };

  const recargarPrestamos = async () => {
    const { data } = await supabase
      .from("prestamos_despachador")
      .select("id,despachador_id,monto,devuelto")
      .eq("turno_id", turno.id);
    setPrestamos((data as Prestamo[]) ?? []);
  };

  const recargarManuales = async () => {
    const { data } = await supabase
      .from("despachos_manuales")
      .select("despachador_id,monto")
      .eq("turno_id", turno.id);
    setManuales((data as ManualLite[]) ?? []);
  };

  useEffect(() => { cargar(); /* eslint-disable-next-line */ }, [turno.id]);

  // Realtime: refrescar pedidos, manuales y pagos $0 cuando cambien en este turno
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
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "despachos_manuales", filter: `turno_id=eq.${turno.id}` },
        () => { void recargarManuales(); },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pago_despachadores", filter: `turno_id=eq.${turno.id}` },
        () => { void cargarPagosDesp(); },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno.id]);

  const nombreDe = (id: string) => {
    const u = usuarios.find((x) => x.id === id);
    return u ? (u.nombre_completo || u.nombre) : "Despachador";
  };

  const metricas = (despId: string) => {
    const propios = pedidos.filter((p) => p.despachador_id === despId);
    const entregados = propios.filter((p) => p.estado === "entregado");
    const cobrado = entregados.reduce((acc, p) => acc + (p.costo_despacho ?? 0), 0);
    const manualesMonto = manuales
      .filter((m) => m.despachador_id === despId)
      .reduce((acc, m) => acc + m.monto, 0);
    return { entregados: entregados.length, cobrado, manuales: manualesMonto };
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

      {pagosCero.length > 0 && (
        <div className="rounded-xl border border-warning/50 bg-warning/10 px-4 py-3 text-sm">
          <div className="flex items-start gap-2 text-warning">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0 space-y-1.5">
              <p className="font-semibold uppercase tracking-wider text-xs">
                Despachadores sin pago registrado en este turno
              </p>
              <ul className="space-y-0.5">
                {pagosCero.map((p) => (
                  <li key={p.despachador_id} className="font-medium">
                    - {p.nombre}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {tds.length === 0 ? (
        <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
          No hay despachadores en este turno
        </div>
      ) : (
        <div className="space-y-2">
          {tds.map((td) => {
            const m = metricas(td.despachador_id);
            const prestamosDesp = prestamos.filter((p) => p.despachador_id === td.despachador_id);
            const montoYa = montosPagados[td.despachador_id];
            return (
              <PagarDespachadorCard
                key={td.id}
                turnoId={turno.id}
                td={td}
                nombre={nombreDe(td.despachador_id)}
                entregados={m.entregados}
                cobrado={m.cobrado}
                manuales={m.manuales}
                prestamos={prestamosDesp}
                montoYaPagado={montoYa}
                cierreParcial
                onPrestamoChange={recargarPrestamos}
                onManualesChange={recargarManuales}
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
