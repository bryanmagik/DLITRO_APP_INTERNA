import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Bike, Package, Calculator, Check, X, Eye, AlertTriangle, ShoppingCart, ChevronDown, Clock, ClipboardList } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import InventarioInsumosTable from "@/components/InventarioInsumosTable";
import { formatearStockDisplay } from "@/utils/stockUtils";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import type { Turno } from "./TurnoPage";
import PagarDespachadorCard from "@/components/PagarDespachadorCard";
import { useAuthStore } from "@/stores/authStore";
import { puedeCerrarTurno } from "@/lib/turnoPermisos";
import { minimosDe } from "@/lib/logistica";
import { INVENTARIO_SELECT, ordenarInventario, type ConfigInventarioFields } from "@/lib/inventarioOperativo";

const TOLERANCIA = 500;

const ESTADOS_PENDIENTES = ["en_preparacion", "listo", "en_despacho"] as const;

const ESTADO_PEDIDO_LABEL: Record<string, string> = {
  en_preparacion: "En preparación",
  listo: "Listo",
  en_despacho: "En despacho",
};

interface PedidoPendiente {
  id: string;
  numero_pedido: number;
  estado: string;
  cliente_nombre: string;
  hora_agendada: string | null;
}

function labelPedidoPendiente(p: PedidoPendiente): string {
  if (p.hora_agendada) return "Agendado";
  return ESTADO_PEDIDO_LABEL[p.estado] ?? p.estado;
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

interface TD {
  id: string;
  despachador_id: string;
  hora_entrada: string | null;
  hora_salida: string | null;
  pagado: boolean | null;
}
interface Usuario { id: string; nombre: string; nombre_completo: string | null }
interface PedidoLite { despachador_id: string | null; estado: string; costo_despacho: number | null }

interface DespRow {
  td: TD;
  nombre: string;
  entregados: number;
  cobrado: number;
  manuales: number;
  pagado: boolean;
}

interface Insumo extends ConfigInventarioFields { id: string; nombre: string; unidad: string | null; tipo: string }
interface StockRow {
  insumo_id: string;
  cantidad: number;
  stock_minimo: number | null;
  stock_minimo_observacion: number | null;
  stock_minimo_critico: number | null;
}
interface InvRow extends ConfigInventarioFields {
  insumo_id: string;
  nombre: string;
  unidad: string;
  tipo: string;
  sistema: number;
  minimo: number;
  formato_mayor: string | null;
  unidades_por_formato: number | null;
  ml_por_unidad: number | null;
  cantidadReal: number;
  contado: boolean;
}

interface PagoTurno { id: string; monto: number; metodo: string; referencia: string | null; pedido_id: string | null }
interface GastoLite { monto: number; metodo: string | null; concepto: string }
interface PagoDesp {
  total_a_pagar: number;
  despachador_id?: string;
  nombre: string;
}
interface PrestamoDesp { id: string; despachador_id: string; monto: number; devuelto: boolean }

type SectionKey = "despachadores" | "inventario" | "caja";

export default function CierreTurnoModal({
  turno, open, onOpenChange, onCerrado,
}: {
  turno: Turno;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCerrado: () => void;
}) {
  const navigate = useNavigate();
  const { perfil } = useAuthStore();
  const [validandoPedidos, setValidandoPedidos] = useState(true);
  const [pedidosPendientes, setPedidosPendientes] = useState<PedidoPendiente[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openSection, setOpenSection] = useState<SectionKey | null>("despachadores");
  const [sucursalNombre, setSucursalNombre] = useState<string>("");

  // Step 1
  const [desps, setDesps] = useState<DespRow[]>([]);

  // Step 2
  const [inv, setInv] = useState<InvRow[]>([]);
  const [inventarioGuardado, setInventarioGuardado] = useState(false);
  const [guardandoProgreso, setGuardandoProgreso] = useState(false);
  const [creandoReposicion, setCreandoReposicion] = useState(false);
  const [reposicionCreada, setReposicionCreada] = useState(false);

  // Step 3
  const [pagos, setPagos] = useState<PagoTurno[]>([]);
  const [gastos, setGastos] = useState<GastoLite[]>([]);
  const [pagosDesp, setPagosDesp] = useState<PagoDesp[]>([]);
  const [prestamos, setPrestamos] = useState<PrestamoDesp[]>([]);
  const [efectivoDeclaradoCaja, setEfectivoDeclaradoCaja] = useState("");
  const [efectivoDeclaradoSobre, setEfectivoDeclaradoSobre] = useState("");
  const [observacion, setObservacion] = useState("");
  const [verTransfer, setVerTransfer] = useState(false);
  const [confirmCierreSinPago, setConfirmCierreSinPago] = useState(false);

  // Incrementa cada vez que el modal abre para forzar remount de Step2,
  // garantizando que los defaultValue de los inputs se reseteen correctamente.
  const [invKey, setInvKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    setEfectivoDeclaradoCaja("");
    setEfectivoDeclaradoSobre("");
    setObservacion("");
    setInventarioGuardado(false);
    setReposicionCreada(false);
    setConfirmCierreSinPago(false);
    setOpenSection("despachadores");
    setInvKey((k) => k + 1);
    setPedidosPendientes([]);
    setValidandoPedidos(true);
    setLoading(true);
    validarYCargar();
    // eslint-disable-next-line
  }, [open, turno.id]);

  const validarYCargar = async () => {
    setValidandoPedidos(true);
    try {
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, estado, cliente_nombre, hora_agendada")
        .eq("turno_id", turno.id)
        .in("estado", [...ESTADOS_PENDIENTES])
        .order("numero_pedido", { ascending: true });
      if (error) throw error;
      const pendientes = (data as PedidoPendiente[]) ?? [];
      setPedidosPendientes(pendientes);
      if (pendientes.length === 0) {
        await cargarTodo();
      } else {
        setLoading(false);
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error validando pedidos");
      onOpenChange(false);
    } finally {
      setValidandoPedidos(false);
    }
  };

  const irAMisPedidos = () => {
    onOpenChange(false);
    navigate("/turno/pedidos?tab=mis");
  };

  const cargarTodo = async () => {
    setLoading(true);
    try {
      const [tdRes, peRes, insRes, stRes, pgRes, gaRes, pdRes, suRes, prRes, manRes, icRes] = await Promise.all([
        supabase.from("turno_despachadores").select("*").eq("turno_id", turno.id),
        supabase.from("pedidos").select("despachador_id,estado,costo_despacho").eq("turno_id", turno.id),
        supabase.from("insumos").select(INVENTARIO_SELECT).eq("activo", true),
        supabase.from("stock_sucursal").select("insumo_id,cantidad,stock_minimo,stock_minimo_observacion,stock_minimo_critico").eq("sucursal_id", turno.sucursal_id),
        supabase.from("pagos_turno").select("id,monto,metodo,referencia,pedido_id").eq("turno_id", turno.id),
        supabase.from("gastos_turno").select("monto,metodo,concepto").eq("turno_id", turno.id),
        supabase.from("pago_despachadores")
          .select("total_a_pagar, despachador_id, usuarios:despachador_id(nombre, nombre_completo)")
          .eq("turno_id", turno.id)
          .eq("pagado", true),
        supabase.from("sucursales").select("nombre").eq("id", turno.sucursal_id).maybeSingle(),
        supabase.from("prestamos_despachador").select("id,despachador_id,monto,devuelto").eq("turno_id", turno.id),
        supabase.from("despachos_manuales").select("despachador_id,monto").eq("turno_id", turno.id),
        supabase.from("inventario_cierre").select("insumo_id, cantidad_real").eq("turno_id", turno.id),
      ]);

      setSucursalNombre(((suRes.data as { nombre?: string } | null)?.nombre) ?? "");

      const tdRows = (tdRes.data as TD[]) ?? [];
      const pedidos = (peRes.data as PedidoLite[]) ?? [];
      const manualesRows = (manRes.data as { despachador_id: string; monto: number }[]) ?? [];
      const ids = tdRows.map((r) => r.despachador_id);
      let usuarios: Usuario[] = [];
      if (ids.length) {
        const { data: us } = await supabase
          .from("usuarios").select("id,nombre,nombre_completo").in("id", ids);
        usuarios = (us as Usuario[]) ?? [];
      }

      setDesps(tdRows.map((td) => {
        const u = usuarios.find((x) => x.id === td.despachador_id);
        const propios = pedidos.filter((p) => p.despachador_id === td.despachador_id);
        const entregados = propios.filter((p) => p.estado === "entregado");
        const cobrado = entregados.reduce((acc, p) => acc + (p.costo_despacho ?? 0), 0);
        const manuales = manualesRows
          .filter((m) => m.despachador_id === td.despachador_id)
          .reduce((acc, m) => acc + m.monto, 0);
        return {
          td,
          nombre: u ? (u.nombre_completo || u.nombre) : "Despachador",
          entregados: entregados.length,
          cobrado,
          manuales,
          pagado: !!td.pagado,
        };
      }));

      const insumos = ordenarInventario((insRes.data as unknown as (Insumo & { formato_mayor: string | null; unidades_por_formato: number | null; ml_por_unidad: number | null })[]) ?? []);
      const stock = (stRes.data as StockRow[]) ?? [];
      const guardados = (icRes.data as { insumo_id: string; cantidad_real: number | null }[]) ?? [];
      const guardadosByInsumo = new Map(guardados.map((g) => [g.insumo_id, g]));
      setInv(insumos.map((i) => {
        const s = stock.find((x) => x.insumo_id === i.id);
        const g = guardadosByInsumo.get(i.id);
        const cantidadGuardada = g?.cantidad_real;
        const contado = cantidadGuardada != null;
        return {
          insumo_id: i.id,
          nombre: i.nombre,
          unidad: i.unidad ?? "",
          tipo: i.tipo,
          sistema: Number(s?.cantidad ?? 0),
          minimo: (() => {
            const { obs, crit } = minimosDe(s);
            return crit || obs;
          })(),
          formato_mayor: i.formato_mayor ?? null,
          unidades_por_formato: i.unidades_por_formato != null ? Number(i.unidades_por_formato) : null,
          ml_por_unidad: i.ml_por_unidad != null ? Number(i.ml_por_unidad) : null,
          seccion_inventario: i.seccion_inventario,
          grupo_inventario: i.grupo_inventario,
          presentacion_inventario: i.presentacion_inventario,
          orden_visual: i.orden_visual,
          orden_presentacion: i.orden_presentacion,
          tipo_conteo: i.tipo_conteo,
          paso_conteo: i.paso_conteo != null ? Number(i.paso_conteo) : null,
          maximo_conteo: i.maximo_conteo != null ? Number(i.maximo_conteo) : null,
          cantidadReal: contado ? Number(cantidadGuardada) : 0,
          contado,
        };
      }));

      setPagos((pgRes.data as PagoTurno[]) ?? []);
      setGastos((gaRes.data as GastoLite[]) ?? []);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pagosDespRows = ((pdRes.data as any[]) ?? []).map((p) => ({
        total_a_pagar: Number(p.total_a_pagar) || 0,
        despachador_id: p.despachador_id as string | undefined,
        nombre:
          p.usuarios?.nombre_completo ||
          p.usuarios?.nombre ||
          "Despachador",
      }));
      setPagosDesp(pagosDespRows);
      setPrestamos((prRes.data as PrestamoDesp[]) ?? []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error cargando cierre");
    } finally {
      setLoading(false);
    }
  };

  // ----- Step 1 -----
  const onDespPagado = (id: string, total: number, nombre: string, despachadorId: string) => {
    setDesps((prev) => prev.map((d) => d.td.id === id ? { ...d, pagado: true } : d));
    setPagosDesp((prev) => {
      const sinEste = prev.filter((p) => p.despachador_id !== despachadorId);
      return [...sinEste, { total_a_pagar: total, nombre, despachador_id: despachadorId }];
    });
  };

  const todosPagados = desps.every((d) => d.pagado);

  // ----- Step 2 -----
  const updateInv = (id: string, patch: Partial<Pick<InvRow, "cantidadReal" | "contado">>) => {
    setInv((prev) => prev.map((r) => r.insumo_id === id ? { ...r, ...patch } : r));
    if (inventarioGuardado) setInventarioGuardado(false);
    if (reposicionCreada) setReposicionCreada(false);
  };
  const calcReal = (r: InvRow) => {
    // 0 es válido (sin stock); solo contado=false significa “aún no ingresado”
    const n = Number(r.cantidadReal);
    if (!Number.isFinite(n) || n < 0) return 0;
    return n;
  };
  const conteoTexto = (r: InvRow) => {
    const n = calcReal(r);
    if (n === 0) return "0";
    return formatearStockDisplay(n, r) ?? "0";
  };
  const todosInventariados = inv.length > 0 && inv.every((r) => r.contado);
  const contadosCount = inv.filter((r) => r.contado).length;

  const insumosCriticos = useMemo(() => {
    if (!inventarioGuardado) return [];
    return inv
      .map((r) => ({ ...r, realNum: calcReal(r) }))
      .filter((r) => r.minimo > 0 && r.realNum < r.minimo)
      .sort((a, b) => (a.realNum - a.minimo) - (b.realNum - b.minimo));
  }, [inv, inventarioGuardado]);

  const guardarInventario = async () => {
    const rows = inv
      .filter((r) => r.contado)
      .map((r) => ({
        turno_id: turno.id,
        insumo_id: r.insumo_id,
        cantidad_ideal: r.sistema,
        cantidad_real: calcReal(r),
        conteo_original: conteoTexto(r),
      }));
    if (rows.length === 0) throw new Error("Contá al menos un insumo antes de guardar");
    const { error } = await supabase
      .from("inventario_cierre")
      .upsert(rows, { onConflict: "turno_id,insumo_id" });
    if (error) throw error;
  };

  const guardarProgreso = async () => {
    if (contadosCount === 0) {
      toast.error("Contá al menos un insumo antes de guardar progreso");
      return;
    }
    setGuardandoProgreso(true);
    try {
      await guardarInventario();
      toast.success(`✅ Progreso guardado — ${contadosCount} insumos contados`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error guardando progreso");
    } finally {
      setGuardandoProgreso(false);
    }
  };

  const guardarYRevisar = async () => {
    setSaving(true);
    try {
      await guardarInventario();
      setInventarioGuardado(true);
      toast.success("Inventario guardado");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error guardando inventario");
    } finally {
      setSaving(false);
    }
  };

  const crearReposicion = async () => {
    if (insumosCriticos.length === 0) return;
    setCreandoReposicion(true);
    try {
      const { data: ped, error: e1 } = await supabase
        .from("pedidos_logistica")
        .insert({
          sucursal_id: turno.sucursal_id,
          estado: "borrador",
          notas: `Reposición automática - cierre turno ${new Date().toLocaleDateString("es-CL")}`,
        })
        .select("id")
        .single();
      if (e1) throw e1;
      const items = insumosCriticos.map((r) => ({
        pedido_id: ped.id,
        insumo_id: r.insumo_id,
        cantidad_solicitada: Math.max(1, Math.ceil(r.minimo * 2 - r.realNum)),
      }));
      const { error: e2 } = await supabase.from("pedidos_logistica_items").insert(items);
      if (e2) throw e2;
      setReposicionCreada(true);
      toast.success(`Pedido de reposición creado con ${items.length} insumos`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error creando pedido");
    } finally {
      setCreandoReposicion(false);
    }
  };

  // ----- Step 3 -----
  const totalEfectivoVentas = pagos.filter((p) => p.metodo === "efectivo").reduce((a, p) => a + p.monto, 0);
  const totalTransferencias = pagos.filter((p) => p.metodo === "transferencia").reduce((a, p) => a + p.monto, 0);
  const totalTarjeta = pagos.filter((p) => p.metodo === "tarjeta").reduce((a, p) => a + p.monto, 0);
  const transferenciasList = pagos.filter((p) => p.metodo === "transferencia");
  const esIngresoCaja = (c: string) => c.startsWith("Ingreso caja chica");
  const totalGastosEfectivo = gastos
    .filter((g) => g.metodo === "efectivo" && !esIngresoCaja(g.concepto))
    .reduce((a, g) => a + g.monto, 0);
  const totalPagoDesp = pagosDesp.reduce((a, p) => a + (p.total_a_pagar > 0 ? p.total_a_pagar : 0), 0);
  const cajaChicaInicial = turno.caja_chica_apertura;
  const efectivoGanancias = totalEfectivoVentas - totalGastosEfectivo - totalPagoDesp;
  const cajaChicaFinal = efectivoGanancias >= 0 ? cajaChicaInicial : cajaChicaInicial + efectivoGanancias;
  const totalEnCaja = efectivoGanancias >= 0 ? cajaChicaFinal + efectivoGanancias : cajaChicaFinal;
  const efectivoEsperado = totalEnCaja;

  const recargarPrestamos = async () => {
    const { data } = await supabase
      .from("prestamos_despachador")
      .select("id,despachador_id,monto,devuelto")
      .eq("turno_id", turno.id);
    setPrestamos((data as PrestamoDesp[]) ?? []);
  };

  const recargarManualesDesps = async () => {
    const { data } = await supabase
      .from("despachos_manuales")
      .select("despachador_id,monto")
      .eq("turno_id", turno.id);
    const rows = (data as { despachador_id: string; monto: number }[]) ?? [];
    setDesps((prev) =>
      prev.map((d) => ({
        ...d,
        manuales: rows
          .filter((m) => m.despachador_id === d.td.despachador_id)
          .reduce((acc, m) => acc + m.monto, 0),
      })),
    );
  };
  const cajaChicaEsperada = cajaChicaFinal;
  const sobreEsperado = efectivoGanancias > 0 ? efectivoGanancias : 0;
  const mostrarSobre = efectivoGanancias > 0;

  const parseMonto = (v: string) => parseInt(v || "0", 10) || 0;
  const declaradoCaja = parseMonto(efectivoDeclaradoCaja);
  const declaradoSobre = parseMonto(efectivoDeclaradoSobre);
  const declaradoTotal = declaradoCaja + (mostrarSobre ? declaradoSobre : 0);
  const diffCaja = declaradoCaja - cajaChicaEsperada;
  const diffSobre = mostrarSobre ? declaradoSobre - sobreEsperado : 0;
  const diferenciaTotal = declaradoTotal - efectivoEsperado;

  const declaracionCompleta = efectivoDeclaradoCaja !== "" && (!mostrarSobre || efectivoDeclaradoSobre !== "");
  const cuadra = declaracionCompleta && Math.abs(diferenciaTotal) <= TOLERANCIA;
  const descuadre = declaracionCompleta && Math.abs(diferenciaTotal) > TOLERANCIA;

  const despachadoresSinPago = useMemo(
    () => pagosDesp.filter((p) => !(p.total_a_pagar > 0)),
    [pagosDesp],
  );

  const solicitarCierre = () => {
    if (despachadoresSinPago.length > 0) {
      setConfirmCierreSinPago(true);
      return;
    }
    void cerrarTurno();
  };

  const cerrarTurno = async () => {
    setConfirmCierreSinPago(false);
    if (!puedeCerrarTurno(turno.tomador_id, perfil?.id, perfil?.rol)) {
      toast.error("Solo puede cerrar el turno quien lo abrió");
      return;
    }
    if (descuadre && !observacion.trim()) {
      toast.error("La observación es obligatoria si hay descuadre"); return;
    }
    setSaving(true);
    try {
      if (!inventarioGuardado) await guardarInventario();
      const { error: eDesp } = await supabase
        .from("turno_despachadores")
        .update({ activo: false })
        .eq("turno_id", turno.id);
      if (eDesp) throw eDesp;
      const { error } = await supabase.from("turnos").update({
        estado: "cerrado",
        closed_at: new Date().toISOString(),
        efectivo_declarado_caja_chica: declaradoCaja,
        efectivo_declarado_sobre: mostrarSobre ? declaradoSobre : 0,
        efectivo_declarado: declaradoTotal,
        efectivo_sistema: efectivoEsperado,
        observacion_descuadre: descuadre ? observacion.trim() : null,
      }).eq("id", turno.id);
      if (error) throw error;
      toast.success("Turno cerrado");
      onOpenChange(false);
      onCerrado();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Error cerrando turno");
    } finally {
      setSaving(false);
    }
  };

  // ----- Completion flags -----
  const despachadoresCompleto = desps.length > 0 && desps.every((d) => d.pagado);
  const inventarioCompleto = inventarioGuardado;
  const cajaCompleta = declaracionCompleta && (cuadra || (descuadre && observacion.trim() !== ""));
  const completados = [despachadoresCompleto, inventarioCompleto, cajaCompleta].filter(Boolean).length;
  const todoCompleto = despachadoresCompleto && inventarioCompleto && cajaCompleta;

  const fechaHoy = new Date().toLocaleDateString("es-CL", { day: "2-digit", month: "long", year: "numeric" });

  const toggleSection = (k: SectionKey) => setOpenSection((cur) => (cur === k ? null : k));

  const bloqueadoPorPedidos = pedidosPendientes.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-0 bg-background border-0 flex flex-col gap-0">
        {validandoPedidos ? (
          <>
            <DialogHeader className="px-3 sm:px-6 py-3 sm:py-4 border-b border-border flex-row items-center justify-between space-y-0 gap-3 sm:gap-4">
              <DialogTitle className="font-display text-2xl uppercase tracking-wider truncate">
                Cierre de turno
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
            </DialogHeader>
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verificando pedidos pendientes…
            </div>
          </>
        ) : bloqueadoPorPedidos ? (
          <>
            <DialogHeader className="px-3 sm:px-6 py-3 sm:py-4 border-b border-border flex-row items-center justify-between space-y-0 gap-3 sm:gap-4">
              <DialogTitle className="font-display text-2xl uppercase tracking-wider truncate text-destructive">
                No puedes cerrar el turno
              </DialogTitle>
              <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto p-3 sm:p-6">
              <div className="max-w-xl mx-auto space-y-6">
                <div className="flex items-start gap-4 rounded-xl border border-warning/40 bg-warning/10 p-5">
                  <AlertTriangle className="h-8 w-8 text-warning shrink-0 mt-0.5" />
                  <div className="space-y-2">
                    <p className="font-display text-xl text-foreground">
                      Quedan {pedidosPendientes.length} pedido{pedidosPendientes.length !== 1 ? "s" : ""} sin completar
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Debes entregar o cancelar todos los pedidos antes de cerrar el turno.
                    </p>
                  </div>
                </div>
                <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
                  {pedidosPendientes.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-4 px-4 py-3">
                      <div className="min-w-0">
                        <span className="font-mono font-semibold text-foreground">#{p.numero_pedido}</span>
                        <span className="text-muted-foreground mx-2">—</span>
                        <span className="text-foreground">{p.cliente_nombre}</span>
                      </div>
                      <span className="text-xs uppercase tracking-wider font-bold px-2 py-1 rounded border border-border bg-secondary/40 text-muted-foreground shrink-0">
                        {labelPedidoPendiente(p)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="border-t border-border px-3 sm:px-6 py-3 sm:py-4 flex flex-wrap items-center justify-end gap-2 sm:gap-3 bg-card">
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <Button
                onClick={irAMisPedidos}
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold gap-2"
              >
                <ClipboardList className="h-4 w-4" /> Ver pedidos
              </Button>
            </div>
          </>
        ) : (
          <>
        <DialogHeader className="px-3 sm:px-6 py-3 sm:py-4 border-b border-border flex-row items-center justify-between space-y-0 gap-3 sm:gap-4">
          <div className="min-w-0">
            <DialogTitle className="font-display text-lg sm:text-2xl uppercase tracking-wider truncate">
              Cierre de turno{sucursalNombre && ` — ${sucursalNombre}`} — {fechaHoy}
            </DialogTitle>
            <div className="flex items-center gap-3 mt-1">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {completados}/3 completados
              </span>
              <div className="flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className={`h-1.5 w-8 rounded-full ${i < completados ? "bg-success" : "bg-border"}`} />
                ))}
              </div>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)}><X className="h-5 w-5" /></Button>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-3 sm:p-6">
          {loading ? (
            <div className="h-full flex items-center justify-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
            </div>
          ) : (
            <div className="max-w-5xl mx-auto space-y-4">
              <SectionCard isOpen={openSection === "despachadores"} onToggle={() => toggleSection("despachadores")} title="Pago a despachadores" icon={Bike} done={despachadoresCompleto}>
                {desps.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No hay despachadores en este turno</div>
                ) : (
                  <Step1
                    desps={desps}
                    turnoId={turno.id}
                    prestamos={prestamos}
                    pagosDesp={pagosDesp}
                    onPrestamoChange={recargarPrestamos}
                    onManualesChange={recargarManualesDesps}
                    onPagado={onDespPagado}
                  />
                )}
              </SectionCard>

              <SectionCard isOpen={openSection === "inventario"} onToggle={() => toggleSection("inventario")} title="Inventario de cierre" icon={Package} done={inventarioCompleto}>
                {!inventarioGuardado && inv.length > 0 && (
                  <div className="sticky top-0 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                    <p className="text-sm text-muted-foreground">
                      Guardado: <span className="font-mono font-medium text-foreground">{contadosCount}/{inv.length}</span> insumos contados 💾
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={guardarProgreso}
                      disabled={contadosCount === 0 || guardandoProgreso || saving}
                      className="uppercase tracking-wider font-bold"
                    >
                      {guardandoProgreso ? <Loader2 className="h-4 w-4 animate-spin" /> : "💾 Guardar progreso"}
                    </Button>
                  </div>
                )}
                <Step2
                  key={invKey}
                  inv={inv}
                  updateInv={updateInv}
                  inventarioGuardado={inventarioGuardado}
                  insumosCriticos={insumosCriticos}
                  crearReposicion={crearReposicion}
                  creandoReposicion={creandoReposicion}
                  reposicionCreada={reposicionCreada}
                />
                {!inventarioGuardado && (
                  <div className="flex justify-end mt-4">
                    <Button
                      onClick={guardarYRevisar}
                      disabled={!todosInventariados || saving || guardandoProgreso}
                      className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Finalizar inventario"}
                    </Button>
                  </div>
                )}
              </SectionCard>

              <SectionCard isOpen={openSection === "caja"} onToggle={() => toggleSection("caja")} title="Cuadre de caja" icon={Calculator} done={cajaCompleta}>
                <Step3
                  cajaChicaInicial={cajaChicaInicial}
                  cajaChicaFinal={cajaChicaFinal}
                  cajaChicaEsperada={cajaChicaEsperada}
                  sobreEsperado={sobreEsperado}
                  mostrarSobre={mostrarSobre}
                  efectivoGanancias={efectivoGanancias}
                  totalEnCaja={totalEnCaja}
                  totalEfectivoVentas={totalEfectivoVentas}
                  totalTransferencias={totalTransferencias}
                  totalTarjeta={totalTarjeta}
                  totalGastosEfectivo={totalGastosEfectivo}
                  totalPagoDesp={totalPagoDesp}
                  pagosDespDetalle={pagosDesp}
                  efectivoEsperado={efectivoEsperado}
                  efectivoDeclaradoCaja={efectivoDeclaradoCaja}
                  setEfectivoDeclaradoCaja={setEfectivoDeclaradoCaja}
                  efectivoDeclaradoSobre={efectivoDeclaradoSobre}
                  setEfectivoDeclaradoSobre={setEfectivoDeclaradoSobre}
                  diffCaja={diffCaja}
                  diffSobre={diffSobre}
                  diferenciaTotal={diferenciaTotal}
                  declaracionCompleta={declaracionCompleta}
                  cuadra={cuadra}
                  descuadre={descuadre}
                  observacion={observacion}
                  setObservacion={setObservacion}
                  transferenciasList={transferenciasList}
                  setVerTransfer={setVerTransfer}
                />
              </SectionCard>
            </div>
          )}
        </div>

        <div className="border-t border-border px-3 sm:px-6 py-3 sm:py-4 grid grid-cols-2 items-center bg-card gap-2 sm:gap-4">
          <Button variant="ghost" className="justify-self-start" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <div className="flex min-w-0 items-center justify-end gap-3">
            {!todoCompleto && (
              <span className="text-xs uppercase tracking-widest text-muted-foreground hidden sm:inline">
                Completá las 3 secciones para cerrar el turno
              </span>
            )}
            <Button
              onClick={solicitarCierre}
              disabled={saving || !todoCompleto}
              size="lg"
              className={`max-w-full px-3 sm:px-8 uppercase tracking-wider font-bold ${cuadra ? "bg-success text-success-foreground hover:bg-success/90" : "bg-destructive text-destructive-foreground hover:bg-destructive/90"}`}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : cuadra ? "Cerrar turno" : "Cerrar con descuadre"}
            </Button>
          </div>
        </div>

        {/* detalle transferencias */}
        <Dialog open={verTransfer} onOpenChange={setVerTransfer}>
          <DialogContent className="bg-card border-border">
            <DialogHeader><DialogTitle className="font-display text-2xl">Transferencias</DialogTitle></DialogHeader>
            {transferenciasList.length === 0 ? (
              <p className="text-muted-foreground text-sm">Sin transferencias.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {transferenciasList.map((p) => (
                  <div key={p.id} className="flex items-center justify-between p-3 rounded-md border border-border bg-background">
                    <div className="text-xs text-muted-foreground">{p.referencia || "—"}</div>
                    <div className="font-mono text-foreground">{fmtCLP(p.monto)}</div>
                  </div>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* aviso despachadores $0 */}
        <Dialog open={confirmCierreSinPago} onOpenChange={setConfirmCierreSinPago}>
          <DialogContent className="bg-card border-border max-w-md">
            <DialogHeader>
              <DialogTitle className="font-display text-xl flex items-center gap-2 text-warning">
                <AlertTriangle className="h-5 w-5" />
                Despachadores sin pago
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Hay {despachadoresSinPago.length} despachador{despachadoresSinPago.length !== 1 ? "es" : ""} sin pago registrado:
              </p>
              <ul className="space-y-1 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2">
                {despachadoresSinPago.map((p, i) => (
                  <li key={`${p.despachador_id ?? p.nombre}-${i}`} className="text-warning font-medium">
                    - {p.nombre}
                  </li>
                ))}
              </ul>
              <p className="text-foreground">¿Confirmar cierre de turno de todas formas?</p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setConfirmCierreSinPago(false)} disabled={saving}>
                Cancelar
              </Button>
              <Button
                onClick={() => void cerrarTurno()}
                disabled={saving}
                className="bg-warning text-warning-foreground hover:bg-warning/90 uppercase tracking-wider font-bold"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirmar cierre"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Step1({
  desps, turnoId, prestamos, pagosDesp, onPrestamoChange, onManualesChange, onPagado,
}: {
  desps: DespRow[];
  turnoId: string;
  prestamos: PrestamoDesp[];
  pagosDesp: PagoDesp[];
  onPrestamoChange: () => void;
  onManualesChange: () => void;
  onPagado: (id: string, total: number, nombre: string, despachadorId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  if (desps.length === 0) {
    return <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">No hay despachadores en este turno</div>;
  }
  return (
    <div className="space-y-2">
      {desps.map((d) => {
        const prestamosDesp = prestamos.filter((p) => p.despachador_id === d.td.despachador_id);
        const pagoPrev = pagosDesp.find((p) => p.despachador_id === d.td.despachador_id);
        return (
        <PagarDespachadorCard
          key={d.td.id}
          turnoId={turnoId}
          td={d.td}
          nombre={d.nombre}
          entregados={d.entregados}
          cobrado={d.cobrado}
          manuales={d.manuales}
          prestamos={prestamosDesp}
          montoYaPagado={pagoPrev?.total_a_pagar}
          onPrestamoChange={onPrestamoChange}
          onManualesChange={onManualesChange}
          expanded={openId === d.td.id}
          onToggle={(o) => setOpenId(o ? d.td.id : null)}
          onPagado={(total) => onPagado(d.td.id, total, d.nombre, d.td.despachador_id)}
        />
        );
      })}
    </div>
  );
}

interface CriticoRow extends InvRow { realNum: number }
function Step2({
  inv, updateInv, inventarioGuardado, insumosCriticos, crearReposicion, creandoReposicion, reposicionCreada,
}: {
  inv: InvRow[];
  updateInv: (id: string, patch: Partial<Pick<InvRow, "cantidadReal" | "contado">>) => void;
  inventarioGuardado: boolean;
  insumosCriticos: CriticoRow[];
  crearReposicion: () => void;
  creandoReposicion: boolean;
  reposicionCreada: boolean;
}) {
  if (inv.length === 0) {
    return <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">No hay insumos de preparación con stock asignado</div>;
  }
  return (
    <div className="space-y-4">
    {inventarioGuardado && (
      <div className={`rounded-xl border p-5 ${insumosCriticos.length === 0 ? "border-success/40 bg-success/10" : "border-warning/40 bg-warning/10"}`}>
        {insumosCriticos.length === 0 ? (
          <div className="flex items-center gap-3 text-success">
            <Check className="h-5 w-5" />
            <span className="font-display text-lg">Todo el stock está sobre el mínimo</span>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                <h3 className="font-display text-xl">Insumos críticos ({insumosCriticos.length})</h3>
              </div>
              <Button
                onClick={crearReposicion}
                disabled={creandoReposicion || reposicionCreada}
                className="bg-primary text-primary-foreground hover:bg-primary/90 uppercase tracking-wider font-bold"
              >
                {creandoReposicion ? <Loader2 className="h-4 w-4 animate-spin" /> : reposicionCreada ? <><Check className="h-4 w-4 mr-2" /> Pedido creado</> : <><ShoppingCart className="h-4 w-4 mr-2" /> Crear pedido de reposición</>}
              </Button>
            </div>
            <div className="bg-card border border-border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-secondary/40 border-b border-border">
                  <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
                    <th className="px-4 py-2">Insumo</th>
                    <th className="px-4 py-2 text-right">Actual</th>
                    <th className="px-4 py-2 text-right">Mínimo</th>
                    <th className="px-4 py-2 text-right">Faltante</th>
                  </tr>
                </thead>
                <tbody>
                  {insumosCriticos.map((r) => {
                    const cero = r.realNum === 0;
                    return (
                      <tr key={r.insumo_id} className={`border-b border-border last:border-0 ${cero ? "bg-destructive/10" : "bg-warning/5"}`}>
                        <td className={`px-4 py-2 font-medium ${cero ? "text-destructive" : "text-warning"}`}>{r.nombre}</td>
                        <td className={`px-4 py-2 text-right font-mono ${cero ? "text-destructive" : "text-foreground"}`}>{r.realNum}</td>
                        <td className="px-4 py-2 text-right font-mono text-muted-foreground">{r.minimo}</td>
                        <td className={`px-4 py-2 text-right font-mono ${cero ? "text-destructive font-bold" : "text-warning"}`}>
                          -{(r.minimo - r.realNum).toFixed(2)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    )}
    <InventarioInsumosTable
      inv={inv}
      updateInv={updateInv}
      disabled={inventarioGuardado}
      mostrarSistema
    />
    </div>
  );
}

function Step3(props: {
  cajaChicaInicial: number;
  cajaChicaFinal: number;
  cajaChicaEsperada: number;
  sobreEsperado: number;
  mostrarSobre: boolean;
  efectivoGanancias: number;
  totalEnCaja: number;
  totalEfectivoVentas: number;
  totalTransferencias: number;
  totalTarjeta: number;
  totalGastosEfectivo: number;
  totalPagoDesp: number;
  pagosDespDetalle: PagoDesp[];
  efectivoEsperado: number;
  efectivoDeclaradoCaja: string;
  setEfectivoDeclaradoCaja: (v: string) => void;
  efectivoDeclaradoSobre: string;
  setEfectivoDeclaradoSobre: (v: string) => void;
  diffCaja: number;
  diffSobre: number;
  diferenciaTotal: number;
  declaracionCompleta: boolean;
  cuadra: boolean;
  descuadre: boolean;
  observacion: string;
  setObservacion: (v: string) => void;
  transferenciasList: PagoTurno[];
  setVerTransfer: (v: boolean) => void;
}) {
  const {
    cajaChicaInicial, cajaChicaFinal, cajaChicaEsperada, sobreEsperado, mostrarSobre,
    efectivoGanancias, totalEnCaja,
    totalEfectivoVentas, totalTransferencias, totalTarjeta, totalGastosEfectivo,
    totalPagoDesp, pagosDespDetalle,
    efectivoDeclaradoCaja, setEfectivoDeclaradoCaja,
    efectivoDeclaradoSobre, setEfectivoDeclaradoSobre,
    diffCaja, diffSobre, diferenciaTotal, declaracionCompleta,
    cuadra, descuadre, observacion, setObservacion, transferenciasList, setVerTransfer,
  } = props;
  const gananciasNegativas = efectivoGanancias < 0;
  const cajaChicaReducida = gananciasNegativas && cajaChicaFinal < cajaChicaInicial;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-5xl mx-auto">
      <div className="bg-card border border-border rounded-xl p-3 sm:p-5 space-y-1">
        <h3 className="font-display text-xl uppercase tracking-wider text-center pb-3 border-b border-border">
          Cuadre de caja
        </h3>

        <CuadreRow label="Caja chica inicial" value={fmtCLP(cajaChicaInicial)} />

        <CuadreSep />

        <p className="text-xs uppercase tracking-widest text-muted-foreground pt-2 pb-1">Ingresos</p>
        <CuadreRow label="Efectivo (ventas)" value={fmtCLP(totalEfectivoVentas)} positive />
        <CuadreRow
          label="Transferencias"
          value={fmtCLP(totalTransferencias)}
          extra={
            <Button variant="ghost" size="sm" onClick={() => setVerTransfer(true)} disabled={transferenciasList.length === 0} className="h-7 px-2">
              <Eye className="h-3 w-3 mr-1" /> Ver
            </Button>
          }
        />
        <CuadreRow label="Tarjeta" value={fmtCLP(totalTarjeta)} />

        <CuadreSep />

        <p className="text-xs uppercase tracking-widest text-muted-foreground pt-2 pb-1">Egresos</p>
        <CuadreRow label="Gastos en efectivo" value={`−${fmtCLP(totalGastosEfectivo)}`} negative />
        <div className="py-1">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Pago a despachadores</span>
            <span className="font-mono text-destructive">−{fmtCLP(totalPagoDesp)}</span>
          </div>
          {pagosDespDetalle.length > 0 && (
            <div className="mt-1.5 ml-1 space-y-0.5 border-l border-border pl-3">
              {pagosDespDetalle.map((p, i) => {
                const sinPago = !(p.total_a_pagar > 0);
                return (
                  <div key={`${p.despachador_id ?? p.nombre}-${i}`} className="flex items-center justify-between text-xs gap-2">
                    <span className={`truncate ${sinPago ? "text-warning" : "text-success"}`}>
                      {sinPago ? "⏳" : "✅"} {p.nombre}
                    </span>
                    <span className={`font-mono shrink-0 ${sinPago ? "text-warning" : "text-success"}`}>
                      {sinPago ? (
                        <>{fmtCLP(0)} <span className="normal-case font-sans">pendiente</span></>
                      ) : (
                        fmtCLP(p.total_a_pagar)
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <CuadreSep />

        <CuadreRow
          label="Efectivo ganancias"
          value={fmtCLP(efectivoGanancias)}
          negative={gananciasNegativas}
          positive={!gananciasNegativas}
          bold
        />
        {gananciasNegativas && (
          <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 mt-2">
            Las ganancias no cubren los egresos — se descuenta de caja chica
          </p>
        )}

        <CuadreSep />

        <CuadreRow
          label="Caja chica"
          value={fmtCLP(cajaChicaFinal)}
          negative={cajaChicaReducida}
          bold
        />
        {cajaChicaReducida && (
          <p className="text-xs text-muted-foreground text-right -mt-1">
            Inicial {fmtCLP(cajaChicaInicial)} − {fmtCLP(Math.abs(efectivoGanancias))}
          </p>
        )}

        <CuadreSep />

        <div className="pt-2 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wider">Total en caja</span>
            <span className={`font-mono text-2xl ${gananciasNegativas ? "text-destructive" : "text-primary"}`}>
              {fmtCLP(totalEnCaja)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground text-right">
            Efectivo ganancias + Caja chica
          </p>
        </div>
      </div>

      <div className="bg-card border border-border rounded-xl p-3 sm:p-5 space-y-4">
        <h3 className="font-display text-xl uppercase tracking-wider text-center pb-2 border-b border-border">
          Declaración de efectivo
        </h3>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="label-upper">Caja chica contada</Label>
            <Input
              type="number"
              value={efectivoDeclaradoCaja}
              onChange={(e) => setEfectivoDeclaradoCaja(e.target.value)}
              className="bg-background font-mono text-xl h-12"
              placeholder="0"
            />
          </div>
          <DeclaracionEsperadoDiff
            esperado={cajaChicaEsperada}
            diferencia={diffCaja}
            mostrarDiff={efectivoDeclaradoCaja !== ""}
            labelDiff="Diferencia caja chica"
          />
        </div>

        {mostrarSobre && (
          <>
            <CuadreSep />
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="label-upper">Sobre de ganancias</Label>
                <Input
                  type="number"
                  value={efectivoDeclaradoSobre}
                  onChange={(e) => setEfectivoDeclaradoSobre(e.target.value)}
                  className="bg-background font-mono text-xl h-12"
                  placeholder="0"
                />
              </div>
              <DeclaracionEsperadoDiff
                esperado={sobreEsperado}
                diferencia={diffSobre}
                mostrarDiff={efectivoDeclaradoSobre !== ""}
                labelDiff="Diferencia sobre"
              />
            </div>
          </>
        )}

        <CuadreSep />

        {declaracionCompleta && (
          <div className={`rounded-lg p-4 border ${cuadra ? "border-success/40 bg-success/10" : "border-destructive/40 bg-destructive/10"}`}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold uppercase tracking-wider">Diferencia total</span>
              <span className={`font-mono text-xl ${cuadra ? "text-success" : "text-destructive"}`}>
                {diferenciaTotal > 0 ? `+${fmtCLP(diferenciaTotal)}` : fmtCLP(diferenciaTotal)}
              </span>
            </div>
            <p className={`text-xs mt-1 ${cuadra ? "text-success" : "text-destructive"}`}>
              {cuadra ? "Caja cuadrada" : "Hay descuadre · indicá observación"}
            </p>
          </div>
        )}

        {descuadre && (
          <div className="space-y-2">
            <Label className="label-upper">Observación del descuadre *</Label>
            <Textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              maxLength={500}
              rows={4}
              className="bg-background"
              placeholder="Explicá la diferencia"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="font-mono text-foreground">{value}</div>
    </div>
  );
}
function DeclaracionEsperadoDiff({
  esperado, diferencia, mostrarDiff, labelDiff,
}: {
  esperado: number;
  diferencia: number;
  mostrarDiff: boolean;
  labelDiff: string;
}) {
  const cuadraLinea = mostrarDiff && diferencia === 0;
  return (
    <div className="space-y-1 text-sm pl-1">
      <div className="flex justify-between text-muted-foreground">
        <span>Sistema espera</span>
        <span className="font-mono text-foreground">{fmtCLP(esperado)}</span>
      </div>
      {mostrarDiff && (
        <div className="flex justify-between">
          <span className="text-muted-foreground">{labelDiff}</span>
          <span className={`font-mono font-semibold ${cuadraLinea ? "text-success" : "text-destructive"}`}>
            {diferencia > 0 ? `+${fmtCLP(diferencia)}` : fmtCLP(diferencia)}
          </span>
        </div>
      )}
    </div>
  );
}
function CuadreSep() {
  return <div className="border-t border-border my-2" />;
}
function CuadreRow({ label, value, positive, negative, bold, extra }: {
  label: string; value: string; positive?: boolean; negative?: boolean; bold?: boolean; extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className={`text-sm ${bold ? "font-medium text-foreground" : "text-muted-foreground"}`}>{label}</span>
      <div className="flex items-center gap-2">
        {extra}
        <span className={`font-mono ${bold ? "text-base" : ""} ${positive ? "text-success" : negative ? "text-destructive" : "text-foreground"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
function Row({ label, value, positive, negative, extra }: { label: string; value: string; positive?: boolean; negative?: boolean; extra?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        {extra}
        <span className={`font-mono ${positive ? "text-success" : negative ? "text-destructive" : "text-foreground"}`}>{value}</span>
      </div>
    </div>
  );
}

// SectionCard definido a nivel de módulo para evitar que React lo desmonte
// y remonte en cada re-render del padre (lo que resetearía el scroll).
function SectionCard({
  isOpen,
  onToggle,
  title,
  icon: Icon,
  done,
  children,
}: {
  isOpen: boolean;
  onToggle: () => void;
  title: string;
  icon: typeof Bike;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <Collapsible open={isOpen} onOpenChange={onToggle}>
      <div className={`bg-card border rounded-xl transition-colors ${done ? "border-success/40" : "border-border"}`}>
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="w-full flex items-center justify-between gap-4 p-5 hover:bg-secondary/30 transition-colors text-left"
          >
            <div className="flex items-center gap-4">
              <div className={`h-12 w-12 rounded-full border flex items-center justify-center shrink-0 ${done ? "border-success bg-success/10 text-success" : "border-border bg-secondary/40 text-muted-foreground"}`}>
                <Icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-display text-xl text-foreground">{title}</h3>
                <span className={`inline-flex items-center gap-1.5 mt-1 text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded border ${done ? "border-success/40 bg-success/10 text-success" : "border-border bg-secondary/40 text-muted-foreground"}`}>
                  {done ? <><Check className="h-3 w-3" /> Completado</> : <><Clock className="h-3 w-3" /> Pendiente</>}
                </span>
              </div>
            </div>
            <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-border p-5 bg-background/40">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}
