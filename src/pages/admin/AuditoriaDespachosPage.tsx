import { useCallback, useEffect, useMemo, useState } from "react";
import { Bike, FilePenLine, History, Loader2, RefreshCw, Route } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type Categoria = "correcciones_pedidos" | "ajustes_pedidos" | "carreras_manuales";

interface CorreccionPedido {
  id: string;
  pedido_id: string;
  sucursal_id: string;
  usuario_id: string;
  campo: string;
  valor_anterior: string | null;
  valor_nuevo: string | null;
  motivo: string;
  estado_pedido: string;
  created_at: string;
}

interface PedidoLite { id: string; numero_pedido: number | null }

interface CambioManual {
  id: string;
  despacho_id: string;
  turno_id: string;
  despachador_id: string;
  usuario_id: string | null;
  operacion: string;
  concepto: string;
  monto_anterior: number | null;
  monto_nuevo: number | null;
  changed_at: string;
}

interface AjustePedido {
  id: string;
  pedido_id: string;
  numero_pedido: number | null;
  turno_id: string;
  sucursal_id: string;
  usuario_id: string | null;
  operacion: string;
  distancia_km: number | null;
  costo_calculado: number;
  costo_anterior: number | null;
  costo_cobrado: number;
  diferencia: number;
  motivo: string | null;
  estado_pedido: string | null;
  changed_at: string;
}

interface UsuarioLite {
  id: string;
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
}

interface TurnoLite { id: string; sucursal_id: string }
interface SucursalLite { id: string; nombre: string }

const fmtCLP = (n: number | null) => n == null
  ? "—"
  : new Intl.NumberFormat("es-CL", {
      style: "currency", currency: "CLP", maximumFractionDigits: 0,
    }).format(n);

const nombreUsuario = (u?: UsuarioLite) =>
  u?.nombre_completo || [u?.nombre, u?.apellido].filter(Boolean).join(" ") || "Usuario no disponible";

const operacionMeta: Record<string, { label: string; clase: string }> = {
  creado: { label: "Creado", clase: "border-success/40 bg-success/10 text-success" },
  monto_modificado: { label: "Monto modificado", clase: "border-warning/40 bg-warning/10 text-warning" },
  eliminado: { label: "Eliminado", clase: "border-destructive/40 bg-destructive/10 text-destructive" },
  ajustado_al_crear: { label: "Ajustado al crear", clase: "border-warning/40 bg-warning/10 text-warning" },
  modificado_posteriormente: { label: "Modificado", clase: "border-destructive/40 bg-destructive/10 text-destructive" },
};

