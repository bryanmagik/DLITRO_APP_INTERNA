import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  Pencil,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { calcularEfectivoEsperadoTurno, parsearEfectivoDeclarado } from "@/lib/cierreTurnoAdmin";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface TurnoAdmin {
  id: string;
  sucursal_id: string;
  tomador_id: string;
  caja_chica_apertura: number;
  estado: "abierto" | "cerrado";
  created_at: string | null;
  closed_at: string | null;
  fecha_dlitro: string | null;
  efectivo_sistema: number | null;
  efectivo_declarado: number | null;
  diferencia_caja: number | null;
  cierre_remoto: boolean;
  cerrado_remotamente_por: string | null;
  cierre_remoto_motivo: string | null;
  cierre_remoto_actualizado_at: string | null;
}

interface ResumenTurno {
  ventasEfectivo: number;
  gastosEfectivo: number;
  pagosDespachadores: number;
  pendientes: number;
}

interface PersonaLite { id: string; nombre: string; nombre_completo: string | null }
interface SucursalLite { id: string; nombre: string }

type AccionDialogo = { tipo: "cerrar" | "corregir"; turno: TurnoAdmin } | null;

const fmtCLP = (monto: number) => new Intl.NumberFormat("es-CL", {
  style: "currency",
  currency: "CLP",
  maximumFractionDigits: 0,
}).format(monto);

