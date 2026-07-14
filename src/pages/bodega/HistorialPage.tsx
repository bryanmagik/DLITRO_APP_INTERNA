import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ESTADO_META, EstadoLogistica, fmtFecha } from "@/lib/logistica";

interface Pedido { id: string; sucursal_id: string; estado: string; created_at: string | null; chofer_id: string | null }
interface Sucursal { id: string; nombre: string }
interface Chofer { id: string; nombre: string; nombre_completo: string | null }

export default function HistorialPage() {
  const [loading, setLoading] = useState(true);
  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [sucursales, setSucursales] = useState<Sucursal[]>([]);
  const [usuarios, setUsuarios] = useState<Chofer[]>([]);

  useEffect(() => {
    (async () => {
      const [peR, sR, uR] = await Promise.all([
        supabase.from("pedidos_logistica").select("*").eq("estado", "entregado").order("created_at", { ascending: false }).limit(200),
        supabase.from("sucursales").select("id,nombre"),
        supabase.from("usuarios").select("id,nombre,nombre_completo"),
      ]);
      setPedidos((peR.data as Pedido[]) ?? []);
      setSucursales((sR.data as Sucursal[]) ?? []);
      setUsuarios((uR.data as Chofer[]) ?? []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="font-display text-3xl">Historial de entregas</h1>
        <p className="text-sm text-muted-foreground">Pedidos de logística entregados.</p>
      </div>
      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 border-b border-border">
            <tr className="text-left text-muted-foreground uppercase text-xs tracking-wider">
              <th className="px-4 py-3">Sucursal</th>
              <th className="px-4 py-3">Fecha</th>
              <th className="px-4 py-3">Chofer</th>
              <th className="px-4 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {pedidos.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Sin entregas registradas.</td></tr>
            ) : pedidos.map((p) => {
              const meta = ESTADO_META[(p.estado as EstadoLogistica)] ?? ESTADO_META.entregado;
              const suc = sucursales.find((s) => s.id === p.sucursal_id);
              const cho = usuarios.find((u) => u.id === p.chofer_id);
              return (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium">{suc?.nombre ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtFecha(p.created_at)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{cho ? (cho.nombre_completo || cho.nombre) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-bold border ${meta.cls}`}>
                      <meta.icon className="h-3 w-3" /> {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}