export default function AuditoriaDespachosPage() {
  const [categoria, setCategoria] = useState<Categoria>("correcciones_pedidos");
  const [correcciones, setCorrecciones] = useState<CorreccionPedido[]>([]);
  const [pedidos, setPedidos] = useState<PedidoLite[]>([]);
  const [filtroCorrecciones, setFiltroCorrecciones] = useState("");
  const [manuales, setManuales] = useState<CambioManual[]>([]);
  const [ajustes, setAjustes] = useState<AjustePedido[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioLite[]>([]);
  const [turnos, setTurnos] = useState<TurnoLite[]>([]);
  const [sucursales, setSucursales] = useState<SucursalLite[]>([]);
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [manualesRes, ajustesRes, correccionesRes] = await Promise.all([
        supabase.from("despachos_manuales_cambios")
          .select("id, despacho_id, turno_id, despachador_id, usuario_id, operacion, concepto, monto_anterior, monto_nuevo, changed_at")
          .order("changed_at", { ascending: false }).limit(200),
        supabase.from("pedidos_despacho_ajustes")
          .select("id, pedido_id, numero_pedido, turno_id, sucursal_id, usuario_id, operacion, distancia_km, costo_calculado, costo_anterior, costo_cobrado, diferencia, motivo, estado_pedido, changed_at")
          .order("changed_at", { ascending: false }).limit(200),
        supabase.from("log_cambios_pedido")
          .select("id, pedido_id, sucursal_id, usuario_id, campo, valor_anterior, valor_nuevo, motivo, estado_pedido, created_at")
          .eq("tipo_evento", "pedido_corregido_post_cierre")
          .order("created_at", { ascending: false }).limit(200),
      ]);
      if (manualesRes.error) throw manualesRes.error;
      if (ajustesRes.error) throw ajustesRes.error;
      if (correccionesRes.error) throw correccionesRes.error;

      const manualRows = (manualesRes.data as CambioManual[] | null) ?? [];
      const ajusteRows = (ajustesRes.data as AjustePedido[] | null) ?? [];
      const correccionRows = (correccionesRes.data as CorreccionPedido[] | null) ?? [];
      const usuarioIds = [...new Set([
        ...manualRows.flatMap((r) => [r.usuario_id, r.despachador_id]),
        ...ajusteRows.map((r) => r.usuario_id),
        ...correccionRows.map((r) => r.usuario_id),
      ].filter(Boolean))] as string[];
      const turnoIds = [...new Set([...manualRows.map((r) => r.turno_id), ...ajusteRows.map((r) => r.turno_id)])];

      const [usuariosRes, turnosRes] = await Promise.all([
        usuarioIds.length
          ? supabase.from("usuarios").select("id, nombre, apellido, nombre_completo").in("id", usuarioIds)
          : Promise.resolve({ data: [], error: null }),
        turnoIds.length
          ? supabase.from("turnos").select("id, sucursal_id").in("id", turnoIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (usuariosRes.error) throw usuariosRes.error;
      if (turnosRes.error) throw turnosRes.error;

      const turnoRows = (turnosRes.data as TurnoLite[] | null) ?? [];
      const sucursalIds = [...new Set([
        ...turnoRows.map((t) => t.sucursal_id),
        ...ajusteRows.map((a) => a.sucursal_id),
        ...correccionRows.map((c) => c.sucursal_id),
      ])];
      const pedidoIds = [...new Set(correccionRows.map((c) => c.pedido_id))];
      const [sucursalesRes, pedidosRes] = await Promise.all([
        sucursalIds.length
          ? supabase.from("sucursales").select("id, nombre").in("id", sucursalIds)
          : Promise.resolve({ data: [], error: null }),
        pedidoIds.length
          ? supabase.from("pedidos").select("id, numero_pedido").in("id", pedidoIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (sucursalesRes.error) throw sucursalesRes.error;
      if (pedidosRes.error) throw pedidosRes.error;

      setManuales(manualRows);
      setAjustes(ajusteRows);
      setCorrecciones(correccionRows);
      setPedidos((pedidosRes.data as PedidoLite[] | null) ?? []);
      setUsuarios((usuariosRes.data as UsuarioLite[] | null) ?? []);
      setTurnos(turnoRows);
      setSucursales((sucursalesRes.data as SucursalLite[] | null) ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cargar la auditoría");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const usuarioMap = useMemo(() => new Map(usuarios.map((u) => [u.id, u])), [usuarios]);
  const turnoMap = useMemo(() => new Map(turnos.map((t) => [t.id, t])), [turnos]);
  const sucursalMap = useMemo(() => new Map(sucursales.map((s) => [s.id, s.nombre])), [sucursales]);
  const pedidoMap = useMemo(() => new Map(pedidos.map((p) => [p.id, p.numero_pedido])), [pedidos]);
  const correccionesFiltradas = useMemo(() => {
    const needle = filtroCorrecciones.trim().toLocaleLowerCase("es");
    if (!needle) return correcciones;
    return correcciones.filter((c) => [
      pedidoMap.get(c.pedido_id), nombreUsuario(usuarioMap.get(c.usuario_id)),
      sucursalMap.get(c.sucursal_id), c.campo, c.motivo,
      new Date(c.created_at).toLocaleDateString("es-CL"),
    ].some((value) => String(value ?? "").toLocaleLowerCase("es").includes(needle)));
  }, [correcciones, filtroCorrecciones, pedidoMap, sucursalMap, usuarioMap]);

  const nombreSucursal = (turnoId: string, sucursalId?: string) => {
    const id = sucursalId || turnoMap.get(turnoId)?.sucursal_id;
    return id ? sucursalMap.get(id) ?? "—" : "—";
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-display text-3xl uppercase tracking-wide flex items-center gap-2">
            <History className="h-6 w-6 text-primary" /> Panel de auditoría
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Elige el registro que quieres revisar. Las nuevas categorías se agregarán aquí.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={cargar} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        </Button>
      </div>

      <div className="max-w-md space-y-2">
        <label className="text-sm font-medium">¿Qué quieres auditar?</label>
        <Select value={categoria} onValueChange={(value) => setCategoria(value as Categoria)}>
          <SelectTrigger className="bg-card"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="correcciones_pedidos">
              Correcciones post-cierre de pedidos
            </SelectItem>
            <SelectItem value="ajustes_pedidos">
              Ajustes al despacho de pedidos
            </SelectItem>
            <SelectItem value="carreras_manuales">
              Carreras manuales de despachadores
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {categoria === "correcciones_pedidos" && (
        <Input
          value={filtroCorrecciones}
          onChange={(event) => setFiltroCorrecciones(event.target.value)}
          placeholder="Filtrar por pedido, usuario, sucursal, fecha, campo o motivo"
          className="max-w-xl bg-card"
          aria-label="Filtrar correcciones de pedidos"
        />
      )}

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border p-4">
          {categoria === "correcciones_pedidos" ? <FilePenLine className="h-5 w-5 text-primary" />
            : categoria === "ajustes_pedidos" ? <Route className="h-5 w-5 text-primary" />
            : <Bike className="h-5 w-5 text-primary" />}
          <div>
            <h2 className="font-semibold">
              {categoria === "correcciones_pedidos" ? "Correcciones post-cierre de pedidos"
                : categoria === "ajustes_pedidos" ? "Ajustes al despacho de pedidos" : "Carreras manuales"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {categoria === "correcciones_pedidos" ? "Cambios administrativos realizados después de entregar un pedido."
                : categoria === "ajustes_pedidos"
                ? "Diferencias entre la tarifa calculada y el monto finalmente cobrado."
                : "Creaciones, cambios de monto y eliminaciones de carreras extraordinarias."}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          {categoria === "correcciones_pedidos" ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="p-3">Fecha</th><th className="p-3">Pedido</th><th className="p-3">Realizado por</th>
                <th className="p-3">Sucursal</th><th className="p-3">Campo</th><th className="p-3">Antes</th>
                <th className="p-3">Después</th><th className="p-3">Motivo</th>
              </tr></thead>
              <tbody>
                {loading ? <FilaEstado columnas={8} texto="Cargando…" loading />
                  : correccionesFiltradas.length === 0 ? <FilaEstado columnas={8} texto="No hay correcciones que coincidan con el filtro." />
                  : correccionesFiltradas.map((cambio) => (
                    <tr key={cambio.id} className="border-b border-border/60 last:border-0 align-top">
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(cambio.created_at).toLocaleString("es-CL")}</td>
                      <td className="p-3 font-mono font-semibold">#{pedidoMap.get(cambio.pedido_id) ?? "—"}</td>
                      <td className="p-3 font-medium">{nombreUsuario(usuarioMap.get(cambio.usuario_id))}</td>
                      <td className="p-3">{sucursalMap.get(cambio.sucursal_id) ?? "—"}</td>
                      <td className="p-3"><Badge variant="outline">{cambio.campo}</Badge></td>
                      <td className="p-3 max-w-52 break-words text-muted-foreground">{cambio.valor_anterior ?? "—"}</td>
                      <td className="p-3 max-w-52 break-words">{cambio.valor_nuevo ?? "—"}</td>
                      <td className="p-3 max-w-64 break-words">{cambio.motivo}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : categoria === "ajustes_pedidos" ? (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="p-3">Fecha</th><th className="p-3">Pedido</th><th className="p-3">Realizado por</th>
                <th className="p-3">Sucursal</th><th className="p-3 text-right">Calculado</th>
                <th className="p-3 text-right">Anterior</th><th className="p-3 text-right">Cobrado</th>
                <th className="p-3 text-right">Diferencia</th><th className="p-3">Motivo</th>
              </tr></thead>
              <tbody>
                {loading ? <FilaEstado columnas={9} texto="Cargando…" loading />
                  : ajustes.length === 0 ? <FilaEstado columnas={9} texto="Aún no hay ajustes registrados." />
                  : ajustes.map((ajuste) => (
                    <tr key={ajuste.id} className="border-b border-border/60 last:border-0">
                      <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(ajuste.changed_at).toLocaleString("es-CL")}</td>
                      <td className="p-3 font-mono font-semibold">#{ajuste.numero_pedido ?? "—"}</td>
                      <td className="p-3 font-medium">{nombreUsuario(ajuste.usuario_id ? usuarioMap.get(ajuste.usuario_id) : undefined)}</td>
                      <td className="p-3">{nombreSucursal(ajuste.turno_id, ajuste.sucursal_id)}</td>
                      <td className="p-3 text-right font-mono">{fmtCLP(ajuste.costo_calculado)}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{ajuste.costo_anterior == null ? "—" : fmtCLP(ajuste.costo_anterior)}</td>
                      <td className="p-3 text-right font-mono font-semibold">{fmtCLP(ajuste.costo_cobrado)}</td>
                      <td className={`p-3 text-right font-mono font-semibold ${ajuste.diferencia > 0 ? "text-warning" : "text-success"}`}>
                        {ajuste.diferencia > 0 ? "+" : ""}{fmtCLP(ajuste.diferencia)}
                      </td>
                      <td className="p-3 max-w-64"><span className="block">{ajuste.motivo ?? "—"}</span><span className="text-[10px] text-muted-foreground">{ajuste.estado_pedido ?? ajuste.operacion}</span></td>
                    </tr>
                  ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                <th className="p-3">Fecha</th><th className="p-3">Operación</th><th className="p-3">Realizado por</th>
                <th className="p-3">Sucursal</th><th className="p-3">Despachador</th><th className="p-3">Concepto</th>
                <th className="p-3 text-right">Antes</th><th className="p-3 text-right">Después</th>
              </tr></thead>
              <tbody>
                {loading ? <FilaEstado columnas={8} texto="Cargando…" loading />
                  : manuales.length === 0 ? <FilaEstado columnas={8} texto="Aún no hay cambios registrados." />
                  : manuales.map((cambio) => {
                    const meta = operacionMeta[cambio.operacion] ?? { label: cambio.operacion, clase: "border-border" };
                    return (
                      <tr key={cambio.id} className="border-b border-border/60 last:border-0">
                        <td className="p-3 whitespace-nowrap text-muted-foreground">{new Date(cambio.changed_at).toLocaleString("es-CL")}</td>
                        <td className="p-3"><Badge variant="outline" className={meta.clase}>{meta.label}</Badge></td>
                        <td className="p-3 font-medium">{nombreUsuario(cambio.usuario_id ? usuarioMap.get(cambio.usuario_id) : undefined)}</td>
                        <td className="p-3">{nombreSucursal(cambio.turno_id)}</td>
                        <td className="p-3">{nombreUsuario(usuarioMap.get(cambio.despachador_id))}</td>
                        <td className="p-3 max-w-[16rem] truncate" title={cambio.concepto}>{cambio.concepto}</td>
                        <td className="p-3 text-right font-mono">{fmtCLP(cambio.monto_anterior)}</td>
                        <td className="p-3 text-right font-mono font-semibold">{fmtCLP(cambio.monto_nuevo)}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Se muestran los últimos 200 eventos de la categoría elegida.</p>
    </div>
  );
}

function FilaEstado({ columnas, texto, loading = false }: { columnas: number; texto: string; loading?: boolean }) {
  return (
    <tr><td colSpan={columnas} className="p-10 text-center text-muted-foreground">
      {loading && <Loader2 className="h-5 w-5 animate-spin inline mr-2" />}{texto}
    </td></tr>
  );
}
