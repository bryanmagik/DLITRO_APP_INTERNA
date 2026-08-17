import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Bike, Store, CheckCircle2, LogOut, RefreshCw, Bell, BellOff, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { formatSaborExtra } from "@/lib/printComanda";

interface ItemRow {
  id: string;
  cantidad: number;
  notas: string | null;
  producto: { nombre: string } | null;
}

interface PedidoCocina {
  id: string;
  numero_pedido: number | null;
  cliente_nombre: string;
  tipo: "despacho" | "retiro";
  created_at: string;
  items: ItemRow[];
  requiere_revision_cocina: boolean;
}

const fmtHaceMin = (iso: string) => {
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "recién";
  if (min === 1) return "hace 1 min";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r === 0 ? `hace ${h} h` : `hace ${h} h ${r} min`;
};

export default function CocinaPage() {
  const { perfil, sucursalNombre } = useAuthStore();
  const [pedidos, setPedidos] = useState<PedidoCocina[]>([]);
  const [loading, setLoading] = useState(true);
  const [hidingIds, setHidingIds] = useState<Set<string>>(new Set());
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [, force] = useState(0);
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [realtimeOk, setRealtimeOk] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem("dlitro-cocina-sound") !== "off";
  });
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const knownIdsRef = (globalThis as any).__cocinaKnownIdsRef ?? { current: new Set<string>() };
  (globalThis as any).__cocinaKnownIdsRef = knownIdsRef;

  // tick para refrescar "hace X min"
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, []);

  const sucursalId = perfil?.sucursal_id ?? null;

  useEffect(() => {
    localStorage.setItem("dlitro-cocina-sound", soundOn ? "on" : "off");
  }, [soundOn]);

  const playNotificationSound = () => {
    try {
      const AC = (window.AudioContext || (window as any).webkitAudioContext);
      if (!AC) return;
      const audioCtx = new AC();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.setValueAtTime(600, audioCtx.currentTime + 0.1);
      gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.5);
    } catch (e) {
      // ignore
    }
  };

  const fetchPedidos = useMemo(
    () => async () => {
      if (!sucursalId) return;
      // 1) turno abierto de la sucursal
      const { data: turno } = await supabase
        .from("turnos")
        .select("id")
        .eq("sucursal_id", sucursalId)
        .eq("estado", "abierto")
        .maybeSingle();
      const tId = (turno?.id as string | undefined) ?? null;
      setTurnoId(tId);
      if (!tId) {
        setPedidos([]);
        setLoading(false);
        return;
      }
      const { data, error } = await supabase
        .from("pedidos")
        .select("id, numero_pedido, cliente_nombre, tipo, created_at, requiere_revision_cocina, pedido_items(id, cantidad, notas, producto:producto_id(nombre))")
        .eq("turno_id", tId)
        .eq("estado", "en_preparacion")
        .order("created_at", { ascending: true });
      if (error) {
        console.error("[cocina] fetch error:", error);
        return;
      }
      const rows = (data ?? []).map((p) => ({
        id: p.id as string,
        numero_pedido: p.numero_pedido as number | null,
        cliente_nombre: p.cliente_nombre as string,
        tipo: p.tipo as "despacho" | "retiro",
        created_at: p.created_at as string,
        items: ((p as { pedido_items?: ItemRow[] }).pedido_items ?? []) as ItemRow[],
        requiere_revision_cocina: Boolean(p.requiere_revision_cocina),
      })) as PedidoCocina[];
      setPedidos(rows);
      // Detectar pedidos nuevos
      const incomingIds = new Set(rows.map((r) => r.id));
      const fresh: string[] = [];
      incomingIds.forEach((id) => {
        if (!knownIdsRef.current.has(id)) fresh.push(id);
      });
      const hadKnown = knownIdsRef.current.size > 0;
      knownIdsRef.current = incomingIds;
      if (hadKnown && fresh.length > 0) {
        if (soundOn && tId) playNotificationSound();
        setNewIds((prev) => {
          const n = new Set(prev);
          fresh.forEach((id) => n.add(id));
          return n;
        });
        fresh.forEach((id) => {
          setTimeout(() => {
            setNewIds((prev) => {
              const n = new Set(prev);
              n.delete(id);
              return n;
            });
          }, 2000);
        });
      }
      setLastUpdate(Date.now());
      setLoading(false);
    },
    [sucursalId, soundOn],
  );

  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  // Realtime
  useEffect(() => {
    if (!sucursalId) return;
    const ch = supabase
      .channel(`cocina-${sucursalId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedidos", filter: `sucursal_id=eq.${sucursalId}` },
        () => fetchPedidos(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "pedido_items" },
        () => fetchPedidos(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "turnos", filter: `sucursal_id=eq.${sucursalId}` },
        () => fetchPedidos(),
      )
      .subscribe((status) => {
        setRealtimeOk(status === "SUBSCRIBED");
      });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [sucursalId, fetchPedidos]);

  // Polling de respaldo cada 30s
  useEffect(() => {
    if (!sucursalId) return;
    const t = setInterval(() => fetchPedidos(), 30000);
    return () => clearInterval(t);
  }, [sucursalId, fetchPedidos]);

  const handleManualRefresh = async () => {
    setRefreshing(true);
    await fetchPedidos();
    setTimeout(() => setRefreshing(false), 600);
  };

  const segundosDesdeUpdate = Math.floor((Date.now() - lastUpdate) / 1000);

  const marcarListo = async (id: string) => {
    setHidingIds((prev) => new Set(prev).add(id));
    setTimeout(async () => {
      const { error } = await supabase.from("pedidos").update({ estado: "listo" }).eq("id", id);
      if (error) {
        toast.error(error.message);
        setHidingIds((prev) => {
          const n = new Set(prev);
          n.delete(id);
          return n;
        });
        return;
      }
      setPedidos((prev) => prev.filter((p) => p.id !== id));
      setHidingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    }, 300);
  };

  const cerrarSesion = async () => {
    await supabase.auth.signOut();
  };

  const visibles = pedidos.filter((p) => !hidingIds.has(p.id));

  return (
    <div className="min-h-screen bg-black text-white">
      <header className="sticky top-0 z-10 border-b border-white/10 bg-black/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="font-display text-3xl text-primary">dlitro</span>
            <span className="text-sm uppercase tracking-widest text-white/60">cocina</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs">
              {realtimeOk ? (
                <span className="text-success">🟢 Actualizado hace {segundosDesdeUpdate}s</span>
              ) : (
                <span className="text-destructive">🔴 Sin conexión en tiempo real — actualizando cada 30s</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleManualRefresh}
              className="text-white/70 hover:text-white"
              title="Actualizar"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSoundOn((v) => !v)}
              className="text-white/70 hover:text-white"
              title={soundOn ? "Silenciar" : "Activar sonido"}
            >
              {soundOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
            </Button>
            <span className="text-sm text-white/70">{sucursalNombre ?? "—"}</span>
            <Button variant="ghost" size="sm" onClick={cerrarSesion} className="text-white/70 hover:text-white">
              <LogOut className="h-4 w-4 mr-1" /> Salir
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-6 py-6">
        {loading ? (
          <div className="flex h-[60vh] items-center justify-center text-white/50">Cargando…</div>
        ) : !turnoId ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <div className="font-display text-3xl">Sin turno activo</div>
            <div className="text-white/60">Esperando apertura de turno</div>
          </div>
        ) : visibles.length === 0 ? (
          <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
            <CheckCircle2 className="h-16 w-16 text-success" />
            <div className="font-display text-3xl">Todo al día</div>
            <div className="text-white/60">Sin pedidos pendientes</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {visibles.map((p) => {
              const isHiding = hidingIds.has(p.id);
              const isNew = newIds.has(p.id);
              const isDespacho = p.tipo === "despacho";
              return (
                <article
                  key={p.id}
                  className={`rounded-xl border p-5 shadow-xl transition-all duration-500 ${
                    isHiding ? "scale-95 opacity-0" : "scale-100 opacity-100"
                  } ${
                    isNew
                      ? "border-success bg-success/20 animate-slide-in-right"
                      : "border-white/15 bg-zinc-950"
                  }`}
                >
                  <header className="flex items-start justify-between gap-3">
                    <div className="font-display text-5xl font-bold leading-none text-primary">
                      #{p.numero_pedido ?? "—"}
                    </div>
                    <div
                      className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-bold uppercase tracking-wider ${
                        isDespacho ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/20 text-sky-300"
                      }`}
                    >
                      {isDespacho ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                      {isDespacho ? "Despacho" : "Retiro"}
                    </div>
                  </header>

                  {p.requiere_revision_cocina && (
                    <div className="mt-3 flex items-center gap-2 rounded-md border border-destructive bg-destructive/20 px-3 py-2 text-sm font-bold uppercase tracking-wide text-destructive animate-pulse">
                      <AlertTriangle className="h-4 w-4 shrink-0" /> Pedido modificado — revisar comanda
                    </div>
                  )}

                  <ul className="mt-4 space-y-2 border-y border-white/10 py-4">
                    {p.items.length === 0 && <li className="text-sm text-white/40">Sin items</li>}
                    {p.items.map((it) => (
                      <li key={it.id} className="text-base leading-snug">
                        <div className="font-medium">
                          <span className="font-mono text-primary">{it.cantidad}x</span>{" "}
                          {it.producto?.nombre ?? "—"}
                        </div>
                        {it.notas && (
                          <div className="ml-6 text-sm text-white/60">+ {it.notas.replace(/Pulpa de /gi, "")}</div>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-3 flex items-center justify-between text-sm text-white/60">
                    <span>
                      Cliente: <span className="text-white">{p.cliente_nombre}</span>
                    </span>
                    <span>{fmtHaceMin(p.created_at)}</span>
                  </div>

                  <Button
                    onClick={() => marcarListo(p.id)}
                    disabled={isHiding}
                    className="mt-4 h-14 w-full bg-success text-success-foreground text-lg font-bold uppercase tracking-wider hover:bg-success/90"
                  >
                    <CheckCircle2 className="mr-2 h-6 w-6" /> Listo
                  </Button>
                </article>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}