import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, Bike } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table, TableHeader, TableBody, TableHead, TableRow, TableCell,
} from "@/components/ui/table";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "sonner";

interface Tarifa { id: string; horas: number; descripcion: string; monto: number }
interface Sucursal { id: string; nombre: string }
interface Usuario { id: string; nombre: string; nombre_completo: string | null }
interface Pago {
  id: string;
  turno_id: string;
  despachador_id: string;
  pedidos_entregados: number | null;
  total_despachos_cobrados: number | null;
  horas_trabajadas: number | null;
  base_por_horas: number | null;
  bono: number | null;
  total_a_pagar: number;
  fecha_pago: string | null;
}
interface TurnoLite { id: string; sucursal_id: string; created_at: string | null }

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

const fmtFecha = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export default function BaseDespachadoresPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([]);
  const [editMontos, setEditMontos] = useState<Record<string, string>>({});
  const [savingT, setSavingT] = useState(false);

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [turnos, setTurnos] = useState<TurnoLite[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros
  const [fSucursal, setFSucursal] = useState<string>("all");
  const [fDespachador, setFDespachador] = useState<string>("all");
  const [fDesde, setFDesde] = useState<string>("");
  const [fHasta, setFHasta] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [tR, pR, sR, tuR] = await Promise.all([
        supabase.from("tarifas_despachador").select("*").order("horas"),
        supabase.from("pago_despachadores").select("*").order("fecha_pago", { ascending: false }),
        supabase.from("sucursales").select("id,nombre").eq("activo", true),
        supabase.from("turnos").select("id,sucursal_id,created_at"),
      ]);
      const ts = (tR.data as Tarifa[]) ?? [];
      setTarifas(ts);
      setEditMontos(Object.fromEntries(ts.map((t) => [t.id, String(t.monto)])));
      const ps = (pR.data as Pago[]) ?? [];
      setPagos(ps);
      setTurnos((tuR.data as TurnoLite[]) ?? []);
      setSucursales((sR.data as Sucursal[]) ?? []);

      const despIds = Array.from(new Set(ps.map((p) => p.despachador_id)));
      if (despIds.length) {
        const { data: us } = await supabase
          .from("usuarios").select("id,nombre,nombre_completo").in("id", despIds);
        setUsuarios((us as Usuario[]) ?? []);
      }
      setLoading(false);
    })();
  }, []);

  const nombreUsuario = (id: string) => {
    const u = usuarios.find((x) => x.id === id);
    return u ? (u.nombre_completo || u.nombre) : "—";
  };
  const nombreSucursal = (id: string) => sucursales.find((s) => s.id === id)?.nombre ?? "—";
  const sucursalDeTurno = (turnoId: string) => turnos.find((t) => t.id === turnoId)?.sucursal_id ?? "";

  const guardarTarifas = async () => {
    setSavingT(true);
    try {
      const tasks = tarifas
        .map((t) => {
          const nuevo = parseInt(editMontos[t.id] || "0", 10) || 0;
          if (nuevo === t.monto) return null;
          return (async () => {
            await supabase
              .from("tarifas_despachador")
              .update({ monto: nuevo, updated_at: new Date().toISOString() })
              .eq("id", t.id);
          })();
        })
        .filter((p): p is Promise<void> => p !== null);
      await Promise.all(tasks);
      toast.success("Tarifas guardadas");
      const { data } = await supabase.from("tarifas_despachador").select("*").order("horas");
      const ts = (data as Tarifa[]) ?? [];
      setTarifas(ts);
      setEditMontos(Object.fromEntries(ts.map((t) => [t.id, String(t.monto)])));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSavingT(false);
    }
  };

  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      if (fDespachador !== "all" && p.despachador_id !== fDespachador) return false;
      const sId = sucursalDeTurno(p.turno_id);
      if (fSucursal !== "all" && sId !== fSucursal) return false;
      if (fDesde && p.fecha_pago && new Date(p.fecha_pago) < new Date(fDesde)) return false;
      if (fHasta && p.fecha_pago && new Date(p.fecha_pago) > new Date(fHasta + "T23:59:59")) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagos, fSucursal, fDespachador, fDesde, fHasta, turnos]);

  const resumenPorDespachador = useMemo(() => {
    const map = new Map<string, {
      despachador_id: string;
      dias: Set<string>;
      horas: number;
      base: number;
      bono: number;
      pedidos: number;
      turnos: number;
      sucursales: Record<string, number>;
    }>();
    for (const p of pagosFiltrados) {
      const cur = map.get(p.despachador_id) ?? {
        despachador_id: p.despachador_id,
        dias: new Set<string>(),
        horas: 0, base: 0, bono: 0, pedidos: 0, turnos: 0,
        sucursales: {} as Record<string, number>,
      };
      if (p.fecha_pago) cur.dias.add(p.fecha_pago.slice(0, 10));
      cur.horas += Number(p.horas_trabajadas ?? 0);
      cur.base += Number(p.base_por_horas ?? 0);
      cur.bono += Number(p.bono ?? 0);
      cur.pedidos += Number(p.pedidos_entregados ?? 0);
      cur.turnos += 1;
      const sId = sucursalDeTurno(p.turno_id);
      if (sId) cur.sucursales[sId] = (cur.sucursales[sId] ?? 0) + 1;
      map.set(p.despachador_id, cur);
    }
    return Array.from(map.values()).map((r) => {
      const sucTop = Object.entries(r.sucursales).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
      return {
        ...r,
        diasTrabajados: r.dias.size,
        promedioPedidos: r.turnos > 0 ? r.pedidos / r.turnos : 0,
        sucursalTop: sucTop,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagosFiltrados, turnos]);

  const despachadoresUnicos = useMemo(() => {
    const ids = Array.from(new Set(pagos.map((p) => p.despachador_id)));
    return ids.map((id) => ({ id, nombre: nombreUsuario(id) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagos, usuarios]);

  if (loading) {
    return (
      <div className="p-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Bike className="h-7 w-7 text-primary" />
        <h1 className="font-display text-3xl text-foreground">Base Despachadores</h1>
      </div>

      {/* Sección 1: Tarifas */}
      <div className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-foreground uppercase tracking-wider">
            Tarifas por horas
          </h2>
          <Button onClick={guardarTarifas} disabled={savingT} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {savingT ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-2" />Guardar tarifas</>}
          </Button>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Horas trabajadas</TableHead>
              <TableHead>Descripción</TableHead>
              <TableHead className="text-right">Base a pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tarifas.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="font-mono">{t.horas}</TableCell>
                <TableCell>{t.descripcion}</TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    value={editMontos[t.id] ?? ""}
                    onChange={(e) => setEditMontos({ ...editMontos, [t.id]: e.target.value })}
                    className="bg-background font-mono text-right max-w-[160px] ml-auto"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="space-y-2">
          <Label className="label-upper">Sucursal</Label>
          <Select value={fSucursal} onValueChange={setFSucursal}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {sucursales.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="label-upper">Despachador</Label>
          <Select value={fDespachador} onValueChange={setFDespachador}>
            <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {despachadoresUnicos.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label className="label-upper">Desde</Label>
          <Input type="date" value={fDesde} onChange={(e) => setFDesde(e.target.value)} className="bg-background" />
        </div>
        <div className="space-y-2">
          <Label className="label-upper">Hasta</Label>
          <Input type="date" value={fHasta} onChange={(e) => setFHasta(e.target.value)} className="bg-background" />
        </div>
      </div>

      {/* Sección 2: Historial */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display text-xl text-foreground uppercase tracking-wider mb-4">
          Historial de pagos
        </h2>
        {pagosFiltrados.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Sin pagos registrados para el filtro.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Sucursal</TableHead>
                <TableHead>Despachador</TableHead>
                <TableHead className="text-right">Horas</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">Despachos (ref.)</TableHead>
                <TableHead className="text-right">Bono</TableHead>
                <TableHead className="text-right">Total pagado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagosFiltrados.map((p) => (
                <TableRow key={p.id} className="cursor-pointer">
                  <TableCell>{fmtFecha(p.fecha_pago)}</TableCell>
                  <TableCell>{nombreSucursal(sucursalDeTurno(p.turno_id))}</TableCell>
                  <TableCell>{nombreUsuario(p.despachador_id)}</TableCell>
                  <TableCell className="text-right font-mono">{Number(p.horas_trabajadas ?? 0).toFixed(2)} h</TableCell>
                  <TableCell className="text-right font-mono">{fmtCLP(Number(p.base_por_horas ?? 0))}</TableCell>
                  <TableCell className="text-right font-mono text-muted-foreground">{fmtCLP(Number(p.total_despachos_cobrados ?? 0))}</TableCell>
                  <TableCell className="text-right font-mono">{fmtCLP(Number(p.bono ?? 0))}</TableCell>
                  <TableCell className="text-right font-mono text-primary">{fmtCLP(Number(p.total_a_pagar))}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Sección 3: Resumen */}
      <div className="bg-card border border-border rounded-xl p-5">
        <h2 className="font-display text-xl text-foreground uppercase tracking-wider mb-4">
          Resumen por despachador
        </h2>
        {resumenPorDespachador.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">Sin datos.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {resumenPorDespachador.map((r) => (
              <div key={r.despachador_id} className="border border-border rounded-xl p-4 bg-background">
                <div className="flex items-center gap-2 mb-3">
                  <Bike className="h-5 w-5 text-primary" />
                  <h3 className="font-display text-lg text-foreground">{nombreUsuario(r.despachador_id)}</h3>
                </div>
                <div className="grid grid-cols-2 gap-y-2 text-sm">
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Días</div>
                  <div className="font-mono text-right">{r.diasTrabajados}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Horas</div>
                  <div className="font-mono text-right">{r.horas.toFixed(2)} h</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Base</div>
                  <div className="font-mono text-right">{fmtCLP(r.base)}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Bonos</div>
                  <div className="font-mono text-right">{fmtCLP(r.bono)}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Prom. pedidos/turno</div>
                  <div className="font-mono text-right">{r.promedioPedidos.toFixed(1)}</div>
                  <div className="text-xs text-muted-foreground uppercase tracking-wider">Sucursal top</div>
                  <div className="font-mono text-right">{nombreSucursal(r.sucursalTop)}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}