const fmtFecha = (fecha: string | null) => fecha
  ? new Intl.DateTimeFormat("es-CL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(fecha))
  : "Sin fecha";

const resumenVacio = (): ResumenTurno => ({
  ventasEfectivo: 0,
  gastosEfectivo: 0,
  pagosDespachadores: 0,
  pendientes: 0,
});

export default function TurnosAdminPage() {
  const { perfil } = useAuthStore();
  const [turnosAbiertos, setTurnosAbiertos] = useState<TurnoAdmin[]>([]);
  const [cierresPropios, setCierresPropios] = useState<TurnoAdmin[]>([]);
  const [resumenes, setResumenes] = useState<Record<string, ResumenTurno>>({});
  const [sucursales, setSucursales] = useState<Record<string, string>>({});
  const [personas, setPersonas] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [accion, setAccion] = useState<AccionDialogo>(null);
  const [efectivo, setEfectivo] = useState("");
  const [motivo, setMotivo] = useState("");

  const cargar = useCallback(async () => {
    if (!perfil?.id) return;
    setLoading(true);
    try {
      const columnas = "id,sucursal_id,tomador_id,caja_chica_apertura,estado,created_at,closed_at,fecha_dlitro,efectivo_sistema,efectivo_declarado,diferencia_caja,cierre_remoto,cerrado_remotamente_por,cierre_remoto_motivo,cierre_remoto_actualizado_at";
      const [abiertosRes, cerradosRes] = await Promise.all([
        supabase.from("turnos").select(columnas).eq("estado", "abierto").order("created_at", { ascending: true }),
        supabase.from("turnos").select(columnas)
          .eq("estado", "cerrado")
          .eq("cierre_remoto", true)
          .eq("cerrado_remotamente_por", perfil.id)
          .order("cierre_remoto_actualizado_at", { ascending: false })
          .limit(50),
      ]);
      if (abiertosRes.error) throw abiertosRes.error;
      if (cerradosRes.error) throw cerradosRes.error;

      const abiertos = (abiertosRes.data as TurnoAdmin[] | null) ?? [];
      const cerrados = (cerradosRes.data as TurnoAdmin[] | null) ?? [];
      const todos = [...abiertos, ...cerrados];
      const turnoIds = abiertos.map((turno) => turno.id);
      const sucursalIds = [...new Set(todos.map((turno) => turno.sucursal_id))];
      const personaIds = [...new Set(todos.map((turno) => turno.tomador_id))];

      const vacio = Promise.resolve({ data: [], error: null });
      const [pagosRes, gastosRes, despRes, pendientesRes, sucursalesRes, personasRes] = await Promise.all([
        turnoIds.length
          ? supabase.from("pagos_turno").select("turno_id,monto,metodo").in("turno_id", turnoIds).eq("metodo", "efectivo")
          : vacio,
        turnoIds.length
          ? supabase.from("gastos_turno").select("turno_id,monto,metodo,concepto").in("turno_id", turnoIds).eq("metodo", "efectivo")
          : vacio,
        turnoIds.length
          ? supabase.from("pago_despachadores").select("turno_id,total_a_pagar,pagado").in("turno_id", turnoIds).eq("pagado", true)
          : vacio,
        turnoIds.length
          ? supabase.from("pedidos").select("turno_id,estado").in("turno_id", turnoIds).in("estado", ["en_preparacion", "listo", "en_despacho"])
          : vacio,
        sucursalIds.length
          ? supabase.from("sucursales").select("id,nombre").in("id", sucursalIds)
          : vacio,
        personaIds.length
          ? supabase.from("usuarios").select("id,nombre,nombre_completo").in("id", personaIds)
          : vacio,
      ]);

      for (const respuesta of [pagosRes, gastosRes, despRes, pendientesRes, sucursalesRes, personasRes]) {
        if (respuesta.error) throw respuesta.error;
      }

      const nuevosResumenes = Object.fromEntries(abiertos.map((turno) => [turno.id, resumenVacio()]));
      for (const pago of (pagosRes.data ?? []) as { turno_id: string; monto: number }[]) {
        nuevosResumenes[pago.turno_id].ventasEfectivo += Number(pago.monto);
      }
      for (const gasto of (gastosRes.data ?? []) as { turno_id: string; monto: number; concepto: string }[]) {
        if (gasto.concepto !== "Ingreso caja chica") {
          nuevosResumenes[gasto.turno_id].gastosEfectivo += Number(gasto.monto);
        }
      }
      for (const pago of (despRes.data ?? []) as { turno_id: string; total_a_pagar: number }[]) {
        if (Number(pago.total_a_pagar) > 0) {
          nuevosResumenes[pago.turno_id].pagosDespachadores += Number(pago.total_a_pagar);
        }
      }
      for (const pedido of (pendientesRes.data ?? []) as { turno_id: string }[]) {
        nuevosResumenes[pedido.turno_id].pendientes += 1;
      }

      setTurnosAbiertos(abiertos);
      setCierresPropios(cerrados);
      setResumenes(nuevosResumenes);
      setSucursales(Object.fromEntries(((sucursalesRes.data ?? []) as SucursalLite[]).map((s) => [s.id, s.nombre])));
      setPersonas(Object.fromEntries(((personasRes.data ?? []) as PersonaLite[]).map((u) => [u.id, u.nombre_completo || u.nombre])));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudieron cargar los turnos");
    } finally {
      setLoading(false);
    }
  }, [perfil?.id]);

  useEffect(() => { void cargar(); }, [cargar]);

  const abrirDialogo = (tipo: "cerrar" | "corregir", turno: TurnoAdmin) => {
    setAccion({ tipo, turno });
    setEfectivo(tipo === "corregir" ? String(turno.efectivo_declarado ?? 0) : "");
    setMotivo("");
  };

  const cerrarDialogo = () => {
    if (guardando) return;
    setAccion(null);
    setEfectivo("");
    setMotivo("");
  };

  const guardar = async () => {
    if (!accion) return;
    const monto = parsearEfectivoDeclarado(efectivo);
    if (monto === null) {
      toast.error("Ingresa un monto entero igual o mayor que cero");
      return;
    }
    if (!motivo.trim()) {
      toast.error(accion.tipo === "cerrar" ? "Indica por qué se realiza el cierre administrativo" : "Indica el motivo de la corrección");
      return;
    }
    if (accion.tipo === "cerrar" && (resumenes[accion.turno.id]?.pendientes ?? 0) > 0) {
      toast.error("El turno aún tiene pedidos sin completar");
      return;
    }

    setGuardando(true);
    try {
      const parametros = {
        p_turno_id: accion.turno.id,
        p_efectivo_declarado: monto,
        p_motivo: motivo.trim(),
      };
      const { error } = accion.tipo === "cerrar"
        ? await supabase.rpc("cerrar_turno_remotamente_admin", parametros)
        : await supabase.rpc("corregir_efectivo_cierre_remoto_admin", {
            ...parametros,
            p_efectivo_anterior: accion.turno.efectivo_declarado ?? 0,
          });
      if (error) throw error;

      toast.success(accion.tipo === "cerrar" ? "Turno cerrado administrativamente" : "Efectivo corregido y auditado");
      setAccion(null);
      setEfectivo("");
      setMotivo("");
      await cargar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el cambio");
    } finally {
      setGuardando(false);
    }
  };

  const turnoDialogo = accion?.turno;
  const resumenDialogo = turnoDialogo ? resumenes[turnoDialogo.id] : undefined;
  const esperadoDialogo = turnoDialogo && resumenDialogo
    ? calcularEfectivoEsperadoTurno({
        cajaChicaApertura: turnoDialogo.caja_chica_apertura,
        ventasEfectivo: resumenDialogo.ventasEfectivo,
        gastosEfectivo: resumenDialogo.gastosEfectivo,
        pagosDespachadores: resumenDialogo.pagosDespachadores,
      })
    : null;

  const cantidadPendientes = useMemo(
    () => turnosAbiertos.filter((turno) => (resumenes[turno.id]?.pendientes ?? 0) > 0).length,
    [resumenes, turnosAbiertos],
  );

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wider">Cierre de turnos</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Cierra turnos olvidados y corrige el efectivo de los cierres administrativos que tú realizaste.
          </p>
        </div>
        <Button variant="outline" onClick={() => void cargar()} disabled={loading} className="gap-2 self-start">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Actualizar
        </Button>
      </div>

      <Alert className="border-warning/40 bg-warning/10">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Cierre administrativo de emergencia</AlertTitle>
        <AlertDescription>
          Este módulo no reemplaza el cierre normal con inventario y pagos. Cada uso queda identificado y auditado.
        </AlertDescription>
      </Alert>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-display text-xl uppercase tracking-wide">Turnos abiertos</h2>
          <Badge variant="secondary">{turnosAbiertos.length}</Badge>
          {cantidadPendientes > 0 && <Badge variant="destructive">{cantidadPendientes} con pedidos pendientes</Badge>}
        </div>

        {loading ? (
          <div className="flex min-h-40 items-center justify-center text-muted-foreground">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Cargando turnos…
          </div>
        ) : turnosAbiertos.length === 0 ? (
          <Card><CardContent className="flex min-h-32 items-center justify-center gap-2 text-muted-foreground">
            <CheckCircle2 className="h-5 w-5 text-success" /> No hay turnos abiertos olvidados.
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {turnosAbiertos.map((turno) => {
              const resumen = resumenes[turno.id] ?? resumenVacio();
              const esperado = calcularEfectivoEsperadoTurno({
                cajaChicaApertura: turno.caja_chica_apertura,
                ventasEfectivo: resumen.ventasEfectivo,
                gastosEfectivo: resumen.gastosEfectivo,
                pagosDespachadores: resumen.pagosDespachadores,
              });
              const bloqueado = resumen.pendientes > 0;
              return (
                <Card key={turno.id} className={bloqueado ? "border-warning/50" : ""}>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Store className="h-4 w-4 text-primary" /> {sucursales[turno.sucursal_id] ?? "Sucursal"}
                        </CardTitle>
                        <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                          <Clock3 className="h-4 w-4" /> Abierto {fmtFecha(turno.created_at)}
                        </p>
                      </div>
                      <Badge className="bg-success/10 text-success hover:bg-success/10">Abierto</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 rounded-lg bg-secondary/40 p-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Responsable</p>
                        <p className="mt-1 flex items-center gap-1 font-medium"><UserRound className="h-3.5 w-3.5" /> {personas[turno.tomador_id] ?? "No disponible"}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Efectivo esperado</p>
                        <p className="mt-1 font-mono font-semibold">{fmtCLP(esperado)}</p>
                      </div>
                    </div>
                    {bloqueado && (
                      <p className="flex items-center gap-2 text-sm font-medium text-warning">
                        <AlertTriangle className="h-4 w-4" /> {resumen.pendientes} pedido{resumen.pendientes === 1 ? "" : "s"} sin completar
                      </p>
                    )}
                    <Button className="w-full gap-2" disabled={bloqueado} onClick={() => abrirDialogo("cerrar", turno)}>
                      <Banknote className="h-4 w-4" /> Cerrar turno
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-display text-xl uppercase tracking-wide">Mis cierres administrativos</h2>
          <Badge variant="secondary">{cierresPropios.length}</Badge>
        </div>
        {!loading && cierresPropios.length === 0 ? (
          <Card><CardContent className="flex min-h-28 items-center justify-center text-muted-foreground">
            Aún no has realizado cierres administrativos.
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {cierresPropios.map((turno) => (
              <Card key={turno.id}>
                <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="font-semibold">{sucursales[turno.sucursal_id] ?? "Sucursal"}</p>
                    <p className="text-sm text-muted-foreground">Cerrado {fmtFecha(turno.closed_at)}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{turno.cierre_remoto_motivo}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                    <div className="text-left sm:text-right">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground">Efectivo informado</p>
                      <p className="font-mono text-lg font-semibold">{fmtCLP(turno.efectivo_declarado ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">Sistema: {fmtCLP(turno.efectivo_sistema ?? 0)}</p>
                    </div>
                    <Button variant="outline" className="gap-2" onClick={() => abrirDialogo("corregir", turno)}>
                      <Pencil className="h-4 w-4" /> Corregir
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Dialog open={accion !== null} onOpenChange={(open) => !open && cerrarDialogo()}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl uppercase tracking-wide">
              {accion?.tipo === "cerrar" ? "Cerrar turno" : "Corregir efectivo"}
            </DialogTitle>
          </DialogHeader>

          {turnoDialogo && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-secondary/30 p-3 text-sm">
                <p className="font-semibold">{sucursales[turnoDialogo.sucursal_id] ?? "Sucursal"}</p>
                <p className="text-muted-foreground">Responsable: {personas[turnoDialogo.tomador_id] ?? "No disponible"}</p>
              </div>

              {accion?.tipo === "cerrar" && esperadoDialogo !== null && resumenDialogo && (
                <div className="space-y-2 rounded-lg border p-3 text-sm">
                  <Fila label="Caja chica inicial" valor={fmtCLP(turnoDialogo.caja_chica_apertura)} />
                  <Fila label="Ventas en efectivo" valor={fmtCLP(resumenDialogo.ventasEfectivo)} />
                  <Fila label="Gastos en efectivo" valor={`− ${fmtCLP(resumenDialogo.gastosEfectivo)}`} />
                  <Fila label="Pagos a despachadores" valor={`− ${fmtCLP(resumenDialogo.pagosDespachadores)}`} />
                  <div className="flex items-center justify-between border-t pt-2 font-semibold">
                    <span>Efectivo esperado</span><span className="font-mono text-primary">{fmtCLP(esperadoDialogo)}</span>
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="efectivo-real">Efectivo real que quedó *</Label>
                <Input
                  id="efectivo-real"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={efectivo}
                  onChange={(event) => setEfectivo(event.target.value)}
                  placeholder="Ej: 45000"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Puedes escribir 0 si todavía no conoces el monto. Después podrás corregirlo desde este mismo menú.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="motivo-cierre">{accion?.tipo === "cerrar" ? "Motivo del cierre administrativo *" : "Motivo de la corrección *"}</Label>
                <Textarea
                  id="motivo-cierre"
                  value={motivo}
                  onChange={(event) => setMotivo(event.target.value)}
                  placeholder={accion?.tipo === "cerrar" ? "Ej: La sucursal olvidó cerrar el turno" : "Ej: La sucursal envió el monto real de caja"}
                  rows={3}
                />
              </div>

              <Alert>
                <History className="h-4 w-4" />
                <AlertTitle>Quedará auditado</AlertTitle>
                <AlertDescription>
                  Se guardarán el administrador, el motivo y los montos anterior y nuevo.
                </AlertDescription>
              </Alert>
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={cerrarDialogo} disabled={guardando}>Cancelar</Button>
            <Button onClick={() => void guardar()} disabled={guardando} className="gap-2">
              {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
              {accion?.tipo === "cerrar" ? "Confirmar cierre" : "Guardar corrección"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Fila({ label, valor }: { label: string; valor: string }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-muted-foreground">{label}</span><span className="font-mono">{valor}</span></div>;
}
