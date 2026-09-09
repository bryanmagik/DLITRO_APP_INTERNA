import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Outlet, useOutletContext } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import AperturaTurno from "./AperturaTurno";
import UnirseTurnoActivo from "./UnirseTurnoActivo";
import CierreTurnoModal from "./CierreTurnoModal";
import AgregarCajaChicaModal from "./AgregarCajaChicaModal";
import CambioTurnoModal from "./CambioTurnoModal";
import { useTurnoHeaderStore } from "@/stores/turnoHeaderStore";
import { puedeCerrarTurno } from "@/lib/turnoPermisos";

export interface Turno {
  id: string;
  sucursal_id: string;
  tomador_id: string;
  caja_chica_apertura: number;
  numero_ultimo_pedido: number | null;
  estado: string;
  created_at: string | null;
}

type TurnoCtx = { turno: Turno; refreshTurno: () => Promise<void> };
export const useTurno = () => useOutletContext<TurnoCtx>();

export default function TurnoPage() {
  const { perfil } = useAuthStore();
  const [turno, setTurno] = useState<Turno | null>(null);
  const [unido, setUnido] = useState(false);
  const [loading, setLoading] = useState(true);
  const setHeaderInfo = useTurnoHeaderStore((s) => s.setInfo);

  const cargar = useCallback(async () => {
    if (!perfil?.sucursal_id) { setLoading(false); return; }
    setLoading(true);
    const { data } = await supabase
      .from("turnos").select("*")
      .eq("sucursal_id", perfil.sucursal_id)
      .eq("estado", "abierto")
      .maybeSingle();
    const next = (data as Turno | null) ?? null;
    setTurno(next);
    if (!next) setUnido(false);
    setLoading(false);
  }, [perfil?.sucursal_id]);

  const handleAbierto = async () => {
    await cargar();
    setUnido(true);
  };

  useEffect(() => { void cargar(); }, [cargar]);
  const [cerrarOpen, setCerrarOpen] = useState(false);
  const [cajaOpen, setCajaOpen] = useState(false);
  const [cambioOpen, setCambioOpen] = useState(false);

  useEffect(() => {
    if (turno && unido) {
      setHeaderInfo({
        cajaChica: turno.caja_chica_apertura,
        puedeCerrarTurno: puedeCerrarTurno(turno.tomador_id, perfil?.id, perfil?.rol),
        onAgregarCaja: () => setCajaOpen(true),
        onCambioTurno: () => setCambioOpen(true),
        onCerrarTurno: () => setCerrarOpen(true),
      });
    } else {
      setHeaderInfo(null);
    }
    return () => setHeaderInfo(null);
  }, [turno, unido, perfil?.id, perfil?.rol, setHeaderInfo]);

  if (!perfil?.sucursal_id) {
    return <div className="p-12 bg-card border border-border rounded-xl text-center text-muted-foreground">
      Tu cuenta no tiene sucursal asignada. Contactá al administrador.
    </div>;
  }
  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…</div>;
  if (!turno) return <AperturaTurno sucursalId={perfil.sucursal_id} onAbierto={handleAbierto} />;
  if (!unido) return <UnirseTurnoActivo turno={turno} onUnirse={() => setUnido(true)} />;
  return (
    <div className="space-y-4">
      <Outlet context={{ turno, refreshTurno: cargar } satisfies TurnoCtx} />
      <CierreTurnoModal turno={turno} open={cerrarOpen} onOpenChange={setCerrarOpen} onCerrado={() => { setUnido(false); cargar(); }} />
      <AgregarCajaChicaModal turno={turno} open={cajaOpen} onOpenChange={setCajaOpen} onAgregado={cargar} />
      <CambioTurnoModal turno={turno} open={cambioOpen} onOpenChange={setCambioOpen} onCambio={cargar} />
    </div>
  );
}
