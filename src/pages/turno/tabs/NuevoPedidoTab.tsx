import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Plus, Minus, Trash2, Search, Gift, Cake, KeyRound, Trophy, Sparkles, Clock, Store, Truck, Car, Bike, DoorOpen, Wine, Droplet, User, Briefcase, CreditCard, Save, CalendarClock, X, Banknote, Landmark, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Turno } from "../TurnoPage";
import { formatSaborExtra, normalizarTipoComanda } from "@/lib/printComanda";
import { imprimirAmbas } from "@/services/printer";
import { buildComandaCocinaItems, buildNotasClienteDeItem } from "@/lib/pedidoImpresion";
import { referenciaPagoTransferencia } from "@/lib/referenciaPago";
import { cn } from "@/lib/utils";
import { TIPO_META, type TipoPedido } from "@/lib/tiposPedido";
import mojitoImg from "@/assets/mojito.jpg";
import coladaImg from "@/assets/colada.jpg";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { loadGoogleMaps } from "@/lib/googleMaps";

interface Categoria { id: string; nombre: string; orden: number | null }
interface Producto {
  id: string; nombre: string; precio: number; activo: boolean | null;
  tiene_alcohol: boolean | null; categoria_id: string | null;
  imagen_url?: string | null;
  precioOriginal?: number;
  esPrecioEspecial?: boolean;
  esPrecioTrabajador?: boolean;
}
interface Sucursal { id: string; latitud: number | null; longitud: number | null; clave_canje: string | null }
type PromoTipo = "cumpleanos" | "canje" | "jarra_dorada" | "jarros_retornables";
interface SaborExtra { id: string; nombre: string; precio: number }
interface Linea {
  uid: string; producto: Producto; cantidad: number; notas?: string;
  esRegalo?: boolean; promoTipo?: PromoTipo; extras?: SaborExtra[];
  precioOriginal?: number; esPrecioEspecial?: boolean;
}
const PROMO_SABOR_PRECIO = 8000;

function calcularTragosGratisJarros(lineas: Linea[], seleccion: string[]) {
  const freeByUid = new Map<string, number>();
  let descuento = 0;
  for (const uid of seleccion) {
    if (!uid) continue;
    const l = lineas.find((x) => x.uid === uid);
    if (!l || l.esRegalo) continue;
    const yaFree = freeByUid.get(uid) ?? 0;
    if (yaFree >= l.cantidad) continue;
    // Solo precio base del producto — los extras ($1.000 c/u) se siguen cobrando
    const precioBase = l.producto.precio;
    freeByUid.set(uid, yaFree + 1);
    descuento += precioBase;
  }
  return { freeByUid, descuento };
}

const fmtCLP = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

function haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371, toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function calcCostoDespacho(km: number) {
  const base = 2000, tramo = 3.5, extra = 1000;
  if (km <= tramo) return base;
  return base + Math.ceil((km - tramo) / tramo) * extra;
}

type TarifaDespacho = { distancia_desde: number; distancia_hasta: number; precio: number; tramo: number };

function calcCostoDespachoTarifas(km: number, tarifas: TarifaDespacho[]): number {
  if (!tarifas.length) return calcCostoDespacho(km);
  const sorted = [...tarifas].sort((a, b) => a.tramo - b.tramo);
  const match = sorted.find((t) => km >= Number(t.distancia_desde) && km < Number(t.distancia_hasta));
  if (match) return match.precio;
  // Si supera el último tramo, usar el último tramo como precio base
  return sorted[sorted.length - 1]?.precio ?? calcCostoDespacho(km);
}

// Imagen fallback por nombre de categoría
function imagenCategoria(nombreCat: string | undefined): string {
  const n = (nombreCat ?? "").toLowerCase();
  if (n.includes("colada")) return coladaImg;
  return mojitoImg;
}

const TIPO_ORDER: TipoPedido[] = ["local", "delivery", "uber", "rappi", "puerta"];
const TIPO_ICON: Record<TipoPedido, typeof Store> = { local: Store, retiro: Store, delivery: Truck, despacho: Truck, uber: Car, rappi: Bike, puerta: DoorOpen };

