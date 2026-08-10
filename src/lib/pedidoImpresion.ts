import { formatSaborExtra, type ComandaItem, normalizarTipoComanda } from "@/lib/printComanda";
import type { PedidoImpresion } from "@/services/printer";

type PedidoItemRow = {
  cantidad: number;
  precio_unitario: number;
  descuento_item?: number | null;
  notas: string | null;
  productos?: { nombre: string } | null;
  producto?: { nombre: string } | null;
};

const RE_PROMO_JARROS = /\[PROMO\s+JARROS\]/i;

/** Solo instrucciones del cliente y extras — sin etiquetas de promo. */
export function buildNotasClienteDeItem(input: {
  extras?: { nombre: string }[];
  notas?: string | null;
}): string | null {
  const partes: string[] = [];
  if (input.extras?.length) {
    partes.push(`Extras: ${input.extras.map((e) => formatSaborExtra(e.nombre)).join(", ")}`);
  }
  if (input.notas?.trim()) partes.push(input.notas.trim());
  return partes.length > 0 ? partes.join(" | ") : null;
}

export function esItemPromoJarros(row: {
  precio_unitario: number;
  descuento_item?: number | null;
  notas?: string | null;
}): boolean {
  if (row.precio_unitario === 0 && row.descuento_item === 0) return true;
  return RE_PROMO_JARROS.test(row.notas ?? "");
}

/** Descompone pedido_items.notas en extras, promo y nota libre del usuario. */
export function parseItemNotas(notas: string | null | undefined): {
  extras: { nombre: string; precio: number }[];
  notaUsuario?: string;
  notaPromo?: string;
  precioOriginal?: number;
} {
  if (!notas?.trim()) return { extras: [] };

  const extras: { nombre: string; precio: number }[] = [];
  const promoParts: string[] = [];
  const userParts: string[] = [];
  let precioOriginal: number | undefined;

  for (const parte of notas.split(" | ").map((p) => p.trim()).filter(Boolean)) {
    const promoPrecio = parte.match(/^\[PROMO_PRECIO:(\d+)\]$/);
    if (promoPrecio) {
      precioOriginal = parseInt(promoPrecio[1], 10);
      continue;
    }
    if (/^\[PRECIO TRABAJADOR\]$/i.test(parte)) {
      promoParts.push(parte);
      continue;
    }
    if (/^\[PROMO /i.test(parte)) {
      promoParts.push(parte);
      continue;
    }
    if (parte.startsWith("Extras:")) {
      const raw = parte.replace(/^Extras:\s*/i, "");
      for (const nombre of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
        extras.push({ nombre, precio: 1000 });
      }
      continue;
    }
    userParts.push(parte);
  }

  return {
    extras,
    notaUsuario: userParts.length > 0 ? userParts.join(" | ") : undefined,
    notaPromo: promoParts.length > 0 ? promoParts.join(" | ") : undefined,
    precioOriginal,
  };
}

export function comandaItemFromPedidoItem(
  row: {
    cantidad: number;
    precio_unitario: number;
    notas: string | null;
    nombre: string;
    descuento_item?: number | null;
  },
  opts?: { marker?: "nuevo" | "cancelado" },
): ComandaItem {
  const esPromoJarros = esItemPromoJarros(row);
  const parsed = parseItemNotas(row.notas);
  const notaPromoSinJarros = parsed.notaPromo
    ?.split(" | ")
    .map((p) => p.trim())
    .filter((p) => p && !RE_PROMO_JARROS.test(p))
    .join(" | ") || undefined;

  return {
    cantidad: row.cantidad,
    nombre: row.nombre,
    precio_unitario: row.precio_unitario,
    esRegalo: row.precio_unitario === 0,
    esPromoJarros,
    extras: parsed.extras.length > 0 ? parsed.extras : undefined,
    notas: parsed.notaUsuario,
    notaPromo: notaPromoSinJarros,
    precioOriginal: parsed.precioOriginal,
    marker: opts?.marker,
  };
}

/** Misma forma que usa la reimpresión desde el kanban (comanda cocina simplificada). */
export function buildComandaCocinaItems(items: ComandaItem[]) {
  return items.map((i) => ({
    cantidad: i.cantidad,
    nombre: i.nombre,
    extras: i.extras?.map((e) => ({ nombre: e.nombre })),
    notas: i.notas,
    esRegalo: i.esRegalo,
    esPromoJarros: i.esPromoJarros,
    notaPromo: i.notaPromo,
    marker: i.marker,
  }));
}

export type PedidoParaImpresion = {
  numero_pedido: number | null;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo: string;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  subtotal: number;
  descuento: number | null;
  costo_despacho: number | null;
  total: number;
  notas: string | null;
  metodo_pago?: string | null;
  pago_registrado?: boolean | null;
  monto_recibido?: number | null;
  jarros_prometidos?: number | null;
  promo_tipo?: string | null;
  pedido_items?: PedidoItemRow[];
};

export function buildPedidoImpresion(
  pedido: PedidoParaImpresion,
  opts: { sucursalNombre: string; tomadorNombre?: string | null; despachadorNombre?: string | null },
): PedidoImpresion {
  const items: ComandaItem[] = (pedido.pedido_items ?? []).map((it) =>
    comandaItemFromPedidoItem({
      cantidad: it.cantidad,
      precio_unitario: it.precio_unitario,
      descuento_item: it.descuento_item,
      notas: it.notas,
      nombre: it.productos?.nombre ?? it.producto?.nombre ?? "—",
    }),
  );

  const tipoComanda = normalizarTipoComanda(pedido.tipo);
  const descuento = pedido.descuento ?? 0;
  const jarrosPrometidos = pedido.jarros_prometidos ?? 0;
  const descuentoJarros = jarrosPrometidos > 0 ? descuento : 0;
  const promoLabel = pedido.promo_tipo === "trabajador" ? "PRECIO TRABAJADOR" : null;

  return {
    toma: {
      numero: pedido.numero_pedido ?? "—",
      sucursalNombre: opts.sucursalNombre,
      tipo: tipoComanda,
      cliente: pedido.cliente_nombre,
      telefono: pedido.cliente_telefono,
      direccion: pedido.direccion_entrega,
      referencia: pedido.referencia_entrega,
      tomador: opts.tomadorNombre ?? null,
      despachador: opts.despachadorNombre ?? null,
      items,
      subtotal: pedido.subtotal,
      descuento,
      costoDespacho: pedido.costo_despacho ?? 0,
      total: pedido.total,
      notas: pedido.notas,
      metodoPago: pedido.metodo_pago ?? null,
      pagoRegistrado: pedido.pago_registrado ?? false,
      montoRecibido: pedido.monto_recibido ?? null,
      promoLabel,
    },
    cocina: {
      numero: pedido.numero_pedido ?? "—",
      sucursalNombre: opts.sucursalNombre,
      tipo: tipoComanda,
      cliente: pedido.cliente_nombre,
      telefono: pedido.cliente_telefono,
      direccion: pedido.direccion_entrega,
      referencia: pedido.referencia_entrega,
      items: buildComandaCocinaItems(items),
      notas: pedido.notas,
      total: pedido.total,
      subtotal: pedido.subtotal,
      descuentoJarros,
      metodoPago: pedido.metodo_pago ?? null,
      pagoRegistrado: pedido.pago_registrado ?? false,
    },
  };
}
