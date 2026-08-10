import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import type { Turno } from "../TurnoPage";

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const fmtHora = (s: string | null) =>
  s ? new Date(s).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" }) : "—";

const esIngresoCaja = (c: string) => c.startsWith("Ingreso caja chica");

interface PrestamoDetalle {
  nombre: string;
  monto: number;
}

interface TotalesCaja {
  efectivoVentas: number;
  transferencias: number;
  tarjeta: number;
  gastosEfectivo: number;
  pagoDespachadores: number;
  prestamos: number;
  prestamosDetalle: PrestamoDetalle[];
  totalPedidos: number;
  entregados: number;
  cancelados: number;
  pendientes: number;
}

const VACIO: TotalesCaja = {
  efectivoVentas: 0,
  transferencias: 0,
  tarjeta: 0,
  gastosEfectivo: 0,
  pagoDespachadores: 0,
  prestamos: 0,
  prestamosDetalle: [],
  totalPedidos: 0,
  entregados: 0,
  cancelados: 0,
  pendientes: 0,
};

type UsuarioJoin = {
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
} | null;

function nombreDespachador(u: UsuarioJoin): string {
  if (!u) return "Despachador";
  return (
    u.nombre_completo ||
    [u.nombre, u.apellido].filter(Boolean).join(" ").trim() ||
    u.nombre ||
    "Despachador"
  );
}