export default function NuevoPedidoTab({ turno }: { turno: Turno }) {
  const { perfil } = useAuthStore();
  const sucursalNombre = useAuthStore((s) => s.sucursalNombre);

  const [productos, setProductos] = useState<Producto[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [sucursal, setSucursal] = useState<Sucursal | null>(null);
  const [loading, setLoading] = useState(true);
  const [promoSaborId, setPromoSaborId] = useState<string | null>(null);
  const [promosPrecio, setPromosPrecio] = useState<Array<{ producto_id: string; precio_promo: number; nombre: string | null }>>([]);
  const [preciosTrabajador, setPreciosTrabajador] = useState<Map<string, number>>(new Map());
  const [jarraDoradaDias, setJarraDoradaDias] = useState<string[]>(["lunes", "sabado"]);
  const [jarraDoradaUsada, setJarraDoradaUsada] = useState(false);
  const [saboresExtra, setSaboresExtra] = useState<SaborExtra[]>([]);
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editExtrasSel, setEditExtrasSel] = useState<Set<string>>(new Set());
  const [editNotas, setEditNotas] = useState("");
  const [highlightUid, setHighlightUid] = useState<string | null>(null);

  const [busqueda, setBusqueda] = useState("");
  const [filtroAlcohol, setFiltroAlcohol] = useState<"todos" | "alcohol" | "sin">("todos");
  const [filtroFamilia, setFiltroFamilia] = useState<"todos" | "mojito" | "colada">("todos");

  const [lineas, setLineas] = useState<Linea[]>([]);

  const [tipo, setTipo] = useState<TipoPedido>("delivery");
  const [clienteNombre, setClienteNombre] = useState("");
  const [clienteTelefono, setClienteTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [referencia, setReferencia] = useState("");
  const [latStr, setLatStr] = useState("");
  const [lonStr, setLonStr] = useState("");
  const [costoDespachoStr, setCostoDespachoStr] = useState<string>("0");
  const [direccionError, setDireccionError] = useState(false);
  const [descuento, setDescuento] = useState<string>("0");
  const [notas, setNotas] = useState("");
  const [horaAgendada, setHoraAgendada] = useState<string>(""); // datetime-local string
  const [saving, setSaving] = useState(false);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [tipoCliente, setTipoCliente] = useState<"cliente" | "trabajador">("cliente");
  const [jarrosDevueltos, setJarrosDevueltos] = useState<string>("0");
  const [tragosGratisSel, setTragosGratisSel] = useState<string[]>([]);
  const [esCumple, setEsCumple] = useState(false);
  const [cumpleVerif, setCumpleVerif] = useState("");
  const [cumpleTragoId, setCumpleTragoId] = useState<string>("");
  const [canjeOpen, setCanjeOpen] = useState(false);
  const [canjeCodigo, setCanjeCodigo] = useState("");
  const [canjeAprobado, setCanjeAprobado] = useState(false);
  const [canjeTragosIds, setCanjeTragosIds] = useState<string[]>([""]);
  const [jarraDoradaTragoId, setJarraDoradaTragoId] = useState<string>("");

  const [yaPago, setYaPago] = useState(false);
  const [metodoPagoEsperado, setMetodoPagoEsperado] = useState<"efectivo" | "transferencia" | "tarjeta" | null>(null);
  const [pagoMixtoEf, setPagoMixtoEf] = useState("");
  const [pagoMixtoTr, setPagoMixtoTr] = useState("");
  const [pagoMixtoTa, setPagoMixtoTa] = useState("");
  const [pagoMixtoTrRef, setPagoMixtoTrRef] = useState("");
  const pagoMixtoTrRefTouched = useRef(false);

  const [proximoPedido, setProximoPedido] = useState<number>(
    () => (turno.numero_ultimo_pedido ?? 0) + 1,
  );

  const refrescarProximoPedido = async () => {
    const { data } = await supabase
      .from("turnos")
      .select("numero_ultimo_pedido")
      .eq("id", turno.id)
      .single();
    const n = (data as { numero_ultimo_pedido: number | null } | null)?.numero_ultimo_pedido ?? 0;
    setProximoPedido(n + 1);
  };

  useEffect(() => {
    void refrescarProximoPedido();
    const ch = supabase
      .channel(`turno-num-pedido-${turno.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "turnos", filter: `id=eq.${turno.id}` },
        (payload) => {
          const n = (payload.new as { numero_ultimo_pedido?: number | null })?.numero_ultimo_pedido ?? 0;
          setProximoPedido(n + 1);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos", filter: `turno_id=eq.${turno.id}` },
        () => { void refrescarProximoPedido(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turno.id]);

  const tipoCfg = TIPO_META[tipo];
  const esExterno = tipoCfg.esExterno;

  useEffect(() => {
    (async () => {
      const [pRes, cRes, sRes, promoRes, jarraRes, sxRes, preciosRes, ptRes] = await Promise.all([
        supabase.from("productos").select("*").eq("activo", true).order("nombre"),
        supabase.from("categorias").select("*").order("orden"),
        supabase.from("sucursales").select("id,latitud,longitud,clave_canje").eq("id", turno.sucursal_id).maybeSingle(),
        supabase.from("promociones").select("producto_id").eq("tipo", "sabor_del_dia").eq("activo", true).maybeSingle(),
        supabase.from("promociones").select("dias_activos").eq("tipo", "jarra_dorada").maybeSingle(),
        supabase.from("sabores_extra").select("id,nombre,precio").eq("activo", true).order("nombre"),
        supabase.from("promociones_precio").select("producto_id,precio_promo,nombre").eq("activo", true),
        supabase.from("precios_trabajador").select("producto_id, precio_trabajador").eq("activo", true),
      ]);
      setProductos((pRes.data as Producto[]) ?? []);
      setCategorias((cRes.data as Categoria[]) ?? []);
      setSucursal((sRes.data as Sucursal | null) ?? null);
      setPromoSaborId((promoRes.data as { producto_id: string } | null)?.producto_id ?? null);
      const jarraData = (jarraRes.data as { dias_activos: string[] | null } | null);
      if (jarraData?.dias_activos && jarraData.dias_activos.length > 0) {
        setJarraDoradaDias(jarraData.dias_activos);
      }
      setSaboresExtra((sxRes.data as SaborExtra[]) ?? []);
      setPromosPrecio((preciosRes.data as Array<{ producto_id: string; precio_promo: number; nombre: string | null }>) ?? []);
      const ptMap = new Map<string, number>();
      for (const row of (ptRes.data as Array<{ producto_id: string; precio_trabajador: number }> | null) ?? []) {
        ptMap.set(row.producto_id, Number(row.precio_trabajador));
      }
      setPreciosTrabajador(ptMap);
      const { data: jd } = await supabase
        .from("pedidos").select("id").eq("turno_id", turno.id).eq("es_jarra_dorada", true).limit(1);
      setJarraDoradaUsada((jd ?? []).length > 0);
      setLoading(false);
    })();
  }, [turno.sucursal_id, turno.id]);

  // Realtime: refrescar catálogo y promo cuando cambien
  useEffect(() => {
    const refetch = async () => {
      const [pRes, promoRes, jarraRes, preciosRes, ptRes] = await Promise.all([
        supabase.from("productos").select("*").eq("activo", true).order("nombre"),
        supabase.from("promociones").select("producto_id,activo").eq("tipo", "sabor_del_dia").maybeSingle(),
        supabase.from("promociones").select("dias_activos").eq("tipo", "jarra_dorada").maybeSingle(),
        supabase.from("promociones_precio").select("producto_id,precio_promo,nombre").eq("activo", true),
        supabase.from("precios_trabajador").select("producto_id, precio_trabajador").eq("activo", true),
      ]);
      setProductos((pRes.data as Producto[]) ?? []);
      const pr = promoRes.data as { producto_id: string; activo: boolean | null } | null;
      setPromoSaborId(pr?.activo ? pr.producto_id : null);
      const jarraData = (jarraRes.data as { dias_activos: string[] | null } | null);
      if (jarraData?.dias_activos && jarraData.dias_activos.length > 0) {
        setJarraDoradaDias(jarraData.dias_activos);
      }
      setPromosPrecio((preciosRes.data as Array<{ producto_id: string; precio_promo: number; nombre: string | null }>) ?? []);
      const ptMap = new Map<string, number>();
      for (const row of (ptRes.data as Array<{ producto_id: string; precio_trabajador: number }> | null) ?? []) {
        ptMap.set(row.producto_id, Number(row.precio_trabajador));
      }
      setPreciosTrabajador(ptMap);
    };
    const ch = supabase
      .channel("promo-sabor-dia")
      .on("postgres_changes", { event: "*", schema: "public", table: "promociones" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "promociones_precio" }, refetch)
      .on("postgres_changes", { event: "*", schema: "public", table: "precios_trabajador" }, refetch)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "productos" }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const catById = useMemo(() => new Map(categorias.map((c) => [c.id, c])), [categorias]);

  const promosPrecioMap = useMemo(() => {
    const m = new Map<string, { precio_promo: number; nombre: string | null }>();
    for (const pr of promosPrecio) m.set(pr.producto_id, pr);
    return m;
  }, [promosPrecio]);

  const aplicarPrecioProducto = useCallback((p: Producto): Producto => {
    const catalogo = productos.find((x) => x.id === p.id)?.precio ?? p.precio;
    if (!esExterno && tipoCliente === "trabajador") {
      const pt = preciosTrabajador.get(p.id);
      if (pt != null) {
        return {
          ...p,
          precio: pt,
          precioOriginal: catalogo,
          esPrecioEspecial: true,
          esPrecioTrabajador: true,
        };
      }
    }
    if (p.id === promoSaborId) {
      return { ...p, precio: PROMO_SABOR_PRECIO, precioOriginal: catalogo, esPrecioEspecial: true, esPrecioTrabajador: false };
    }
    const pp = promosPrecioMap.get(p.id);
    if (pp) {
      return {
        ...p,
        precio: pp.precio_promo,
        precioOriginal: catalogo,
        esPrecioEspecial: true,
        esPrecioTrabajador: false,
      };
    }
    return { ...p, precio: catalogo, precioOriginal: undefined, esPrecioEspecial: false, esPrecioTrabajador: false };
  }, [esExterno, tipoCliente, preciosTrabajador, productos, promoSaborId, promosPrecioMap]);

  const productosConPromo = useMemo(
    () => productos.map((p) => aplicarPrecioProducto(p)),
    [productos, aplicarPrecioProducto],
  );

  // Recalcular precios del carrito al cambiar Cliente/Trabajador
  useEffect(() => {
    setLineas((prev) => {
      let changed = false;
      const next = prev.map((l) => {
        if (l.esRegalo) return l;
        const base = productos.find((p) => p.id === l.producto.id);
        if (!base) return l;
        const priced = aplicarPrecioProducto(base);
        if (
          priced.precio === l.producto.precio &&
          priced.precioOriginal === l.precioOriginal &&
          !!priced.esPrecioTrabajador === !!l.producto.esPrecioTrabajador
        ) {
          return l;
        }
        changed = true;
        return {
          ...l,
          producto: { ...l.producto, ...priced },
          precioOriginal: priced.precioOriginal,
          esPrecioEspecial: priced.esPrecioEspecial,
        };
      });
      return changed ? next : prev;
    });
  }, [tipoCliente, aplicarPrecioProducto, productos]);

  const productosFiltrados = useMemo(() => {
    return productosConPromo.filter((p) => {
      if (busqueda && !p.nombre.toLowerCase().includes(busqueda.toLowerCase())) return false;
      if (filtroAlcohol === "alcohol" && p.tiene_alcohol === false) return false;
      if (filtroAlcohol === "sin" && p.tiene_alcohol !== false) return false;
      const catNom = (catById.get(p.categoria_id ?? "")?.nombre ?? "").toLowerCase();
      if (filtroFamilia === "mojito" && !catNom.includes("mojito")) return false;
      if (filtroFamilia === "colada" && !catNom.includes("colada")) return false;
      return true;
    });
  }, [productosConPromo, busqueda, filtroAlcohol, filtroFamilia, catById]);

  const DOW_TO_DIA = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
  const hoyDow = new Date().getDay();
  const hoyDia = DOW_TO_DIA[hoyDow];
  const jarraDoradaDisponible =
    !esExterno && !jarraDoradaUsada && jarraDoradaDias.includes(hoyDia) && tipo === "delivery";

  const abrirProducto = (p: Producto) => {
    agregarLinea(p, []);
  };
  const agregarLinea = (p: Producto, extras: SaborExtra[]) => {
    let highlight: string | null = null;
    setLineas((prev) => {
      const sig = (e: SaborExtra[]) => e.map((x) => x.id).sort().join(",");
      const target = sig(extras);
      const i = prev.findIndex((l) => !l.esRegalo && l.producto.id === p.id && sig(l.extras ?? []) === target);
      if (i >= 0) {
        highlight = prev[i].uid;
        const n = [...prev];
        n[i] = { ...n[i], cantidad: n[i].cantidad + 1 };
        return n;
      }
      highlight = `${p.id}-${Date.now()}-${Math.random()}`;
      return [...prev, {
        uid: highlight,
        producto: p,
        cantidad: 1,
        extras,
        ...(p.esPrecioEspecial && p.precioOriginal != null
          ? { precioOriginal: p.precioOriginal, esPrecioEspecial: true }
          : {}),
      }];
    });
    if (highlight) {
      setHighlightUid(highlight);
      window.setTimeout(() => setHighlightUid(null), 1000);
    }
  };
  const precioLinea = (l: Linea) => l.esRegalo ? 0 : l.producto.precio + (l.extras?.reduce((a, e) => a + e.precio, 0) ?? 0);
  const abrirEdicion = (l: Linea) => {
    if (l.esRegalo) return;
    setEditingUid(l.uid);
    setEditExtrasSel(new Set(l.extras?.map((e) => e.id) ?? []));
    setEditNotas(l.notas ?? "");
  };
  const toggleEditExtra = (id: string) => {
    setEditExtrasSel((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const guardarEdicionLinea = (uid: string) => {
    const extras = saboresExtra.filter((s) => editExtrasSel.has(s.id));
    setLineas((prev) => prev.map((l) => {
      if (l.uid !== uid) return l;
      return { ...l, extras, notas: editNotas.trim() || undefined };
    }));
    setEditingUid(null);
    setEditExtrasSel(new Set());
    setEditNotas("");
  };
  const cambiarCant = (uid: string, delta: number) => {
    setLineas((prev) => prev.map((l) => l.uid === uid ? { ...l, cantidad: l.cantidad + delta } : l).filter((l) => l.cantidad > 0));
  };
  const quitar = (uid: string) => setLineas((prev) => prev.filter((l) => l.uid !== uid));

  const subtotalCobrado = useMemo(
    () => lineas.reduce((acc, l) => acc + precioLinea(l) * l.cantidad, 0),
    [lineas],
  );

  const subtotalNormal = useMemo(() => {
    return lineas.reduce((acc, l) => {
      if (l.esRegalo) return acc;
      const catalogo = productos.find((p) => p.id === l.producto.id)?.precio
        ?? l.precioOriginal
        ?? l.producto.precio;
      const extras = l.extras?.reduce((a, e) => a + e.precio, 0) ?? 0;
      return acc + (catalogo + extras) * l.cantidad;
    }, 0);
  }, [lineas, productos]);

  const descuentoTrabajador = !esExterno && tipoCliente === "trabajador"
    ? Math.max(0, subtotalNormal - subtotalCobrado)
    : 0;

  // Pedido: subtotal a precio de lista; descuento incluye ahorro trabajador + jarros
  const subtotal = !esExterno && tipoCliente === "trabajador" ? subtotalNormal : subtotalCobrado;

  const [distanciaApi, setDistanciaApi] = useState<number | null>(null);
  const [tarifasDespacho, setTarifasDespacho] = useState<TarifaDespacho[]>([]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("tarifas_despacho" as any)
        .select("tramo, distancia_desde, distancia_hasta, precio")
        .order("tramo");
      if (data) setTarifasDespacho(data as unknown as TarifaDespacho[]);
    })();
  }, []);

  // Distancia real de manejo vía Google Distance Matrix
  useEffect(() => {
    if (tipo !== "delivery") { setDistanciaApi(null); return; }
    const lat = parseFloat(latStr), lon = parseFloat(lonStr);
    if (!sucursal?.latitud || !sucursal?.longitud || Number.isNaN(lat) || Number.isNaN(lon)) {
      setDistanciaApi(null); return;
    }
    let cancelled = false;
    (async () => {
      try {
        const g: any = await loadGoogleMaps();
        const svc = new g.maps.DistanceMatrixService();
        svc.getDistanceMatrix(
          {
            origins: [{ lat: Number(sucursal.latitud), lng: Number(sucursal.longitud) }],
            destinations: [{ lat, lng: lon }],
            travelMode: g.maps.TravelMode.DRIVING,
          },
          (res: any, status: string) => {
            if (cancelled) return;
            if (status === "OK" && res?.rows?.[0]?.elements?.[0]?.status === "OK") {
              setDistanciaApi(res.rows[0].elements[0].distance.value / 1000);
            }
          }
        );
      } catch (e) {
        console.error("[distance matrix]", e);
      }
    })();
    return () => { cancelled = true; };
  }, [tipo, latStr, lonStr, sucursal]);

  const distanciaKm = useMemo(() => {
    if (tipo !== "delivery") return 0;
    if (distanciaApi != null) return distanciaApi;
    const lat = parseFloat(latStr), lon = parseFloat(lonStr);
    if (!sucursal?.latitud || !sucursal?.longitud || Number.isNaN(lat) || Number.isNaN(lon)) return 0;
    return haversine(Number(sucursal.latitud), Number(sucursal.longitud), lat, lon);
  }, [tipo, latStr, lonStr, sucursal, distanciaApi]);

  const costoDespachoCalc = useMemo(() => {
    if (tipo !== "delivery" || !distanciaKm) return 0;
    return calcCostoDespachoTarifas(distanciaKm, tarifasDespacho);
  }, [tipo, distanciaKm, tarifasDespacho]);

  useEffect(() => {
    if (tipo === "delivery" && costoDespachoCalc > 0) setCostoDespachoStr(String(costoDespachoCalc));
  }, [costoDespachoCalc, tipo]);

  const costoDespacho = tipo === "delivery" ? Math.max(0, parseInt(costoDespachoStr || "0", 10) || 0) : 0;

  const jarrosNum = esExterno ? 0 : Math.max(0, parseInt(jarrosDevueltos || "0", 10) || 0);
  const tragosGratisJarros = Math.floor(jarrosNum / 4);
  const jarrosSobrantes = jarrosNum % 4;
  const descuentoJarrosSobrantes = jarrosSobrantes * 1000;
  const tragosGratisInfo = useMemo(() => calcularTragosGratisJarros(lineas, tragosGratisSel), [lineas, tragosGratisSel]);
  const descuentoJarrosTragos = tragosGratisInfo.descuento;
  const tragosGratisAplicados = Array.from(tragosGratisInfo.freeByUid.values()).reduce((a, b) => a + b, 0);

  const desc = esExterno
    ? 0
    : (parseInt(descuento || "0", 10) || 0) + descuentoJarrosSobrantes + descuentoJarrosTragos + descuentoTrabajador;
  const total = Math.max(0, subtotal - desc + costoDespacho);

  const pagoYaEf = parseInt(pagoMixtoEf || "0", 10) || 0;
  const pagoYaTr = parseInt(pagoMixtoTr || "0", 10) || 0;
  const pagoYaTa = parseInt(pagoMixtoTa || "0", 10) || 0;
  const totalIngresadoYaPago = pagoYaEf + pagoYaTr + pagoYaTa;
  const diffYaPago = totalIngresadoYaPago - total;
  const pagoYaCuadra = !yaPago || esExterno || (totalIngresadoYaPago > 0 && totalIngresadoYaPago >= total);

  // Sincronizar largo de selección con cantidad de tragos gratis derivada de jarros
  useEffect(() => {
    setTragosGratisSel((prev) => {
      if (prev.length === tragosGratisJarros) return prev;
      const arr = prev.slice(0, tragosGratisJarros);
      while (arr.length < tragosGratisJarros) arr.push("");
      return arr;
    });
  }, [tragosGratisJarros]);

  // Invalidar selecciones cuyo uid ya no exista en líneas pagas
  useEffect(() => {
    setTragosGratisSel((prev) => {
      const next = prev.map((uid) => {
        if (!uid) return "";
        const l = lineas.find((x) => x.uid === uid);
        return l && !l.esRegalo && l.cantidad > 0 ? uid : "";
      });
      return next.every((v, i) => v === prev[i]) ? prev : next;
    });
  }, [lineas]);

  const limpiar = () => {
    setLineas([]); setClienteNombre(""); setClienteTelefono("");
    setEditingUid(null); setEditExtrasSel(new Set()); setEditNotas("");
    setDireccion(""); setReferencia(""); setLatStr(""); setLonStr("");
    setCostoDespachoStr("0"); setDireccionError(false);
    setDescuento("0"); setNotas(""); setHoraAgendada("");
    setJarrosDevueltos("0");
    setTragosGratisSel([]);
    setEsCumple(false); setCumpleVerif(""); setCumpleTragoId("");
    setCanjeAprobado(false); setCanjeCodigo(""); setCanjeTragosIds([""]);
    setJarraDoradaTragoId("");
    setYaPago(false);
    setMetodoPagoEsperado(null);
    pagoMixtoTrRefTouched.current = false;
    setPagoMixtoEf(""); setPagoMixtoTr(""); setPagoMixtoTa(""); setPagoMixtoTrRef("");
  };

  const addRegalo = (productoId: string, promoTipo: PromoTipo, slot = 0) => {
    const p = productosConPromo.find((x) => x.id === productoId);
    if (!p) return;
    const uid = `regalo-${promoTipo}-${slot}`;
    setLineas((prev) => {
      const sin = prev.filter((l) => l.uid !== uid);
      return [...sin, { uid, producto: { ...p, precio: 0 }, cantidad: 1, esRegalo: true, promoTipo }];
    });
  };
  const removeRegalo = (promoTipo: PromoTipo) => setLineas((prev) => prev.filter((l) => l.promoTipo !== promoTipo));

  useEffect(() => {
    if (esExterno) { removeRegalo("cumpleanos"); removeRegalo("canje"); removeRegalo("jarra_dorada"); setYaPago(false); setMetodoPagoEsperado(null); return; }
    if (esCumple && cumpleTragoId) addRegalo(cumpleTragoId, "cumpleanos");
    else removeRegalo("cumpleanos");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCumple, cumpleTragoId, esExterno]);
  useEffect(() => {
    if (esExterno) return;
    removeRegalo("canje");
    if (canjeAprobado) canjeTragosIds.forEach((id, i) => { if (id) addRegalo(id, "canje", i); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canjeAprobado, canjeTragosIds.join("|"), esExterno]);
  useEffect(() => {
    if (esExterno) return;
    if (jarraDoradaTragoId) addRegalo(jarraDoradaTragoId, "jarra_dorada");
    else removeRegalo("jarra_dorada");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jarraDoradaTragoId, esExterno]);

  const verificarCanje = () => {
    if (!sucursal?.clave_canje) { toast.error("La sucursal no tiene clave configurada"); return; }
    if (canjeCodigo.trim() === sucursal.clave_canje) {
      setCanjeAprobado(true); setCanjeOpen(false); toast.success("Código aprobado");
    } else { toast.error("Código incorrecto"); }
  };

  const guardar = async () => {
    if (!perfil) return;
    if (lineas.length === 0) { toast.error("Agregá al menos un producto"); return; }
    if (!clienteNombre.trim()) { toast.error("Ingresá el nombre del cliente"); return; }
    if (tipo === "delivery" && !direccion.trim()) {
      setDireccionError(true); toast.error("Ingresá la dirección de entrega"); return;
    }
    setDireccionError(false);
    if (!esExterno && esCumple && !cumpleTragoId) { toast.error("Elegí el trago de cumpleaños"); return; }
    if (!esExterno && esCumple && !cumpleVerif.trim()) { toast.error("Ingresá RUT o nombre para verificar cumpleaños"); return; }
    if (!esExterno && tragosGratisJarros > 0 && tragosGratisSel.some((s) => !s)) {
      toast.error("Elegí qué trago(s) van gratis por los jarros devueltos");
      return;
    }
    if (!esExterno && yaPago) {
      if (totalIngresadoYaPago <= 0) { toast.error("Ingresá al menos un monto de pago"); return; }
      if (totalIngresadoYaPago < total) { toast.error(`Falta ${fmtCLP(total - totalIngresadoYaPago)}`); return; }
    }
    setSaving(true);
    try {
      const horaAgendadaIso = horaAgendada ? new Date(horaAgendada).toISOString() : null;

      let metodoPagoFinal: "efectivo" | "transferencia" | "tarjeta" | "mixto" | null = null;
      let referenciaPagoFinal: string | null = null;

      if (!esExterno && yaPago) {
        metodoPagoFinal =
          pagoYaEf > 0 && pagoYaTr === 0 && pagoYaTa === 0 ? "efectivo"
          : pagoYaTr > 0 && pagoYaEf === 0 && pagoYaTa === 0 ? "transferencia"
          : pagoYaTa > 0 && pagoYaEf === 0 && pagoYaTr === 0 ? "tarjeta"
          : "mixto";
        referenciaPagoFinal = pagoYaTr > 0 ? (pagoMixtoTrRef.trim() || null) : null;
      } else if (!esExterno && metodoPagoEsperado) {
        metodoPagoFinal = metodoPagoEsperado;
      }

      const payload = {
        turno_id: turno.id,
        sucursal_id: turno.sucursal_id,
        tomador_id: perfil.id,
        cliente_nombre: clienteNombre.trim(),
        cliente_telefono: esExterno ? null : (clienteTelefono.trim() || null),
        tipo: tipo === "delivery" ? "despacho" : tipo,
        direccion_entrega: tipo === "delivery" ? direccion.trim() : null,
        referencia_entrega: tipo === "delivery" ? referencia.trim() || null : null,
        latitud_entrega: tipo === "delivery" && latStr ? parseFloat(latStr) : null,
        longitud_entrega: tipo === "delivery" && lonStr ? parseFloat(lonStr) : null,
        distancia_km: tipo === "delivery" && distanciaKm ? Number(distanciaKm.toFixed(2)) : null,
        subtotal,
        descuento: desc,
        costo_despacho: costoDespacho,
        total,
        metodo_pago: metodoPagoFinal,
        referencia_pago: referenciaPagoFinal,
        pago_registrado: !esExterno && yaPago,
        hora_agendada: horaAgendadaIso,
        notas: [
          notas.trim() || null,
          horaAgendadaIso ? `[AGENDADO] ${new Date(horaAgendada).toLocaleString("es-CL")}` : null,
          esExterno ? `[${tipo.toUpperCase()}] Pedido externo (sin pago propio)` : null,
          !esExterno && esCumple ? `[CUMPLEAÑOS] ${cumpleVerif.trim()}` : null,
          !esExterno && jarrosNum > 0 ? `[JARROS DEVUELTOS] ${jarrosNum}` : null,
          tipoCliente === "trabajador" ? "[TRABAJADOR]" : null,
        ].filter(Boolean).join("\n") || null,
        es_jarra_dorada: !esExterno && !!jarraDoradaTragoId,
        jarros_prometidos: !esExterno ? jarrosNum : 0,
        jarros_entregados: !esExterno ? jarrosNum : 0,
        promo_tipo: (!esExterno && tipoCliente === "trabajador"
          ? "trabajador"
          : !esExterno && jarraDoradaTragoId
          ? "jarra_dorada"
          : !esExterno && esCumple
          ? "cumpleanos"
          : !esExterno && canjeAprobado
          ? "canje"
          : null) as "trabajador" | "jarra_dorada" | "cumpleanos" | "canje" | null,
        estado: "en_preparacion",
      };
      const { data: pedido, error } = await supabase.from("pedidos").insert(payload).select().single();
      if (error) throw error;

      if (!esExterno) {
        const necesitaRefAuto =
          (yaPago && pagoYaTr > 0 && !pagoMixtoTrRef.trim()) ||
          (!yaPago && metodoPagoEsperado === "transferencia" && !referenciaPagoFinal);
        if (necesitaRefAuto) {
          const autoRef = referenciaPagoTransferencia(pedido.numero_pedido);
          if (autoRef) {
            referenciaPagoFinal = autoRef;
            await supabase.from("pedidos").update({ referencia_pago: autoRef }).eq("id", pedido.id);
          }
        }
      }

      const items: Array<{
        pedido_id: string;
        producto_id: string;
        cantidad: number;
        precio_unitario: number;
        subtotal: number;
        descuento_item?: number | null;
        notas: string | null;
      }> = [];
      for (const l of lineas) {
        const pu = precioLinea(l);
        const notasCliente = buildNotasClienteDeItem({ extras: l.extras, notas: l.notas });
        const partesPromo: string[] = [];
        if (l.promoTipo) partesPromo.push(`[PROMO ${l.promoTipo.toUpperCase()}]`);
        if (l.esPrecioEspecial && l.precioOriginal != null) partesPromo.push(`[PROMO_PRECIO:${l.precioOriginal}]`);
        if (l.producto.esPrecioTrabajador) partesPromo.push("[PRECIO TRABAJADOR]");
        const notasPromoPagado = partesPromo.length > 0 ? partesPromo.join(" | ") : null;
        const free = l.esRegalo ? 0 : (tragosGratisInfo.freeByUid.get(l.uid) ?? 0);
        const paidQty = l.cantidad - free;
        if (paidQty > 0) {
          items.push({
            pedido_id: pedido.id,
            producto_id: l.producto.id,
            cantidad: paidQty,
            precio_unitario: pu,
            subtotal: pu * paidQty,
            notas: [notasPromoPagado, notasCliente].filter(Boolean).join(" | ") || null,
          });
        }
        if (free > 0) {
          // Unidad “gratis” por jarros: precio = solo extras (el base va en pedidos.descuento)
          const extrasPrecio = l.extras?.reduce((a, e) => a + e.precio, 0) ?? 0;
          items.push({
            pedido_id: pedido.id,
            producto_id: l.producto.id,
            cantidad: free,
            precio_unitario: extrasPrecio,
            subtotal: extrasPrecio * free,
            descuento_item: l.producto.precio * free,
            notas: [notasCliente, "[PROMO JARROS]"].filter(Boolean).join(" | ") || "[PROMO JARROS]",
          });
        }
      }
      const { error: errIt } = await supabase.from("pedido_items").insert(items);
      if (errIt) throw errIt;

      if (!esExterno && yaPago && metodoPagoFinal) {
        const pagosInsert: Array<{
          turno_id: string;
          pedido_id: string;
          metodo: "efectivo" | "transferencia" | "tarjeta";
          monto: number;
          referencia: string | null;
        }> = [];
        if (pagoYaEf > 0) {
          pagosInsert.push({ turno_id: turno.id, pedido_id: pedido.id, metodo: "efectivo", monto: pagoYaEf, referencia: null });
        }
        if (pagoYaTr > 0) {
          pagosInsert.push({
            turno_id: turno.id,
            pedido_id: pedido.id,
            metodo: "transferencia",
            monto: pagoYaTr,
            referencia: referenciaPagoFinal,
          });
        }
        if (pagoYaTa > 0) {
          pagosInsert.push({
            turno_id: turno.id,
            pedido_id: pedido.id,
            metodo: "tarjeta",
            monto: pagoYaTa,
            referencia: null,
          });
        }

        if (pagosInsert.length > 0) {
          await supabase.from("pagos_turno").delete().eq("pedido_id", pedido.id);
          const { error: pagErr } = await supabase.from("pagos_turno").insert(pagosInsert);
          if (pagErr) throw pagErr;
        }

        // Asegurar sincronización pedidos ↔ pagos_turno
        const { error: syncErr } = await supabase
          .from("pedidos")
          .update({
            metodo_pago: metodoPagoFinal,
            referencia_pago: referenciaPagoFinal,
            pago_registrado: true,
          })
          .eq("id", pedido.id);
        if (syncErr) throw syncErr;
      }

      toast.success(`Pedido #${pedido.numero_pedido} creado${yaPago ? " · Pago registrado" : ""}`);
      setProximoPedido((pedido.numero_pedido ?? proximoPedido) + 1);
      void refrescarProximoPedido();

      const promoLabel = !esExterno && tipoCliente === "trabajador" ? "PRECIO TRABAJADOR"
        : !esExterno && jarraDoradaTragoId ? "Promo: Jarra dorada ⭐"
        : !esExterno && esCumple ? "Promo: Cumpleaños 🎂"
        : !esExterno && canjeAprobado ? "Promo: Canje 🎁"
        : !esExterno && tragosGratisAplicados > 0 ? `Promo: ${tragosGratisAplicados} trago(s) gratis x jarros 🏺`
        : null;
      const comandaItems = lineas.flatMap((l) => {
        const pu = l.producto.precio;
        const notasCliente = l.notas?.trim() || undefined;
        const free = l.esRegalo ? 0 : (tragosGratisInfo.freeByUid.get(l.uid) ?? 0);
        const paid = l.cantidad - free;
        const arr: Array<{
          cantidad: number;
          nombre: string;
          precio_unitario: number;
          extras?: { nombre: string; precio: number }[];
          esRegalo?: boolean;
          esPromoJarros?: boolean;
          notaPromo?: string;
          notas?: string;
          precioOriginal?: number;
        }> = [];
        if (paid > 0) {
          arr.push({
            cantidad: paid,
            nombre: l.producto.nombre,
            precio_unitario: pu,
            extras: l.extras?.map((e) => ({ nombre: formatSaborExtra(e.nombre), precio: e.precio })),
            notas: notasCliente,
            esRegalo: l.esRegalo,
            notaPromo: l.promoTipo ? `[PROMO ${l.promoTipo.toUpperCase()}]` : undefined,
            precioOriginal: l.esPrecioEspecial && l.precioOriginal != null ? l.precioOriginal : undefined,
          });
        }
        if (free > 0) {
          const extrasPrecio = l.extras?.reduce((a, e) => a + e.precio, 0) ?? 0;
          arr.push({
            cantidad: free,
            nombre: l.producto.nombre,
            precio_unitario: extrasPrecio,
            extras: l.extras?.map((e) => ({ nombre: formatSaborExtra(e.nombre), precio: e.precio })),
            notas: notasCliente,
            esRegalo: extrasPrecio === 0,
            esPromoJarros: true,
          });
        }
        return arr;
      });
      const tipoComanda = normalizarTipoComanda(tipo);
      const datosImpresion = {
        toma: {
          numero: pedido.numero_pedido,
          sucursalNombre: sucursalNombre ?? "",
          tipo: tipoComanda,
          cliente: clienteNombre.trim(),
          telefono: esExterno ? null : clienteTelefono.trim() || null,
          direccion: tipo === "delivery" ? direccion.trim() : null,
          referencia: tipo === "delivery" ? referencia.trim() || null : null,
          tomador: perfil.nombre_completo || perfil.nombre,
          items: comandaItems,
          subtotal, descuento: desc, costoDespacho, total,
          promoLabel,
          notas: [notas.trim() || null, horaAgendadaIso ? `Agendado para ${new Date(horaAgendada).toLocaleString("es-CL")}` : null].filter(Boolean).join(" · ") || null,
          metodoPago: metodoPagoFinal,
          pagoRegistrado: !esExterno && yaPago,
        },
        cocina: {
          numero: pedido.numero_pedido,
          sucursalNombre: sucursalNombre ?? "",
          tipo: normalizarTipoComanda(tipo),
          cliente: clienteNombre.trim(),
          telefono: esExterno ? null : clienteTelefono.trim() || null,
          direccion: tipo === "delivery" ? direccion.trim() || null : null,
          referencia: tipo === "delivery" ? referencia.trim() || null : null,
          items: buildComandaCocinaItems(comandaItems),
          notas: notas.trim() || null,
          total,
          subtotal,
          descuentoJarros: descuentoJarrosSobrantes + descuentoJarrosTragos,
          metodoPago: metodoPagoFinal,
          pagoRegistrado: !esExterno && yaPago,
        },
      };

      limpiar();

      imprimirAmbas(datosImpresion).catch((e) => {
        console.warn("No se pudo imprimir comandas:", e);
        toast.warning("Pedido creado, error al imprimir");
      });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "No se pudo crear el pedido");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-12 flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando catálogo…</div>;

  const totalItems = lineas.reduce((a, l) => a + l.cantidad, 0);
  const submit = () => { setTimeout(guardar, 0); };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4">
      {/* ───────── COLUMNA IZQUIERDA (60%) ───────── */}
      <div className="space-y-3">
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-4 py-3 text-center">
          <div className="font-display text-3xl sm:text-4xl font-extrabold text-primary tracking-wide">
            PEDIDO <span className="text-4xl sm:text-5xl">#{proximoPedido}</span>
          </div>
        </div>

        {/* FILA 1 — Datos del cliente + tipo pills */}
        <div className="bg-card border border-border rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-2">
            <Input value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Nombre Cliente" maxLength={100} className="bg-background h-11" />
            <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden h-11">
              <span className="flex items-center px-3 text-sm font-mono text-muted-foreground border-r border-input bg-muted/40">+56 9</span>
              <Input value={clienteTelefono} onChange={(e) => setClienteTelefono(e.target.value)} placeholder="Teléfono" maxLength={20} className="border-0 bg-transparent h-full focus-visible:ring-0 font-mono" />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {/* Cliente / Trabajador */}
            {([
              { v: "cliente", label: "Cliente", Icon: User },
              { v: "trabajador", label: "Trab.", Icon: Briefcase },
            ] as const).map(({ v, label, Icon }) => {
              const active = tipoCliente === v;
              return (
                <button key={v} type="button" onClick={() => setTipoCliente(v)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition ${
                    active ? "bg-foreground text-background border-transparent" : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}>
                  <Icon className="h-3.5 w-3.5" /> {label}
                </button>
              );
            })}
            <span className="w-px bg-border my-1" />
            {TIPO_ORDER.map((t) => {
              const m = TIPO_META[t]; const Icon = TIPO_ICON[t]; const active = tipo === t;
              return (
                <button key={t} type="button" onClick={() => setTipo(t)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-bold uppercase tracking-wider transition ${
                    active ? `${m.pillCls} border-transparent shadow-sm` : "border-border bg-card text-muted-foreground hover:border-primary/40"
                  }`}>
                  <Icon className="h-3.5 w-3.5" /> {m.label}
                </button>
              );
            })}
          </div>

          {/* FILA 2 — Delivery */}
          {tipo === "delivery" && (
            <div className="space-y-1.5 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1.5fr_0.7fr] gap-2">
                <AddressAutocomplete
                  value={direccion}
                  onChange={(v) => {
                    setDireccion(v);
                    if (v.trim()) setDireccionError(false);
                    setLatStr("");
                    setLonStr("");
                    setDistanciaApi(null);
                  }}
                  onSelect={({ address, lat, lng }) => {
                    setDireccion(address);
                    setLatStr(String(lat));
                    setLonStr(String(lng));
                    setDireccionError(false);
                  }}
                  placeholder="Dirección de envío *"
                  hasError={direccionError}
                  className="bg-background"
                />
                <Input value={referencia} onChange={(e) => setReferencia(e.target.value)}
                  placeholder="Nota Entrega / General (Ej: Tocar timbre…)" maxLength={200} className="bg-background" />
                <div className="flex items-stretch rounded-md border border-input bg-background overflow-hidden">
                  <span className="flex items-center px-2 text-sm text-muted-foreground border-r border-input bg-muted/40">$</span>
                  <Input type="number" min="0" value={costoDespachoStr} onChange={(e) => setCostoDespachoStr(e.target.value)} placeholder="Costo envío" className="border-0 bg-transparent font-mono focus-visible:ring-0" />
                </div>
              </div>
              {distanciaKm > 0 && latStr && lonStr && (
                <p className="text-xs font-mono text-muted-foreground px-0.5">
                  Distancia: {distanciaKm.toFixed(1)} km · Costo: {fmtCLP(costoDespacho)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* FILTROS */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar producto…" className="bg-card pl-9" />
          </div>
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {(["alcohol", "sin", "todos"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFiltroAlcohol(f)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition flex items-center gap-1 ${
                  filtroAlcohol === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>
                {f === "alcohol" && <Wine className="h-3 w-3" />}
                {f === "sin" && <Droplet className="h-3 w-3" />}
                {f === "alcohol" ? "Con alcohol" : f === "sin" ? "Sin alcohol" : "Todo"}
              </button>
            ))}
          </div>
          <div className="inline-flex rounded-lg border border-border bg-card p-1">
            {(["todos", "mojito", "colada"] as const).map((f) => (
              <button key={f} type="button" onClick={() => setFiltroFamilia(f)}
                className={`px-3 py-1.5 text-xs font-semibold uppercase tracking-wider rounded-md transition ${
                  filtroFamilia === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}>{f === "todos" ? "Todos" : f === "mojito" ? "Mojito" : "Colada"}</button>
            ))}
          </div>
        </div>

        {/* PRODUCT GRID */}
        <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
          {productosFiltrados.map((p) => {
            const cat = catById.get(p.categoria_id ?? "");
            const img = p.imagen_url;
            const inic = p.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]?.toUpperCase() ?? "").join("");
            const sinAlc = p.tiene_alcohol === false;
            const isPromoSabor = p.id === promoSaborId;
            const isTrabajador = !!p.esPrecioTrabajador;
            const isPrecioEspecial = !!p.esPrecioEspecial && !isPromoSabor && !isTrabajador;
            return (
              <button key={p.id} type="button" onClick={() => abrirProducto(p)}
                className={`group relative overflow-hidden rounded-xl border bg-card text-left transition hover:border-primary hover:shadow-lg hover:-translate-y-0.5 ${
                  isPromoSabor || isPrecioEspecial || isTrabajador ? "border-primary/70 ring-2 ring-primary/30" : "border-border"
                }`}>
                <div className="relative aspect-square overflow-hidden bg-background">
                  {img ? (
                    <img src={img} alt={p.nombre} loading="lazy" width={512} height={512}
                      className="w-full h-full object-cover transition group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-primary text-primary-foreground font-display text-3xl tracking-wide">
                      {inic || "DL"}
                    </div>
                  )}
                  <div className="absolute top-2 left-2 flex flex-col gap-1">
                    {sinAlc && <Badge className="bg-blue-500 text-white border-transparent text-[10px] px-1.5 py-0.5 font-bold">SIN ALCOHOL</Badge>}
                    {isPromoSabor && <Badge className="bg-primary text-primary-foreground border-transparent text-[10px] px-1.5 py-0.5">⭐ PROMO</Badge>}
                    {isPrecioEspecial && <Badge className="bg-success text-white border-transparent text-[10px] px-1.5 py-0.5 font-bold">PROMO</Badge>}
                    {isTrabajador && <Badge className="bg-success text-white border-transparent text-[10px] px-1.5 py-0.5 font-bold">👷 TRABAJADOR</Badge>}
                  </div>
                </div>
                <div className="p-2.5">
                  <div className="font-semibold text-sm text-foreground truncate">{p.nombre}</div>
                  {(isPrecioEspecial || isTrabajador) && p.precioOriginal != null ? (
                    <div className="text-xs font-mono mt-0.5">
                      <span className="text-muted-foreground line-through">{fmtCLP(p.precioOriginal)}</span>
                      <span className="text-muted-foreground"> → </span>
                      <span className="text-success font-bold">{fmtCLP(p.precio)}{isTrabajador ? " 👷" : ""}</span>
                    </div>
                  ) : (
                    <div className="font-mono font-bold mt-0.5 text-primary">{fmtCLP(p.precio)}</div>
                  )}
                </div>
              </button>
            );
          })}
          {productosFiltrados.length === 0 && (
            <div className="col-span-full p-6 text-center text-muted-foreground text-sm">Sin productos para mostrar</div>
          )}
        </div>
      </div>

      {/* ───────── COLUMNA DERECHA (40%) — Pedido Actual ───────── */}
      <div className="bg-card border border-border rounded-xl flex flex-col lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
        {/* HEADER */}
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl tracking-wide text-foreground">Pedido Actual</h2>
            <p className="text-xs text-muted-foreground">{totalItems} ítem{totalItems === 1 ? "" : "s"}</p>
          </div>
          <Badge className={`${tipoCfg.pillCls} border-transparent uppercase`}>{tipoCfg.label}</Badge>
        </div>

        {/* SCROLLABLE BODY */}
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {esExterno && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-700 dark:text-amber-300">
              Pedido externo de <strong>{tipoCfg.label}</strong> — solo se registra para inventario.
            </div>
          )}

          {/* Líneas */}
          <div className="space-y-2">
            {lineas.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Tocá un producto para agregarlo</p>
            ) : lineas.map((l) => (
              <div
                key={l.uid}
                className={cn(
                  "rounded-md p-2 transition-all duration-300",
                  l.esRegalo ? "bg-primary/10 border border-primary/30" : "bg-background border border-border",
                  highlightUid === l.uid && "ring-2 ring-primary bg-primary/5 scale-[1.01]",
                )}
              >
                <div className="flex items-center gap-1.5">
                  {l.esRegalo ? (
                    <span className="w-[5.5rem] shrink-0" />
                  ) : (
                    <>
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => cambiarCant(l.uid, -1)}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="w-5 text-center text-sm font-mono shrink-0">{l.cantidad}</span>
                      <Button type="button" size="icon" variant="outline" className="h-7 w-7 shrink-0" onClick={() => cambiarCant(l.uid, 1)}>
                        <Plus className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                  <div className="flex-1 min-w-0 px-1">
                    <div className="text-sm text-foreground truncate">
                      {l.producto.nombre}
                      {l.esRegalo && <span className="ml-2 text-[10px] uppercase tracking-wider text-primary">🎁 {l.promoTipo}</span>}
                    </div>
                    {l.notas && editingUid !== l.uid && (
                      <div className="text-[10px] text-muted-foreground truncate">{l.notas}</div>
                    )}
                  </div>
                  <span className="font-mono text-sm font-semibold shrink-0 text-right">
                    {l.esRegalo ? (
                      "GRATIS"
                    ) : l.producto.esPrecioTrabajador && l.precioOriginal != null ? (
                      <span className="block leading-tight">
                        <span className="text-[10px] text-muted-foreground line-through">
                          {fmtCLP((l.precioOriginal + (l.extras?.reduce((a, e) => a + e.precio, 0) ?? 0)) * l.cantidad)}
                        </span>
                        <span className="block text-success">
                          {fmtCLP(precioLinea(l) * l.cantidad)} 👷
                        </span>
                      </span>
                    ) : (
                      fmtCLP(precioLinea(l) * l.cantidad)
                    )}
                  </span>
                  {!l.esRegalo && (
                    <>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className={cn("h-7 w-7 shrink-0", editingUid === l.uid && "text-primary")}
                        onClick={() => (editingUid === l.uid ? setEditingUid(null) : abrirEdicion(l))}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="h-7 w-7 shrink-0 text-destructive" onClick={() => quitar(l.uid)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>

                {editingUid === l.uid && (
                  <div className="mt-3 pt-3 border-t border-border space-y-3">
                    {saboresExtra.length > 0 && (
                      <div>
                        <Label className="text-xs text-muted-foreground">Sabores extra</Label>
                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                          {saboresExtra.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleEditExtra(s.id)}
                              className={cn(
                                "text-xs px-2.5 py-1 rounded-full border transition",
                                editExtrasSel.has(s.id)
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "bg-muted/40 text-muted-foreground border-border hover:border-primary/60",
                              )}
                            >
                              + {formatSaborExtra(s.nombre)} {fmtCLP(s.precio)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <Label className="text-xs text-muted-foreground">Notas</Label>
                      <Input
                        value={editNotas}
                        onChange={(e) => setEditNotas(e.target.value)}
                        placeholder="Ej: sin hielo, extra menta…"
                        className="bg-background mt-1"
                        maxLength={200}
                      />
                    </div>
                    <Button type="button" size="sm" onClick={() => guardarEdicionLinea(l.uid)} className="bg-primary text-primary-foreground">
                      Guardar
                    </Button>
                  </div>
                )}

                {l.extras && l.extras.length > 0 && editingUid !== l.uid && (
                  <div className="mt-1 pl-3 border-l border-border/60 space-y-0.5">
                    {l.extras.map((e) => (
                      <div key={e.id} className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <span>+ {formatSaborExtra(e.nombre)}</span>
                        <span className="font-mono">{fmtCLP(e.precio)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* PROMO ICONS — pequeños, sobre Jarros */}
          {!esExterno && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Label className="label-upper text-primary flex items-center gap-1"><Sparkles className="h-3 w-3" /> Promos</Label>
                <button type="button" onClick={() => setEsCumple((v) => !v)}
                  title="Cumpleaños"
                  className={`h-8 w-8 rounded-md border flex items-center justify-center transition ${esCumple ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                  <Cake className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => { if (canjeAprobado) { setCanjeAprobado(false); setCanjeTragosIds([""]); } else { setCanjeCodigo(""); setCanjeOpen(true); } }}
                  title="Canje / cortesía"
                  className={`h-8 w-8 rounded-md border flex items-center justify-center transition ${canjeAprobado ? "bg-primary text-primary-foreground border-transparent" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                  <KeyRound className="h-4 w-4" />
                </button>
                {jarraDoradaDisponible && (
                  <button type="button" onClick={() => { if (jarraDoradaTragoId) setJarraDoradaTragoId(""); }}
                    title="Jarra dorada"
                    className={`h-8 w-8 rounded-md border flex items-center justify-center transition ${jarraDoradaTragoId ? "bg-amber-500 text-white border-transparent" : "border-amber-500/50 text-amber-600 hover:bg-amber-500/10"}`}>
                    <Trophy className="h-4 w-4" />
                  </button>
                )}
              </div>

              {/* Selectores condicionales */}
              {esCumple && (
                <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                  <div className="text-[11px] font-bold uppercase text-primary flex items-center gap-1"><Cake className="h-3 w-3" /> Cumpleaños</div>
                  <Input value={cumpleVerif} onChange={(e) => setCumpleVerif(e.target.value)} placeholder="RUT o nombre para verificar" className="bg-background h-9" maxLength={50} />
                  <Select value={cumpleTragoId} onValueChange={setCumpleTragoId}>
                    <SelectTrigger className="bg-background h-9"><SelectValue placeholder="Trago de regalo" /></SelectTrigger>
                    <SelectContent>{productosConPromo.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {canjeAprobado && (
                <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2">
                  <div className="text-[11px] font-bold uppercase text-primary flex items-center gap-1"><KeyRound className="h-3 w-3" /> Canje autorizado</div>
                  {canjeTragosIds.map((id, i) => (
                    <div key={i} className="flex items-center gap-1">
                      <Select value={id} onValueChange={(v) => setCanjeTragosIds((prev) => prev.map((x, idx) => idx === i ? v : x))}>
                        <SelectTrigger className="bg-background h-9"><SelectValue placeholder={`Trago canje #${i + 1}`} /></SelectTrigger>
                        <SelectContent>{productosConPromo.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
                      </Select>
                      {canjeTragosIds.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive shrink-0" onClick={() => setCanjeTragosIds((prev) => prev.filter((_, idx) => idx !== i))}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="w-full h-8" onClick={() => setCanjeTragosIds((prev) => [...prev, ""])}>
                    <Plus className="h-3 w-3 mr-1" /> Otro
                  </Button>
                </div>
              )}
              {jarraDoradaTragoId !== "" && jarraDoradaDisponible && (
                <div className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-2">
                  <div className="text-[11px] font-bold uppercase text-amber-600 flex items-center gap-1"><Trophy className="h-3 w-3" /> Jarra dorada</div>
                  <Select value={jarraDoradaTragoId} onValueChange={setJarraDoradaTragoId}>
                    <SelectTrigger className="bg-background h-9"><SelectValue placeholder="Trago de cortesía" /></SelectTrigger>
                    <SelectContent>{productosConPromo.map((p) => <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              )}
              {jarraDoradaDisponible && !jarraDoradaTragoId && (
                <Button type="button" variant="outline" size="sm" className="w-full h-8 border-amber-500/40 text-amber-600" onClick={() => setJarraDoradaTragoId(productosConPromo[0]?.id ?? "")}>
                  <Trophy className="h-3 w-3 mr-1" /> Activar jarra dorada
                </Button>
              )}
            </div>
          )}

          {/* JARROS — − N + */}
          {!esExterno && (
            <div className="space-y-1">
              <Label className="label-upper text-xs flex items-center gap-1"><Gift className="h-3 w-3" /> Jarros devueltos</Label>
              <div className="flex items-center gap-2">
                <Button type="button" size="icon" variant="outline" className="h-10 w-10" onClick={() => setJarrosDevueltos(String(Math.max(0, jarrosNum - 1)))}><Minus className="h-4 w-4" /></Button>
                <Input type="number" min="0" value={jarrosDevueltos} onChange={(e) => setJarrosDevueltos(e.target.value)} className="bg-background font-mono text-center text-lg h-10" />
                <Button type="button" size="icon" variant="outline" className="h-10 w-10" onClick={() => setJarrosDevueltos(String(jarrosNum + 1))}><Plus className="h-4 w-4" /></Button>
              </div>
              {jarrosNum > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {tragosGratisJarros > 0 && <>🎁 {tragosGratisAplicados}/{tragosGratisJarros} trago(s) gratis{descuentoJarrosTragos > 0 && <> · -{fmtCLP(descuentoJarrosTragos)}</>} · </>}
                  {jarrosSobrantes > 0 && <>-{fmtCLP(descuentoJarrosSobrantes)} desc.</>}
                </p>
              )}
              {tragosGratisJarros > 0 && (
                <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-2 mt-2">
                  <div className="text-[11px] font-bold uppercase text-primary flex items-center gap-1">
                    <Gift className="h-3 w-3" /> Seleccioná qué trago{tragosGratisJarros > 1 ? "s van" : " va"} gratis
                  </div>
                  {Array.from({ length: tragosGratisJarros }).map((_, i) => (
                    <Select
                      key={i}
                      value={tragosGratisSel[i] || ""}
                      onValueChange={(v) =>
                        setTragosGratisSel((prev) => {
                          const arr = [...prev];
                          while (arr.length < tragosGratisJarros) arr.push("");
                          arr[i] = v;
                          return arr;
                        })
                      }
                    >
                      <SelectTrigger className="bg-background h-9">
                        <SelectValue placeholder={`Trago gratis #${i + 1}`} />
                      </SelectTrigger>
                      <SelectContent>
                        {lineas.filter((l) => !l.esRegalo && l.cantidad > 0).length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">Agregá productos primero</div>
                        ) : (
                          lineas
                            .filter((l) => !l.esRegalo && l.cantidad > 0)
                            .map((l) => (
                              <SelectItem key={l.uid} value={l.uid}>
                                {l.producto.nombre} ({fmtCLP(l.producto.precio + (l.extras?.reduce((a, e) => a + e.precio, 0) ?? 0))})
                              </SelectItem>
                            ))
                        )}
                      </SelectContent>
                    </Select>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* NOTAS DE COCINA */}
          <div className="space-y-1">
            <Label className="label-upper text-xs">Notas de Cocina</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej: sin hielo, extra menta…" maxLength={500} className="bg-background" rows={2} />
          </div>

          {!esExterno && (
            <div className="space-y-1">
              <Label className="label-upper text-xs">Descuento manual $</Label>
              <Input type="number" value={descuento} onChange={(e) => setDescuento(e.target.value)} placeholder="0" className="bg-background font-mono h-9" />
            </div>
          )}

          {/* AGENDAR (toggle) */}
          {agendarOpen && (
            <div className="space-y-1 rounded-md border border-primary/30 bg-primary/5 p-2">
              <Label className="label-upper text-xs flex items-center gap-1"><CalendarClock className="h-3 w-3" /> Agendar para</Label>
              <Input type="datetime-local" value={horaAgendada} onChange={(e) => setHoraAgendada(e.target.value)} className="bg-background h-9" />
              {horaAgendada && (
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-primary">⏰ {new Date(horaAgendada).toLocaleString("es-CL")}</span>
                  <button type="button" className="text-destructive underline flex items-center gap-1" onClick={() => { setHoraAgendada(""); setAgendarOpen(false); }}><X className="h-3 w-3" /> quitar</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* RESUMEN + BOTONES — fijos al pie */}
        <div className="border-t border-border p-4 space-y-3 bg-card">
          {!esExterno && (
            <div className="rounded-lg border border-border bg-background p-3 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={yaPago}
                  onCheckedChange={(v) => setYaPago(v === true)}
                />
                <span className="text-sm font-medium">El cliente ya pagó este pedido</span>
              </label>

              {yaPago && (
                <div className="space-y-2 pl-6 border-l-2 border-primary/30">
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Banknote className="h-3 w-3" /> Efectivo</Label>
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={pagoMixtoEf}
                      onChange={(e) => setPagoMixtoEf(e.target.value)}
                      placeholder="0"
                      className="bg-background font-mono h-9"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><Landmark className="h-3 w-3" /> Transferencia</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        value={pagoMixtoTr}
                        onChange={(e) => setPagoMixtoTr(e.target.value)}
                        placeholder="0"
                        className="bg-background font-mono h-9 flex-1"
                      />
                      <Input
                        value={pagoMixtoTrRef}
                        onChange={(e) => {
                          pagoMixtoTrRefTouched.current = true;
                          setPagoMixtoTrRef(e.target.value);
                        }}
                        placeholder="Referencia"
                        className="bg-background h-9 w-[40%]"
                        maxLength={50}
                        disabled={pagoYaTr <= 0}
                      />
                    </div>
                    {pagoYaTr > 0 && !pagoMixtoTrRef.trim() && (
                      <p className="text-[10px] text-muted-foreground">Si no ingresás referencia, se usará #n° del pedido</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs flex items-center gap-1"><CreditCard className="h-3 w-3" /> Tarjeta</Label>
                    <Input
                      type="number"
                      min="0"
                      inputMode="numeric"
                      value={pagoMixtoTa}
                      onChange={(e) => setPagoMixtoTa(e.target.value)}
                      placeholder="0"
                      className="bg-background font-mono h-9"
                    />
                  </div>
                  <div className="pt-2 border-t border-border space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total ingresado</span>
                      <span className="font-mono">{fmtCLP(totalIngresadoYaPago)}</span>
                    </div>
                    {diffYaPago < 0 && (
                      <div className="flex justify-between text-destructive font-medium">
                        <span>Falta</span>
                        <span className="font-mono">{fmtCLP(Math.abs(diffYaPago))}</span>
                      </div>
                    )}
                    {diffYaPago === 0 && totalIngresadoYaPago > 0 && (
                      <div className="text-success font-medium text-center">✓ Pago completo</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Subtotal (Base)</span><span className="font-mono">{fmtCLP(subtotal)}</span></div>
            {tipo === "delivery" && <div className="flex justify-between text-muted-foreground"><span>Envío</span><span className="font-mono">{fmtCLP(costoDespacho)}</span></div>}
            {desc > 0 && <div className="flex justify-between text-muted-foreground"><span>Descuentos</span><span className="font-mono">-{fmtCLP(desc)}</span></div>}
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-border">
              <span className="font-bold uppercase tracking-wider text-foreground">Total a Pagar</span>
              <span className="font-mono font-extrabold text-3xl text-primary">{fmtCLP(total)}</span>
            </div>
          </div>

          {!esExterno && !yaPago && (
            <div className="rounded-lg border border-border bg-background p-3 space-y-2">
              <Label className="label-upper text-xs flex items-center gap-1.5">
                <CreditCard className="h-3.5 w-3.5" />
                ¿Cómo va a pagar?
                <span className="text-muted-foreground font-normal normal-case tracking-normal">(opcional)</span>
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "efectivo" as const, label: "Efectivo", Icon: Banknote },
                  { v: "transferencia" as const, label: "Transferencia", Icon: Landmark },
                  { v: "tarjeta" as const, label: "Tarjeta", Icon: CreditCard },
                ]).map(({ v, label, Icon }) => {
                  const active = metodoPagoEsperado === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMetodoPagoEsperado(active ? null : v)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1 h-12 rounded-lg border text-xs font-bold uppercase tracking-wider transition",
                        active
                          ? "bg-primary text-primary-foreground border-primary"
                          : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" onClick={() => setAgendarOpen((v) => !v)}
              className={`h-12 font-bold uppercase text-xs flex-col gap-0.5 ${horaAgendada ? "border-primary text-primary" : ""}`}>
              <CalendarClock className="h-4 w-4" /> Agendar
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={saving || lineas.length === 0 || (yaPago && !pagoYaCuadra)}
              onClick={submit}
              className="h-12 font-bold uppercase text-xs flex-col gap-0.5"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4" /> Guardar</>}
            </Button>
            <Button
              type="button"
              disabled={saving || lineas.length === 0 || (yaPago && !pagoYaCuadra)}
              onClick={submit}
              className={cn(
                "h-12 font-bold uppercase text-xs flex-col gap-0.5",
                yaPago && pagoYaCuadra && diffYaPago === 0
                  ? "bg-success text-success-foreground hover:bg-success/90"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
              )}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CreditCard className="h-4 w-4" /> Procesar pago</>}
            </Button>
          </div>
        </div>
      </div>

      {/* Modales */}
      <Dialog open={canjeOpen} onOpenChange={setCanjeOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aplicar canje / cortesía</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Código de autorización</Label>
            <Input type="password" value={canjeCodigo} onChange={(e) => setCanjeCodigo(e.target.value)} placeholder="Clave del encargado" autoFocus />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCanjeOpen(false)}>Cancelar</Button>
            <Button onClick={verificarCanje}>Verificar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
