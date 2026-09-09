import writeXlsxFile from "write-excel-file/browser";
import { supabase } from "@/integrations/supabase/client";

export const COMUNAS_SANTIAGO = [
  "QUILICURA",
  "RENCA",
  "CONCHALI",
  "HUECHURABA",
  "RECOLETA",
  "PROVIDENCIA",
  "CERRO NAVIA",
  "INDEPENDENCIA",
  "QUINTA NORMAL",
  "LO PRADO",
  "PUDAHUEL",
  "ESTACION CENTRAL",
  "SANTIAGO CENTRO",
  "CERRILLOS",
  "PAC",
  "LO ESPEJO",
  "MAIPU",
  "PADRE HURTADO",
  "SAN MIGUEL",
  "LA CISTERNA",
  "EL BOSQUE",
  "SAN BERNARDO",
  "LA PINTANA",
  "PUENTE ALTO",
  "PIRQUE",
  "LA FLORIDA",
  "SAN JOSE DE MAIPO",
  "LA GRANJA",
  "SAN JOAQUIN",
  "MACUL",
  "PEÑALOLEN",
  "ÑUÑOA",
  "LA REINA",
  "LAS CONDES",
  "VITACURA",
  "LO BARNECHEA",
  "SAN RAMON",
] as const;

const HEADERS_RESUMEN = [
  "FECHA",
  "DÍA",
  "AÑO",
  "MES",
  "N°DÍA",
  "SUCURSAL",
  "PEDIDOS",
  "RETIROS",
  "DESPACHOS",
  "JARROS VENDIDOS",
  "PROMOS",
  "JARROS SUELTOS",
  "SABOR DEL DIA",
  "CORONA",
  "TRABAJADOR",
  "TROPICAL GIN",
  "UBER",
  "CANJE",
  "SIN ALCOHOL",
  "EFECTIVO",
  "TRANSFERENCIA",
  "TARJETA",
  "DESPACHO C",
  "DESPACHO DLITRO",
  "ONCE",
  "PEDIDOS CANCELADOS",
  "JARROS CANCELADOS",
  "RAPPI",
  "EFECTIVO TOTAL CAJA",
] as const;

const DIAS_ES = ["DOMINGO", "LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES", "SÁBADO"];
const MESES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE",
];

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Alias para detectar comunas en direcciones. */
const COMUNA_ALIASES: Record<string, string[]> = {
  PAC: ["PAC", "PEDRO AGUIRRE CERDA", "P A C"],
  "ESTACION CENTRAL": ["ESTACION CENTRAL", "ESTACIÓN CENTRAL"],
  "SANTIAGO CENTRO": ["SANTIAGO CENTRO", "SANTIAGO"],
  MAIPU: ["MAIPU", "MAIPÚ"],
  PEÑALOLEN: ["PENALOLEN", "PEÑALOLEN"],
  "ÑUÑOA": ["NUNOA", "ÑUÑOA"],
  "SAN JOSE DE MAIPO": ["SAN JOSE DE MAIPO", "SAN JOSÉ DE MAIPO"],
  "SAN JOAQUIN": ["SAN JOAQUIN", "SAN JOAQUÍN"],
  "SAN RAMON": ["SAN RAMON", "SAN RAMÓN"],
};

const COMUNAS_POR_LARGO = [...COMUNAS_SANTIAGO].sort((a, b) => b.length - a.length);

export function detectarComuna(direccion: string | null | undefined): string | null {
  if (!direccion?.trim()) return null;
  const d = norm(direccion);
  for (const comuna of COMUNAS_POR_LARGO) {
    const aliases = COMUNA_ALIASES[comuna] ?? [comuna];
    for (const alias of aliases) {
      const a = norm(alias);
      if (d.includes(a)) {
        // Evitar que "SANTIAGO" matchee comunas que también contienen Santiago en otro contexto
        if (comuna === "SANTIAGO CENTRO" && a === "SANTIAGO") {
          const otros = COMUNAS_POR_LARGO.filter((c) => c !== "SANTIAGO CENTRO");
          const esOtra = otros.some((c) => {
            const als = (COMUNA_ALIASES[c] ?? [c]).map(norm);
            return als.some((al) => al !== "SANTIAGO" && d.includes(al));
          });
          if (esOtra) continue;
        }
        return comuna;
      }
    }
  }
  return null;
}

