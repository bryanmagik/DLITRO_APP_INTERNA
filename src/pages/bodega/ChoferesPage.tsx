import { useEffect, useState } from "react";
import { Loader2, Plus, Bike, Phone } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

interface Chofer { id: string; nombre: string; nombre_completo: string | null; telefono: string | null; activo: boolean | null }
interface PedidoLite { chofer_id: string | null; estado: string }

export default function ChoferesPage() {
  const [loading, setLoading] = useState(true);
  const [choferes, setChoferes] = useState<Chofer[]>([]);
  const [pedidos, setPedidos] = useState<PedidoLite[]>([]);
  const [nuevoOpen, setNuevoOpen] = useState(false);

  const cargar = async () => {
    setLoading(true);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const [chR, peR] = await Promise.all([
      supabase.from("usuarios").select("id,nombre,nombre_completo,telefono,activo,rol").eq("activo", true),
      supabase.from("pedidos_logistica").select("chofer_id,estado").gte("created_at", hoy.toISOString()),
    ]);
    setChoferes(((chR.data as (Chofer & { rol: string })[]) ?? []).filter((u) => u.rol === "logistica"));
    setPedidos((peR.data as PedidoLite[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { cargar(); }, []);

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;

  return (
    <div className="p-6 space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl">Choferes</h1>
          <p className="text-sm text-muted-foreground">Equipo de logística disponible para despachos.</p>
        </div>
        <Button onClick={() => setNuevoOpen(true)} className="uppercase tracking-wider font-bold">
          <Plus className="h-4 w-4 mr-2" /> Agregar chofer
        </Button>
      </div>

      {choferes.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center text-muted-foreground">No hay choferes activos.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {choferes.map((c) => {
            const asig = pedidos.filter((p) => p.chofer_id === c.id);
            const enRuta = asig.some((p) => p.estado === "en_camino");
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bike className="h-5 w-5 text-primary" />
                    <h3 className="font-display text-lg">{c.nombre_completo || c.nombre}</h3>
                  </div>
                  <span className={`text-xs uppercase tracking-wider font-bold ${enRuta ? "text-orange-600" : "text-success"}`}>
                    {enRuta ? "En ruta" : "Disponible"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground mt-2 flex items-center gap-1">
                  <Phone className="h-3 w-3" /> {c.telefono ?? "—"}
                </div>
                <div className="border-t border-border mt-3 pt-3 flex items-center justify-between">
                  <span className="text-xs uppercase tracking-wider text-muted-foreground">Entregas hoy</span>
                  <span className="font-mono text-2xl text-primary">{asig.length}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {nuevoOpen && <NuevoChoferModal onClose={() => setNuevoOpen(false)} onSaved={() => { setNuevoOpen(false); cargar(); }} />}
    </div>
  );
}

function NuevoChoferModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [nombre, setNombre] = useState("");
  const [apellido, setApellido] = useState("");
  const [telefono, setTelefono] = useState("");
  const [saving, setSaving] = useState(false);

  const guardar = async () => {
    if (!nombre.trim()) return toast.error("Nombre requerido");
    setSaving(true);
    const id = crypto.randomUUID();
    const { error } = await supabase.from("usuarios").insert({
      id, nombre: nombre.trim(), apellido: apellido.trim() || null,
      telefono: telefono.trim() || null, rol: "logistica", activo: true,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Chofer creado · pedile que se registre con su email");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-background border-border">
        <DialogHeader><DialogTitle className="font-display text-2xl">Agregar chofer</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="label-upper">Nombre</Label><Input value={nombre} onChange={(e) => setNombre(e.target.value)} className="bg-background mt-1" /></div>
          <div><Label className="label-upper">Apellido</Label><Input value={apellido} onChange={(e) => setApellido(e.target.value)} className="bg-background mt-1" /></div>
          <div><Label className="label-upper">Teléfono</Label><Input value={telefono} onChange={(e) => setTelefono(e.target.value)} className="bg-background mt-1" /></div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="uppercase tracking-wider font-bold">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}