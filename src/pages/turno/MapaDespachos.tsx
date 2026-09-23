import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, MapPin, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { useTurno } from "./TurnoPage";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PedidoDespacho {
  id: string;
  numero_pedido: number | null;
  cliente_nombre: string;
  estado: string;
  direccion_entrega: string | null;
  latitud_entrega: number | null;
  longitud_entrega: number | null;
  despachador_id: string | null;
  total: number;
  metodo_pago: string | null;
  updated_at: string | null;
}

interface Despachador {
  id: string;
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
}

interface TurnoDespachadorQueryRow {
  usuarios: Despachador | null;
}

interface Sucursal {
  id: string;
  nombre: string;
  direccion: string;
  latitud: number;
  longitud: number;
}

declare global {
  interface Window {
    __dlitroTogglePedido?: (id: string) => void;
  }
}

// ── Constantes ────────────────────────────────────────────────────────────────

const COLORES: Record<string, string> = {
  en_preparacion: "#EAB308",
  listo: "#F97316",
  en_despacho: "#A855F7",
  cancelado: "#6B7280",
};

const ETIQUETAS: Record<string, string> = {
  en_preparacion: "En preparación",
  listo: "Listo",
  en_despacho: "En despacho",
  cancelado: "Cancelado",
};

const METODO_PAGO: Record<string, string> = {
  efectivo: "Efectivo",
  transferencia: "Transferencia",
  tarjeta: "Tarjeta",
};

// Solo los activos aparecen como marcadores en el mapa; cancelado solo en la lista
const ESTADOS_MAPA = ["en_preparacion", "listo", "en_despacho"];
// Solo entregado se excluye del listado
const ESTADOS_EXCLUIDOS = ["entregado"];

// ── Tiempo transcurrido ───────────────────────────────────────────────────────

function tiempoTranscurrido(updatedAt: string | null): { texto: string; alerta: boolean } {
  if (!updatedAt) return { texto: "", alerta: false };
  const mins = Math.floor((Date.now() - new Date(updatedAt).getTime()) / 60_000);
  if (mins < 1) return { texto: "ahora", alerta: false };
  if (mins < 60) return { texto: `hace ${mins} min`, alerta: mins >= 30 };
  const hrs = Math.floor(mins / 60);
  return { texto: `hace ${hrs} hr${hrs > 1 ? "s" : ""}`, alerta: true };
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function buildPinSvg(label: string, color: string, focused = false, selected = false): string {
  const strokeW = focused || selected ? "2.5" : "1.5";
  // Gold dashed ring for selected, white inner ring for focused
  const outerRing = selected
    ? `<circle cx="18" cy="22" r="16" fill="none" stroke="#FBBF24" stroke-width="2" stroke-dasharray="4 2"/>`
    : "";
  const innerRing = focused
    ? `<circle cx="18" cy="18" r="14" fill="none" stroke="white" stroke-width="2" opacity="0.65"/>`
    : "";

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="44" viewBox="0 0 36 44">
    ${outerRing}${innerRing}
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="${color}" stroke="white" stroke-width="${strokeW}"/>
    <circle cx="18" cy="18" r="10" fill="white" opacity="0.95"/>
    <text x="18" y="23" text-anchor="middle" font-family="Inter,sans-serif" font-size="10" font-weight="700" fill="${color}">${label}</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildCasaSvg(activa: boolean): string {
  // activa (propia) → verde más grande; otra → gris más pequeña
  const fill = activa ? "#22C55E" : "#9CA3AF";
  const stroke = activa ? "2" : "1.5";
  const w = activa ? 42 : 32;
  const h = activa ? 50 : 38;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 36 44">
    <path d="M18 0C8.06 0 0 8.06 0 18c0 13.5 18 26 18 26S36 31.5 36 18C36 8.06 27.94 0 18 0z" fill="${fill}" stroke="white" stroke-width="${stroke}"/>
    <circle cx="18" cy="18" r="11" fill="white" opacity="0.9"/>
    <text x="18" y="24" text-anchor="middle" font-size="13">🏠</text>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[character];
  });
}

// ── Contenido del InfoWindow ───────────────────────────────────────────────────