function parseFechaLocal(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

function fmtFechaExcel(iso: string): string {
  const dt = parseFechaLocal(iso);
  const dd = String(dt.getDate()).padStart(2, "0");
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

function metaFecha(iso: string) {
  const dt = parseFechaLocal(iso);
  return {
    fecha: fmtFechaExcel(iso),
    dia: DIAS_ES[dt.getDay()],
    anio: dt.getFullYear(),
    mes: MESES_ES[dt.getMonth()],
    nDia: dt.getDate(),
  };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

const PAGE_SIZE = 1000;

/** Carga todas las filas de una query PostgREST paginando con .range() hasta agotar. */
async function fetchAllPages<T>(
  label: string,
  fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + PAGE_SIZE - 1);
    if (error) throw new Error(`[${label}] ${error.message}`);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return out;
}

function n(v: number | null | undefined): number {
  return Number.isFinite(Number(v)) ? Number(v) : 0;
}

type TurnoExp = {
  id: string;
  sucursal_id: string;
  fecha_dlitro: string;
  tomador_id: string;
  sucursal_nombre: string;
};

type PedidoExp = {
  id: string;
  turno_id: string;
  tipo: string;
  estado: string;
  promo_tipo: string | null;
  descuento: number | null;
  jarros_entregados: number | null;
  costo_despacho: number | null;
  direccion_entrega: string | null;
};

type ItemExp = {
  pedido_id: string;
  producto_id: string | null;
  cantidad: number;
  producto_nombre: string;
  tiene_alcohol: boolean | null;
};

export type ExportContadorParams = {
  fechaInicio: string; // YYYY-MM-DD
  fechaFin: string;
  sucursalId: string | null; // null = todas
  sucursalNombreArchivo: string;
};

export async function exportarContadorExcel(params: ExportContadorParams): Promise<void> {
  const { fechaInicio, fechaFin, sucursalId, sucursalNombreArchivo } = params;

  let turnosQ = supabase
    .from("turnos")
    .select("id, sucursal_id, fecha_dlitro, tomador_id, sucursales(nombre)")
    .gte("fecha_dlitro", fechaInicio)
    .lte("fecha_dlitro", fechaFin)
    .order("fecha_dlitro");

  if (sucursalId) turnosQ = turnosQ.eq("sucursal_id", sucursalId);

  const { data: turnosRaw, error: turnosErr } = await turnosQ;
  if (turnosErr) throw new Error(turnosErr.message);

  const turnos: TurnoExp[] = ((turnosRaw as unknown as Array<{
    id: string;
    sucursal_id: string;
    fecha_dlitro: string;
    tomador_id: string;
    sucursales: { nombre: string } | null;
  }>) ?? []).map((t) => ({
    id: t.id,
    sucursal_id: t.sucursal_id,
    fecha_dlitro: t.fecha_dlitro,
    tomador_id: t.tomador_id,
    sucursal_nombre: t.sucursales?.nombre ?? "—",
  }));

  if (turnos.length === 0) {
    throw new Error("No hay turnos en el rango seleccionado");
  }

  const turnoIds = turnos.map((t) => t.id);

  const pedidos: PedidoExp[] = [];
  for (const ids of chunk(turnoIds, 80)) {
    const page = await fetchAllPages<PedidoExp>("pedidos", (from, to) =>
      supabase
        .from("pedidos")
        .select("id, turno_id, tipo, estado, promo_tipo, descuento, jarros_entregados, costo_despacho, direccion_entrega")
        .in("turno_id", ids)
        .range(from, to),
    );
    pedidos.push(...page);
  }

  const pedidoIds = pedidos.map((p) => p.id);
  const items: ItemExp[] = [];
  for (const ids of chunk(pedidoIds, 80)) {
    if (ids.length === 0) continue;
    const page = await fetchAllPages<{
      pedido_id: string;
      cantidad: number;
      producto_id: string | null;
      producto: { nombre: string; tiene_alcohol: boolean | null } | null;
    }>("pedido_items", (from, to) =>
      supabase
        .from("pedido_items")
        .select("pedido_id, cantidad, producto_id, producto:producto_id(nombre, tiene_alcohol)")
        .in("pedido_id", ids)
        .range(from, to),
    );
    for (const row of page) {
      items.push({
        pedido_id: row.pedido_id,
        producto_id: row.producto_id,
        cantidad: n(row.cantidad) || 1,
        producto_nombre: row.producto?.nombre ?? "",
        tiene_alcohol: row.producto?.tiene_alcohol ?? null,
      });
    }
  }

  const { data: promosPrecioData, error: promosErr } = await supabase
    .from("promociones_precio")
    .select("producto_id")
    .eq("activo", true);
  if (promosErr) throw new Error(promosErr.message);
  const productosSaborDelDia = new Set(
    ((promosPrecioData as Array<{ producto_id: string }> | null) ?? []).map((r) => r.producto_id),
  );

  // También productos marcados como sabor del día en tabla promociones
  const { data: promoSabor } = await supabase
    .from("promociones")
    .select("producto_id")
    .eq("tipo", "sabor_del_dia")
    .eq("activo", true)
    .maybeSingle();
  if (promoSabor?.producto_id) productosSaborDelDia.add(promoSabor.producto_id);

  type PagoRow = { turno_id: string; metodo: string; monto: number };
  type GastoRow = { turno_id: string; metodo: string | null; monto: number; concepto: string };
  type PagoDespRow = { turno_id: string; base_por_horas: number };

  const pagos: PagoRow[] = [];
  const gastos: GastoRow[] = [];
  const pagosDesp: PagoDespRow[] = [];

  for (const ids of chunk(turnoIds, 80)) {
    const [pagPage, gasPage, despPage] = await Promise.all([
      fetchAllPages<PagoRow>("pagos_turno", (from, to) =>
        supabase.from("pagos_turno").select("turno_id, metodo, monto").in("turno_id", ids).range(from, to),
      ),
      fetchAllPages<GastoRow>("gastos_turno", (from, to) =>
        supabase.from("gastos_turno").select("turno_id, metodo, monto, concepto").in("turno_id", ids).range(from, to),
      ),
      fetchAllPages<PagoDespRow>("pago_despachadores", (from, to) =>
        supabase.from("pago_despachadores").select("turno_id, base_por_horas").in("turno_id", ids).range(from, to),
      ),
    ]);
    pagos.push(...pagPage);
    gastos.push(...gasPage);
    pagosDesp.push(...despPage);
  }

  // Agrupar por fecha + sucursal
  type Key = string;
  const keyOf = (fecha: string, sucId: string) => `${fecha}__${sucId}`;

  const grupos = new Map<Key, {
    fecha: string;
    sucursal_id: string;
    sucursal_nombre: string;
    turnoIds: string[];
  }>();

  for (const t of turnos) {
    const k = keyOf(t.fecha_dlitro, t.sucursal_id);
    let g = grupos.get(k);
    if (!g) {
      g = {
        fecha: t.fecha_dlitro,
        sucursal_id: t.sucursal_id,
        sucursal_nombre: t.sucursal_nombre,
        turnoIds: [],
      };
      grupos.set(k, g);
    }
    g.turnoIds.push(t.id);
  }

  const pedidosByTurno = new Map<string, PedidoExp[]>();
  for (const p of pedidos) {
    const arr = pedidosByTurno.get(p.turno_id) ?? [];
    arr.push(p);
    pedidosByTurno.set(p.turno_id, arr);
  }

  const itemsByPedido = new Map<string, ItemExp[]>();
  for (const it of items) {
    const arr = itemsByPedido.get(it.pedido_id) ?? [];
    arr.push(it);
    itemsByPedido.set(it.pedido_id, arr);
  }

  const sortedKeys = [...grupos.keys()].sort((a, b) => {
    const ga = grupos.get(a)!;
    const gb = grupos.get(b)!;
    if (ga.fecha !== gb.fecha) return ga.fecha.localeCompare(gb.fecha);
    return ga.sucursal_nombre.localeCompare(gb.sucursal_nombre);
  });

  const rowsResumen: (string | number)[][] = [];
  const rowsComunas: (string | number)[][] = [];

  const esPlataforma = (tipo: string) => tipo === "uber" || tipo === "rappi";
  const esPropioActivo = (p: PedidoExp) => p.estado !== "cancelado" && !esPlataforma(p.tipo);

  for (const k of sortedKeys) {
    const g = grupos.get(k)!;
    const meta = metaFecha(g.fecha);
    const peds = g.turnoIds.flatMap((id) => pedidosByTurno.get(id) ?? []);
    const propios = peds.filter(esPropioActivo);
    const cancelados = peds.filter((p) => p.estado === "cancelado");

    let jarrosVendidos = 0;
    let jarrosSueltos = 0;
    let jarrosCancelados = 0;
    let despachoC = 0;
    let corona = 0;
    let tropicalGin = 0;
    let sinAlcohol = 0;
    let saborDelDia = 0;

    for (const p of propios) {
      // jarros_entregados solo alimenta JARROS SUELTOS (sobrantes % 4);
      // la columna "JARROS ENTREGADOS" ya no se exporta.
      const j = n(p.jarros_entregados);
      jarrosSueltos += j % 4;
      // DESPACHO C: cobrado a clientes por despacho (solo entregados)
      if (p.tipo === "despacho" && p.estado === "entregado") {
        despachoC += n(p.costo_despacho);
      }

      for (const it of itemsByPedido.get(p.id) ?? []) {
        const cant = n(it.cantidad) || 1;
        jarrosVendidos += cant;
        if (/corona/i.test(it.producto_nombre)) corona += cant;
        if (/tropical\s*gin/i.test(it.producto_nombre) || /tropical/i.test(it.producto_nombre)) {
          tropicalGin += cant;
        }
        if (it.tiene_alcohol === false) sinAlcohol += cant;
        if (it.producto_id && productosSaborDelDia.has(it.producto_id)) {
          saborDelDia += cant;
        }
      }
    }

    for (const p of cancelados) {
      jarrosCancelados += n(p.jarros_entregados);
    }

    const tipIds = new Set(g.turnoIds);

    // Desglose bruto de ventas por método (pagos_turno). Estos importes no descuentan
    // gastos del turno, pagos a despachadores ni caja chica.
    let efectivoVentas = 0;
    let transferencia = 0;
    let tarjeta = 0;
    for (const p of pagos) {
      if (!tipIds.has(p.turno_id)) continue;
      const m = n(p.monto);
      if (p.metodo === "efectivo") efectivoVentas += m;
      else if (p.metodo === "transferencia") transferencia += m;
      else if (p.metodo === "tarjeta") tarjeta += m;
    }

    let once = 0;
    for (const gas of gastos) {
      if (!tipIds.has(gas.turno_id)) continue;
      const m = n(gas.monto);
      if (/once/i.test(gas.concepto ?? "")) once += m;
    }

    // DESPACHO DLITRO: solo base por horas pagada al despachador (sin bono ni despachos cobrados).
    let despachoDlitro = 0;
    for (const d of pagosDesp) {
      if (!tipIds.has(d.turno_id)) continue;
      despachoDlitro += n(d.base_por_horas);
    }

    // EFECTIVO y EFECTIVO TOTAL CAJA representan todo el efectivo ingresado por ventas.
    // Los egresos se mantienen separados en sus columnas para evitar mezclar conceptos.
    const efectivoTotalCaja = efectivoVentas;

    const pedidosCount = propios.length;
    const retiros = propios.filter((p) => p.tipo === "retiro").length;
    const despachos = propios.filter((p) => p.tipo === "despacho").length;
    const promos = propios.filter((p) => p.promo_tipo != null || n(p.descuento) > 0).length;
    const trabajador = propios.filter((p) => p.promo_tipo === "trabajador").length;
    const canje = propios.filter((p) => p.promo_tipo === "canje").length;
    const uber = peds.filter((p) => p.tipo === "uber").length;
    const rappi = peds.filter((p) => p.tipo === "rappi").length;

    rowsResumen.push([
      meta.fecha,
      meta.dia,
      meta.anio,
      meta.mes,
      meta.nDia,
      g.sucursal_nombre.toUpperCase(),
      pedidosCount,
      retiros,
      despachos,
      jarrosVendidos,
      promos,
      jarrosSueltos,
      saborDelDia,
      corona,
      trabajador,
      tropicalGin,
      uber,
      canje,
      sinAlcohol,
      Math.round(efectivoVentas),
      Math.round(transferencia),
      Math.round(tarjeta),
      Math.round(despachoC),
      Math.round(despachoDlitro),
      Math.round(once),
      cancelados.length,
      jarrosCancelados,
      rappi,
      Math.round(efectivoTotalCaja),
    ]);

    const conteoComunas: Record<string, number> = {};
    for (const c of COMUNAS_SANTIAGO) conteoComunas[c] = 0;
    for (const p of propios) {
      if (p.tipo !== "despacho" && p.tipo !== "delivery") continue;
      const comuna = detectarComuna(p.direccion_entrega);
      if (comuna) conteoComunas[comuna] = (conteoComunas[comuna] ?? 0) + 1;
    }

    rowsComunas.push([
      meta.fecha,
      meta.dia,
      meta.anio,
      meta.mes,
      meta.nDia,
      g.sucursal_nombre.toUpperCase(),
      ...COMUNAS_SANTIAGO.map((c) => conteoComunas[c] || ""),
    ]);
  }

  const headersComunas = [
    "FECHA", "DÍA", "AÑO", "MES", "N°DÍA", "SUCURSAL",
    ...COMUNAS_SANTIAGO,
  ];

  const safeName = sucursalNombreArchivo
    .toUpperCase()
    .replace(/[^A-Z0-9ÁÉÍÓÚÑÜ]+/gi, "_")
    .replace(/^_|_$/g, "") || "TODAS";

  const fi = fechaInicio.replace(/-/g, "");
  const ff = fechaFin.replace(/-/g, "");
  await writeXlsxFile([
    {
      sheet: "Resumen Diario",
      data: [[...HEADERS_RESUMEN], ...rowsResumen],
      stickyRowsCount: 1,
    },
    {
      sheet: "Comunas",
      data: [headersComunas, ...rowsComunas],
      stickyRowsCount: 1,
    },
  ]).toFile(`dlitro_${safeName}_${fi}_${ff}.xlsx`);
}