function Row({
  label, value, bold, positive, negative, muted,
}: {
  label: string;
  value: string;
  bold?: boolean;
  positive?: boolean;
  negative?: boolean;
  muted?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-3 py-1 ${bold ? "pt-2" : ""}`}>
      <span className={`text-sm ${bold ? "font-semibold uppercase tracking-wider" : "text-muted-foreground"}`}>
        {label}
      </span>
      <span
        className={`font-mono ${bold ? "text-lg font-bold" : "text-sm"} ${
          negative ? "text-destructive" : positive ? "text-success" : muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function Sep() {
  return <div className="border-t border-border my-2" />;
}

export default function EstadoCajaTab({ turno }: { turno: Turno }) {
  const [data, setData] = useState<TotalesCaja>(VACIO);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const cargar = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [pgRes, gaRes, pdRes, peRes, prRes] = await Promise.all([
        supabase.from("pagos_turno").select("metodo, monto").eq("turno_id", turno.id),
        supabase.from("gastos_turno").select("monto, metodo, concepto").eq("turno_id", turno.id),
        supabase.from("pago_despachadores").select("total_a_pagar").eq("turno_id", turno.id).eq("pagado", true),
        supabase.from("pedidos").select("estado").eq("turno_id", turno.id),
        supabase
          .from("prestamos_despachador")
          .select("monto, devuelto, usuarios:despachador_id(nombre, apellido, nombre_completo)")
          .eq("turno_id", turno.id),
      ]);

      const pagos = (pgRes.data as { metodo: string; monto: number }[]) ?? [];
      const gastos = (gaRes.data as { monto: number; metodo: string; concepto: string }[]) ?? [];
      const desp = (pdRes.data as { total_a_pagar: number }[]) ?? [];
      const pedidos = (peRes.data as { estado: string }[]) ?? [];
      const prestamosRows = (prRes.data as {
        monto: number;
        devuelto: boolean;
        usuarios: UsuarioJoin;
      }[]) ?? [];

      const efectivoVentas = pagos.filter((p) => p.metodo === "efectivo").reduce((a, p) => a + p.monto, 0);
      const transferencias = pagos.filter((p) => p.metodo === "transferencia").reduce((a, p) => a + p.monto, 0);
      const tarjeta = pagos.filter((p) => p.metodo === "tarjeta").reduce((a, p) => a + p.monto, 0);
      const gastosEfectivo = gastos
        .filter((g) => g.metodo === "efectivo" && !esIngresoCaja(g.concepto))
        .reduce((a, g) => a + g.monto, 0);
      const pagoDespachadores = desp.reduce((a, p) => a + (p.total_a_pagar > 0 ? p.total_a_pagar : 0), 0);

      // Solo préstamos no devueltos afectan el efectivo en caja
      const prestamosActivos = prestamosRows.filter((p) => !p.devuelto);
      const prestamosDetalle = prestamosActivos.map((p) => ({
        nombre: nombreDespachador(p.usuarios),
        monto: p.monto,
      }));
      const prestamos = prestamosDetalle.reduce((a, p) => a + p.monto, 0);

      const entregados = pedidos.filter((p) => p.estado === "entregado").length;
      const cancelados = pedidos.filter((p) => p.estado === "cancelado").length;
      const pendientes = pedidos.filter((p) => p.estado !== "entregado" && p.estado !== "cancelado").length;

      setData({
        efectivoVentas,
        transferencias,
        tarjeta,
        gastosEfectivo,
        pagoDespachadores,
        prestamos,
        prestamosDetalle,
        totalPedidos: pedidos.length,
        entregados,
        cancelados,
        pendientes,
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [turno.id]);

  useEffect(() => {
    cargar();
    const id = window.setInterval(() => cargar(true), 60_000);
    return () => window.clearInterval(id);
  }, [cargar]);

  const totalIngresos = data.efectivoVentas + data.transferencias + data.tarjeta;
  const totalEgresos = data.gastosEfectivo + data.pagoDespachadores + data.prestamos;
  const cajaChicaInicial = turno.caja_chica_apertura;
  const efectivoGanancias =
    data.efectivoVentas - data.gastosEfectivo - data.pagoDespachadores - data.prestamos;
  const cajaChicaFinal = efectivoGanancias >= 0 ? cajaChicaInicial : cajaChicaInicial + efectivoGanancias;
  const totalEnCaja = efectivoGanancias >= 0 ? cajaChicaFinal + efectivoGanancias : cajaChicaFinal;

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-xl mx-auto">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl uppercase tracking-wider flex items-center gap-2">
            <Wallet className="h-6 w-6 text-primary" />
            Estado actual de caja
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Turno abierto desde las {fmtHora(turno.created_at)}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => cargar(true)}
          disabled={refreshing}
          className="uppercase tracking-wider text-xs shrink-0"
        >
          {refreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
          Actualizar
        </Button>
      </div>

      <div className="bg-card border border-border rounded-xl p-5 space-y-1">
        <p className="text-xs uppercase tracking-widest text-muted-foreground pb-1">Ingresos</p>
        <Row label="Efectivo (ventas)" value={fmtCLP(data.efectivoVentas)} positive />
        <Row label="Transferencias" value={fmtCLP(data.transferencias)} />
        <Row label="Tarjeta" value={fmtCLP(data.tarjeta)} />
        <Sep />
        <Row label="Total ingresos" value={fmtCLP(totalIngresos)} bold positive />

        <Sep />
        <p className="text-xs uppercase tracking-widest text-muted-foreground pt-1 pb-1">Egresos</p>
        <Row label="Gastos en efectivo" value={`−${fmtCLP(data.gastosEfectivo)}`} negative />
        <Row label="Pago a despachadores" value={`−${fmtCLP(data.pagoDespachadores)}`} negative />
        {data.prestamos > 0 && (
          <Row label="Préstamos a despachadores" value={`−${fmtCLP(data.prestamos)}`} negative />
        )}
        <Sep />
        <Row label="Total egresos" value={`−${fmtCLP(totalEgresos)}`} bold negative />

        <Sep />
        <p className="text-xs uppercase tracking-widest text-muted-foreground pt-1 pb-1">Resumen</p>
        <Row label="Caja chica inicial" value={fmtCLP(cajaChicaInicial)} />
        <Row
          label="Efectivo ganancias"
          value={fmtCLP(efectivoGanancias)}
          positive={efectivoGanancias >= 0}
          negative={efectivoGanancias < 0}
        />
        <Row
          label="Caja chica final"
          value={fmtCLP(cajaChicaFinal)}
          negative={efectivoGanancias < 0 && cajaChicaFinal < cajaChicaInicial}
        />
        <Sep />
        <div className="flex items-center justify-between gap-3 pt-1">
          <span className="text-sm font-semibold uppercase tracking-wider">Total en caja</span>
          <span className={`font-mono text-2xl font-bold ${efectivoGanancias < 0 ? "text-destructive" : "text-primary"}`}>
            {fmtCLP(totalEnCaja)}
          </span>
        </div>
      </div>

      {data.prestamosDetalle.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-2">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            💸 Préstamos a despachadores
          </p>
          <div className="space-y-1">
            {data.prestamosDetalle.map((p, i) => (
              <div key={`${p.nombre}-${i}`} className="flex items-center justify-between gap-3 py-1">
                <span className="text-sm text-foreground">{p.nombre}</span>
                <span className="font-mono text-sm text-destructive">{fmtCLP(p.monto)}</span>
              </div>
            ))}
          </div>
          <Sep />
          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="text-sm font-semibold uppercase tracking-wider">Total préstamos</span>
            <span className="font-mono text-lg font-bold text-destructive">{fmtCLP(data.prestamos)}</span>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-xl p-5 space-y-2">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Pedidos</p>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Total pedidos</span>
          <span className="font-mono text-foreground font-semibold">{data.totalPedidos}</span>
        </div>
        <p className="text-sm text-muted-foreground">
          <span className="text-success font-medium">Entregados: {data.entregados}</span>
          {" | "}
          <span className="text-muted-foreground">Cancelados: {data.cancelados}</span>
          {" | "}
          <span className="text-warning font-medium">Pendientes: {data.pendientes}</span>
        </p>
      </div>
    </div>
  );
}