function buildInfoWindowContent(
  p: PedidoDespacho,
  selected: boolean,
  despachadores: Despachador[],
): string {
  const color = COLORES[p.estado] ?? "#6B7280";
  const etiqueta = escapeHtml(ETIQUETAS[p.estado] ?? p.estado);
  const { texto: tiempo, alerta } = tiempoTranscurrido(p.updated_at);
  const tiempoColor = alerta ? "#EF4444" : "#9CA3AF";

  const monto = p.total != null
    ? `$${p.total.toLocaleString("es-CL")}`
    : "—";
  const metodo = p.metodo_pago
    ? escapeHtml(METODO_PAGO[p.metodo_pago] ?? p.metodo_pago)
    : "—";

  const d = despachadores.find((x) => x.id === p.despachador_id);
  const dNombre = d
    ? escapeHtml(d.nombre_completo ?? `${d.nombre} ${d.apellido ?? ""}`.trim())
    : null;
  const despachadoreHtml = dNombre
    ? `<span style="color:#111827">${dNombre}</span>`
    : `<span style="color:#EF4444;font-weight:600">Sin asignar</span>`;

  const pedidoId = /^[0-9a-f-]{36}$/i.test(p.id) ? p.id : "";
  const checkId = `iw-chk-${pedidoId}`;
  const clienteNombre = escapeHtml(p.cliente_nombre);
  const direccionEntrega = p.direccion_entrega ? escapeHtml(p.direccion_entrega) : null;

  return `
<div style="font-family:Inter,sans-serif;width:230px;font-size:12px;line-height:1.4;margin:-8px -11px">
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px 7px;border-bottom:1px solid #e5e7eb">
    <div style="display:flex;align-items:center;gap:5px">
      <span style="font-size:13px;font-weight:700;color:${color}">#${p.numero_pedido ?? "—"}</span>
      <span style="font-size:10px;font-weight:600;color:${color};background:${color}22;padding:2px 6px;border-radius:4px;white-space:nowrap">${etiqueta}</span>
    </div>
    ${tiempo ? `<span style="font-size:11px;font-weight:${alerta ? 700 : 500};color:${tiempoColor};white-space:nowrap">⏱ ${tiempo}</span>` : ""}
  </div>
  <!-- Body -->
  <div style="padding:8px 12px;display:flex;flex-direction:column;gap:5px">
    <div style="display:flex;align-items:flex-start;gap:6px">
      <span>👤</span>
      <span style="color:#111827;font-weight:500">${clienteNombre}</span>
    </div>
    ${direccionEntrega ? `
    <div style="display:flex;align-items:flex-start;gap:6px">
      <span style="margin-top:1px">📍</span>
      <span style="color:#6b7280;font-size:11px">${direccionEntrega}</span>
    </div>` : ""}
    <div style="display:flex;align-items:center;gap:6px">
      <span>💰</span>
      <span style="color:#111827">${monto} <span style="color:#9ca3af">(${metodo})</span></span>
    </div>
    <div style="display:flex;align-items:center;gap:6px">
      <span>🏍️</span>
      ${despachadoreHtml}
    </div>
  </div>
  <!-- Checkbox footer -->
  <div style="padding:6px 12px 8px;border-top:1px solid #e5e7eb">
    <label for="${checkId}" style="display:flex;align-items:center;gap:7px;cursor:pointer;user-select:none">
      <input
        id="${checkId}"
        type="checkbox"
        ${selected ? "checked" : ""}
        onchange="window.__dlitroTogglePedido && window.__dlitroTogglePedido('${pedidoId}')"
        style="cursor:pointer;width:13px;height:13px;accent-color:${color}"
      />
      <span style="font-size:11px;color:#374151;font-weight:500">Seleccionar este pedido</span>
    </label>
  </div>
</div>`;
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function MapaDespachos() {
  const { perfil } = useAuthStore();
  const { turno } = useTurno();

  // Map refs
  const mapRef = useRef<HTMLDivElement>(null);
  const gmapRef = useRef<google.maps.Map | null>(null);
  const dirServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const dirRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const markersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const sucursalMarkersRef = useRef<Map<string, google.maps.Marker>>(new Map());
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Data state
  const [sucursal, setSucursal] = useState<Sucursal | null>(null);   // propia (origen de rutas)
  const [todasSucursales, setTodasSucursales] = useState<Sucursal[]>([]);
  const [pedidos, setPedidos] = useState<PedidoDespacho[]>([]);
  const [despachadores, setDespachadores] = useState<Despachador[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gmapsListo, setGmapsListo] = useState(false);

  // UI state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [openPedidoId, setOpenPedidoId] = useState<string | null>(null);
  const [rutaActiva, setRutaActiva] = useState<string | null>(null);
  const [filtroDespachador, setFiltroDespachador] = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<{ despachadorId: string; nombre: string } | null>(null);
  const [asignando, setAsignando] = useState(false);

  // ── Datos ──────────────────────────────────────────────────────────────────

  const cargarSucursal = useCallback(async () => {
    if (!perfil?.sucursal_id) return;
    const { data } = await supabase
      .from("sucursales")
      .select("id, nombre, direccion, latitud, longitud")
      .eq("activo", true)
      .not("latitud", "is", null)
      .not("longitud", "is", null);
    if (!data) return;
    const todas = data as Sucursal[];
    setTodasSucursales(todas);
    const propia = todas.find((s) => s.id === perfil.sucursal_id) ?? null;
    setSucursal(propia);
  }, [perfil?.sucursal_id]);

  const cargarPedidos = useCallback(async () => {
    if (!turno?.id || !perfil?.sucursal_id) return;
    const { data, error: err } = await supabase
      .from("pedidos")
      .select("id, numero_pedido, cliente_nombre, estado, direccion_entrega, latitud_entrega, longitud_entrega, despachador_id, total, metodo_pago, updated_at")
      .eq("turno_id", turno.id)
      .eq("sucursal_id", perfil.sucursal_id)
      .eq("tipo", "despacho")
      .not("estado", "in", `(${ESTADOS_EXCLUIDOS.join(",")})`)
      .order("numero_pedido");
    if (err) { setError("No se pudieron cargar los pedidos."); return; }
    setPedidos((data ?? []) as PedidoDespacho[]);
  }, [turno?.id, perfil?.sucursal_id]);

  const cargarDespachadores = useCallback(async () => {
    if (!turno?.id) return;
    const { data, error: err } = await supabase
      .from("turno_despachadores")
      .select("despachador_id, usuarios(id, nombre, apellido, nombre_completo)")
      .eq("turno_id", turno.id)
      .eq("activo", true);
    if (err) { console.error("Error cargando despachadores:", err); return; }
    const rows = (data ?? []) as unknown as TurnoDespachadorQueryRow[];
    const lista: Despachador[] = rows.map((row) => ({
      id: row.usuarios?.id,
      nombre: row.usuarios?.nombre ?? "",
      apellido: row.usuarios?.apellido ?? null,
      nombre_completo: row.usuarios?.nombre_completo ?? null,
    })).filter((d) => d.id);
    setDespachadores(lista);
  }, [turno?.id]);

  // ── Callback global para checkbox del InfoWindow ───────────────────────────

  useEffect(() => {
    window.__dlitroTogglePedido = (id: string) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    };
    return () => { delete window.__dlitroTogglePedido; };
  }, []);

  // ── Google Maps init ───────────────────────────────────────────────────────

  useEffect(() => {
    loadGoogleMaps()
      .then(() => setGmapsListo(true))
      .catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!gmapsListo || !mapRef.current) return;

    const map = new google.maps.Map(mapRef.current, {
      center: { lat: -33.45, lng: -70.65 },
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: "poi", stylers: [{ visibility: "off" }] },
        { featureType: "transit", stylers: [{ visibility: "off" }] },
      ],
    });
    gmapRef.current = map;

    dirServiceRef.current = new google.maps.DirectionsService();
    dirRendererRef.current = new google.maps.DirectionsRenderer({
      suppressMarkers: true,
      polylineOptions: { strokeColor: "#6366F1", strokeWeight: 4, strokeOpacity: 0.85 },
    });
    dirRendererRef.current.setMap(map);

    // Un único InfoWindow compartido para todos los marcadores
    infoWindowRef.current = new google.maps.InfoWindow({ maxWidth: 260 });

    // Cerrar InfoWindow al hacer click en el mapa
    map.addListener("click", () => {
      infoWindowRef.current?.close();
      setOpenPedidoId(null);
    });

    Promise.all([cargarSucursal(), cargarPedidos(), cargarDespachadores()]).finally(() =>
      setCargando(false)
    );
  }, [gmapsListo, cargarSucursal, cargarPedidos, cargarDespachadores]);

  // ── Centrar en sucursal propia ─────────────────────────────────────────────

  useEffect(() => {
    if (!gmapRef.current || !sucursal) return;
    gmapRef.current.setCenter({ lat: sucursal.latitud, lng: sucursal.longitud });
  }, [sucursal]);

  // ── Marcadores de todas las sucursales ────────────────────────────────────

  useEffect(() => {
    if (!gmapRef.current || todasSucursales.length === 0) return;

    // Limpiar marcadores anteriores
    sucursalMarkersRef.current.forEach((m) => m.setMap(null));
    sucursalMarkersRef.current.clear();

    todasSucursales.forEach((suc) => {
      const activa = suc.id === perfil?.sucursal_id;
      const w = activa ? 42 : 32;
      const h = activa ? 50 : 38;
      const color = activa ? "#22C55E" : "#9CA3AF";

      const marker = new google.maps.Marker({
        position: { lat: suc.latitud, lng: suc.longitud },
        map: gmapRef.current!,
        title: suc.nombre,
        icon: {
          url: buildCasaSvg(activa),
          scaledSize: new google.maps.Size(w, h),
          anchor: new google.maps.Point(w / 2, h),
        },
        zIndex: activa ? 12 : 8,
      });

      const iwContent = `
        <div style="font-family:Inter,sans-serif;padding:6px 8px;min-width:160px">
          <div style="display:flex;align-items:center;gap:5px;margin-bottom:3px">
            <strong style="font-size:13px;color:${color}">🏠 ${suc.nombre}</strong>
            ${activa ? `<span style="font-size:10px;background:#dcfce7;color:#16a34a;padding:1px 5px;border-radius:4px;font-weight:600">Tu sucursal</span>` : ""}
          </div>
          <span style="font-size:11px;color:#6b7280">${suc.direccion}</span>
        </div>`;

      const iw = new google.maps.InfoWindow({ content: iwContent });
      marker.addListener("click", () => iw.open({ anchor: marker, map: gmapRef.current! }));

      sucursalMarkersRef.current.set(suc.id, marker);
    });
  }, [todasSucursales, perfil?.sucursal_id]);

  // ── Actualizar InfoWindow abierto cuando cambia estado ────────────────────

  useEffect(() => {
    if (!infoWindowRef.current || !openPedidoId || !gmapRef.current) return;
    const pedido = pedidos.find((p) => p.id === openPedidoId);
    if (!pedido) { infoWindowRef.current.close(); setOpenPedidoId(null); return; }
    const marker = markersRef.current.get(openPedidoId);
    infoWindowRef.current.setContent(
      buildInfoWindowContent(pedido, selectedIds.has(openPedidoId), despachadores)
    );
    if (marker) {
      infoWindowRef.current.open({ anchor: marker, map: gmapRef.current });
    }
  }, [openPedidoId, selectedIds, pedidos, despachadores]);

  // ── Trazar ruta ────────────────────────────────────────────────────────────

  const trazarRuta = useCallback(
    (pedido: PedidoDespacho) => {
      if (!dirServiceRef.current || !dirRendererRef.current || !gmapRef.current || !sucursal) return;
      if (!pedido.latitud_entrega || !pedido.longitud_entrega) return;
      setRutaActiva(pedido.id);
      dirServiceRef.current.route(
        {
          origin: { lat: sucursal.latitud, lng: sucursal.longitud },
          destination: { lat: pedido.latitud_entrega, lng: pedido.longitud_entrega },
          travelMode: google.maps.TravelMode.DRIVING,
        },
        (result, status) => {
          if (status === "OK" && result) dirRendererRef.current!.setDirections(result);
        }
      );
    },
    [sucursal]
  );

  // ── Focus de pedido ────────────────────────────────────────────────────────

  const focusPedido = useCallback(
    (pedido: PedidoDespacho, abrirPopup = false) => {
      setFocusedId(pedido.id);
      trazarRuta(pedido);
      if (pedido.latitud_entrega && pedido.longitud_entrega && gmapRef.current) {
        gmapRef.current.panTo({ lat: pedido.latitud_entrega, lng: pedido.longitud_entrega });
      }
      if (abrirPopup) setOpenPedidoId(pedido.id);
      setTimeout(() => {
        itemRefs.current.get(pedido.id)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 50);
    },
    [trazarRuta]
  );

  // ── Marcadores de pedidos ─────────────────────────────────────────────────

  const pedidosMapa = useMemo(
    () => pedidos.filter((p) => ESTADOS_MAPA.includes(p.estado) && p.latitud_entrega && p.longitud_entrega),
    [pedidos]
  );

  useEffect(() => {
    if (!gmapRef.current) return;

    const mapaIds = new Set(pedidosMapa.map((p) => p.id));

    // Eliminar marcadores obsoletos
    markersRef.current.forEach((marker, id) => {
      if (!mapaIds.has(id)) {
        marker.setMap(null);
        markersRef.current.delete(id);
        if (rutaActiva === id) {
          dirRendererRef.current?.set("directions", null);
          setRutaActiva(null);
        }
      }
    });

    // Agregar o actualizar marcadores
    pedidosMapa.forEach((pedido) => {
      const label = `#${pedido.numero_pedido ?? "?"}`;
      const color = COLORES[pedido.estado] ?? "#6B7280";
      const focused = pedido.id === focusedId;
      const selected = selectedIds.has(pedido.id);

      const icono = {
        url: buildPinSvg(label, color, focused, selected),
        scaledSize: new google.maps.Size(36, 44),
        anchor: new google.maps.Point(18, 44),
      };

      if (markersRef.current.has(pedido.id)) {
        const m = markersRef.current.get(pedido.id)!;
        m.setIcon(icono);
        m.setZIndex(focused ? 20 : selected ? 15 : 5);
      } else {
        const marker = new google.maps.Marker({
          position: { lat: pedido.latitud_entrega!, lng: pedido.longitud_entrega! },
          map: gmapRef.current!,
          title: label,
          icon: icono,
          zIndex: focused ? 20 : selected ? 15 : 5,
          animation: google.maps.Animation.DROP,
        });

        marker.addListener("click", () => {
          focusPedido(pedido, true);
        });

        markersRef.current.set(pedido.id, marker);
      }
    });
  }, [pedidosMapa, focusedId, selectedIds, rutaActiva, focusPedido]);

  // ── Realtime ───────────────────────────────────────────────────────────────
  // Filtramos por sucursal_id (más confiable que turno_id en Realtime para INSERT).
  // cargarPedidos() ya aplica el filtro turno_id + sucursal_id internamente.

  useEffect(() => {
    if (!turno?.id || !perfil?.sucursal_id) return;
    const sucursalId = perfil.sucursal_id;
    const turnoId = turno.id;
    const channelName = `mapa-despachos-${turnoId}-${sucursalId}`;

    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos" },
        (payload) => {
          if (payload.new.sucursal_id === sucursalId && payload.new.tipo === "despacho") {
            cargarPedidos();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos" },
        (payload) => {
          if (payload.new.sucursal_id === sucursalId) {
            cargarPedidos();
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "turno_despachadores", filter: `turno_id=eq.${turnoId}` },
        () => cargarDespachadores(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "turno_despachadores", filter: `turno_id=eq.${turnoId}` },
        () => cargarDespachadores(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [turno?.id, perfil?.sucursal_id, cargarPedidos, cargarDespachadores]);

  // ── Polling de respaldo cada 15 s (cubre pérdidas de Realtime por navegación) ──

  useEffect(() => {
    if (!turno?.id || !perfil?.sucursal_id) return;
    const interval = setInterval(() => cargarPedidos(), 15_000);
    return () => clearInterval(interval);
  }, [turno?.id, perfil?.sucursal_id, cargarPedidos]);

  // ── Asignación ─────────────────────────────────────────────────────────────

  const handleClickDespachador = (d: Despachador) => {
    if (selectedIds.size === 0) { toast.error("Seleccioná al menos un pedido primero"); return; }
    const nombre = d.nombre_completo ?? `${d.nombre} ${d.apellido ?? ""}`.trim();
    setConfirmacion({ despachadorId: d.id, nombre });
  };

  const confirmarAsignacion = async () => {
    if (!confirmacion) return;
    setAsignando(true);
    const ids = Array.from(selectedIds);

    // Pedidos en preparacion o listos → asignar + avanzar estado a en_despacho
    // Pedidos ya en en_despacho → solo actualizar el despachador, sin tocar el estado
    const [res1, res2] = await Promise.all([
      supabase
        .from("pedidos")
        .update({ despachador_id: confirmacion.despachadorId, estado: "en_despacho" })
        .in("id", ids)
        .in("estado", ["en_preparacion", "listo"]),
      supabase
        .from("pedidos")
        .update({ despachador_id: confirmacion.despachadorId })
        .in("id", ids)
        .eq("estado", "en_despacho"),
    ]);

    setAsignando(false);
    setConfirmacion(null);

    const err = res1.error ?? res2.error;
    if (err) { toast.error("Error al asignar: " + err.message); return; }

    const n = ids.length;
    toast.success(`${n} pedido${n > 1 ? "s" : ""} asignado${n > 1 ? "s" : ""} a ${confirmacion.nombre}`);
    setSelectedIds(new Set());
    cargarPedidos();
  };

  // ── Checkboxes ────────────────────────────────────────────────────────────

  const toggleSelect = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // ── Derivados ─────────────────────────────────────────────────────────────

  const fmtMonto = (n: number) =>
    `$${n.toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;

  const sinAsignar = useMemo(() => {
    const list = pedidos.filter((p) => !p.despachador_id && p.estado !== "entregado");
    return [...list].sort((a, b) => (a.numero_pedido ?? 0) - (b.numero_pedido ?? 0));
  }, [pedidos]);

  const asignados = useMemo(() => {
    let list = pedidos.filter((p) => !!p.despachador_id && p.estado !== "entregado");
    if (filtroDespachador) list = list.filter((p) => p.despachador_id === filtroDespachador);
    return [...list].sort((a, b) => (a.numero_pedido ?? 0) - (b.numero_pedido ?? 0));
  }, [pedidos, filtroDespachador]);

  /** Visible en la lista (respeta filtro de despachador). */
  const pedidosVisibles = useMemo(
    () => (filtroDespachador ? asignados : [...sinAsignar, ...asignados]),
    [filtroDespachador, sinAsignar, asignados],
  );

  const todosSeleccionados =
    pedidosVisibles.length > 0 && pedidosVisibles.every((p) => selectedIds.has(p.id));

  const toggleSelectAll = () =>
    setSelectedIds(todosSeleccionados ? new Set() : new Set(pedidosVisibles.map((p) => p.id)));

  const despachadorNombre = (id: string | null) => {
    if (!id) return null;
    const d = despachadores.find((x) => x.id === id);
    return d ? (d.nombre_completo ?? `${d.nombre} ${d.apellido ?? ""}`.trim()) : null;
  };

  const pedidosPorDespachador = (id: string) =>
    pedidos.filter((p) => p.despachador_id === id && p.estado !== "entregado").length;

  const renderPedidoItem = (p: PedidoDespacho, opts?: { mostrarDespachador?: boolean }) => {
    const dNombre = despachadorNombre(p.despachador_id);
    const focused = p.id === focusedId;
    const selected = selectedIds.has(p.id);
    const colorEstado = COLORES[p.estado] ?? "#6B7280";
    const { texto: tiempo, alerta } = tiempoTranscurrido(p.updated_at);
    const estadoLabel = (ETIQUETAS[p.estado] ?? p.estado).toUpperCase();

    return (
      <div
        key={p.id}
        ref={(el) => {
          if (el) itemRefs.current.set(p.id, el);
          else itemRefs.current.delete(p.id);
        }}
        className={`flex gap-2 px-3 py-2.5 cursor-pointer transition-colors select-none ${
          focused ? "bg-primary/10 border-l-2 border-primary" : "hover:bg-secondary/30"
        }`}
        onClick={() => focusPedido(p)}
      >
        <div className="pt-0.5 shrink-0" onClick={(e) => toggleSelect(p.id, e)}>
          <Checkbox checked={selected} className="h-3.5 w-3.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-1">
            <div className="flex items-baseline gap-1 flex-wrap min-w-0">
              <span className="text-xs font-bold shrink-0" style={{ color: colorEstado }}>
                #{p.numero_pedido ?? "—"}
              </span>
              <span className="text-xs text-foreground truncate">{p.cliente_nombre}</span>
              <span className="text-xs font-mono text-muted-foreground shrink-0">
                - {fmtMonto(p.total)}
              </span>
            </div>
            {tiempo && (
              <span
                className="text-[10px] font-medium shrink-0"
                style={{ color: alerta ? "#EF4444" : "#9CA3AF" }}
              >
                {tiempo}
              </span>
            )}
          </div>
          {opts?.mostrarDespachador && (
            <div className="mt-0.5 space-y-0.5">
              {dNombre && (
                <p className="text-[10px] font-semibold uppercase tracking-wide text-foreground truncate pl-0.5">
                  → {dNombre}
                </p>
              )}
              <span
                className="inline-block text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                style={{ color: colorEstado, backgroundColor: `${colorEstado}22` }}
              >
                {estadoLabel}
              </span>
            </div>
          )}
          {!opts?.mostrarDespachador && p.direccion_entrega && (
            <div className="flex items-start gap-1 mt-0.5">
              <MapPin className="h-2.5 w-2.5 mt-0.5 shrink-0 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground truncate leading-tight">
                {p.direccion_entrega}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Error ──────────────────────────────────────────────────────────────────

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] gap-3 text-muted-foreground">
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <p className="text-sm">{error}</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex min-h-[calc(100svh_-_7rem)] flex-col rounded-xl border border-border lg:h-[calc(100vh_-_120px)] lg:min-h-0 lg:flex-row lg:overflow-hidden">

        {/* ── MAPA 60% ──────────────────────────────────────────────────── */}
        <div className="relative min-h-[45svh] flex-[3] min-w-0 lg:min-h-0">
          {cargando && (
            <div className="absolute inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-20">
              <Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Cargando mapa…</span>
            </div>
          )}

          {/* Leyenda */}
          {!cargando && (
            <div className="absolute bottom-4 left-4 bg-background/95 backdrop-blur border border-border rounded-xl px-3 py-2.5 shadow z-10 space-y-1.5">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-1">Estado</p>
              {Object.entries(COLORES).map(([estado, color]) => (
                <div key={estado} className="flex items-center gap-2">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                  <span className="text-[11px] text-foreground">{ETIQUETAS[estado]}</span>
                </div>
              ))}
              <div className="flex items-center gap-2 border-t border-border pt-1.5">
                <span className="text-sm">🏠</span>
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 bg-green-500" />
                <span className="text-[11px] text-foreground">Tu sucursal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm">🏠</span>
                <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 bg-gray-400" />
                <span className="text-[11px] text-foreground">Otras sucursales</span>
              </div>
              {selectedIds.size > 0 && (
                <div className="flex items-center gap-2 border-t border-border pt-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0 border-2 border-dashed border-yellow-400" />
                  <span className="text-[11px] text-foreground">Seleccionado</span>
                </div>
              )}
            </div>
          )}

          {/* Indicador ruta activa */}
          {rutaActiva && (
            <div className="absolute top-4 left-4 z-10 bg-indigo-600/90 text-white text-xs rounded-lg px-3 py-1.5 shadow backdrop-blur flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full bg-white animate-pulse" />
              Ruta calculada
            </div>
          )}

          <div ref={mapRef} className="w-full h-full" />
        </div>

        {/* ── PEDIDOS 20% ───────────────────────────────────────────────── */}
        <div className="flex-1 min-h-72 border-t border-border flex flex-col bg-card min-w-0 lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="px-3 py-3 border-b border-border shrink-0 space-y-1.5">
            <div className="flex items-center justify-between">
              <h2 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
                Pedidos pendientes
              </h2>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                {pedidosVisibles.length}
              </Badge>
            </div>

            {pedidosVisibles.length > 0 && (
              <button
                onClick={toggleSelectAll}
                className="text-[10px] text-primary hover:underline flex items-center gap-1.5"
              >
                <Checkbox checked={todosSeleccionados} className="h-3.5 w-3.5" onCheckedChange={toggleSelectAll} />
                <span>{todosSeleccionados ? "Deseleccionar todos" : "Seleccionar todos"}</span>
              </button>
            )}

            {filtroDespachador && (
              <div className="flex items-center gap-1.5 bg-primary/10 rounded px-2 py-1">
                <span className="text-[10px] text-primary flex-1">Filtrado por despachador</span>
                <button onClick={() => setFiltroDespachador(null)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>

          <ScrollArea className="flex-1">
            {pedidosVisibles.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">Sin despachos pendientes</p>
            ) : (
              <div className="pb-2">
                {!filtroDespachador && (
                  <div>
                    <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 py-2 bg-card border-y border-border">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-destructive">
                        Sin asignar
                      </span>
                      <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px] bg-destructive/15 text-destructive border-destructive/40 hover:bg-destructive/15">
                        {sinAsignar.length}
                      </Badge>
                    </div>
                    {sinAsignar.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground px-3 py-3">Ninguno</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {sinAsignar.map((p) => renderPedidoItem(p))}
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <div className="sticky top-0 z-[1] flex items-center gap-2 px-3 py-2 bg-card border-y border-border">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Asignados
                    </span>
                    <Badge className="h-5 min-w-5 justify-center px-1.5 text-[10px] bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/15">
                      {asignados.length}
                    </Badge>
                  </div>
                  {asignados.length === 0 ? (
                    <p className="text-[10px] text-muted-foreground px-3 py-3">Ninguno</p>
                  ) : (
                    <div className="divide-y divide-border">
                      {asignados.map((p) => renderPedidoItem(p, { mostrarDespachador: true }))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </ScrollArea>

          {selectedIds.size > 0 && (
            <div className="px-3 py-2 border-t border-border bg-primary/5 shrink-0 text-center">
              <p className="text-[10px] text-primary font-medium">
                {selectedIds.size} seleccionado{selectedIds.size > 1 ? "s" : ""} — asigná a un despachador →
              </p>
            </div>
          )}
        </div>

        {/* ── DESPACHADORES 20% ─────────────────────────────────────────── */}
        <div className="flex-1 min-h-72 border-t border-border flex flex-col bg-card min-w-0 lg:min-h-0 lg:border-l lg:border-t-0">
          <div className="px-3 py-3 border-b border-border shrink-0">
            <h2 className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">
              Despachadores activos
            </h2>
          </div>

          <ScrollArea className="flex-1">
            {despachadores.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-10">Sin despachadores en turno</p>
            ) : (
              <div className="divide-y divide-border">
                {despachadores.map((d) => {
                  const count = pedidosPorDespachador(d.id);
                  const nombre = d.nombre_completo ?? `${d.nombre} ${d.apellido ?? ""}`.trim();
                  const filtrando = filtroDespachador === d.id;

                  return (
                    <div key={d.id} className="px-3 py-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary uppercase">{d.nombre[0]}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-foreground truncate">{nombre}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {count} pedido{count !== 1 ? "s" : ""} asignado{count !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          className={`h-6 text-[10px] px-2 flex-1 ${filtrando ? "bg-primary/10 border-primary/40 text-primary" : ""}`}
                          onClick={() => setFiltroDespachador(filtrando ? null : d.id)}
                        >
                          {filtrando ? "Ver todos" : "Ver pedidos"}
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 text-[10px] px-2 flex-1"
                          disabled={selectedIds.size === 0}
                          onClick={() => handleClickDespachador(d)}
                          title={selectedIds.size === 0 ? "Seleccioná pedidos primero" : `Asignar a ${nombre}`}
                        >
                          Asignar
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* ── Confirmación ──────────────────────────────────────────────────── */}
      <Dialog open={!!confirmacion} onOpenChange={(v) => !v && setConfirmacion(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar asignación</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Asignar{" "}
            <span className="font-semibold text-foreground">
              {selectedIds.size} pedido{selectedIds.size > 1 ? "s" : ""}
            </span>{" "}
            a{" "}
            <span className="font-semibold text-foreground">{confirmacion?.nombre}</span>?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmacion(null)} disabled={asignando}>
              Cancelar
            </Button>
            <Button onClick={confirmarAsignacion} disabled={asignando}>
              {asignando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
