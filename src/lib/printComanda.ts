export function formatSaborExtra(nombre: string): string {
  return nombre.replace(/^Pulpa de /i, "");
}

export type ComandaCocinaTipo = "despacho" | "retiro" | "local" | "delivery" | "uber" | "rappi" | "puerta";

/** Normaliza aliases (delivery→despacho, local→retiro) y tipos externos. */
export function normalizarTipoComanda(tipo: string | null | undefined): ComandaCocinaTipo {
  switch (tipo) {
    case "delivery":
      return "despacho";
    case "local":
      return "retiro";
    case "despacho":
    case "retiro":
    case "uber":
    case "rappi":
    case "puerta":
      return tipo;
    default:
      return "retiro";
  }
}

export interface ComandaItem {
  cantidad: number;
  nombre: string;
  precio_unitario: number;
  extras?: { nombre: string; precio: number }[];
  notas?: string;
  esRegalo?: boolean;
  esPromoJarros?: boolean;
  notaPromo?: string;
  precioOriginal?: number;
  marker?: "nuevo" | "cancelado";
}

export interface ComandaData {
  numero: number | string;
  sucursalNombre: string;
  tipo: ComandaCocinaTipo;
  cliente: string;
  telefono?: string | null;
  direccion?: string | null;
  referencia?: string | null;
  tomador?: string | null;
  despachador?: string | null;
  items: ComandaItem[];
  subtotal: number;
  descuento: number;
  costoDespacho: number;
  total: number;
  promoLabel?: string | null;
  notas?: string | null;
  metodoPago?: string | null;
  pagoRegistrado?: boolean;
  montoRecibido?: number | null;
  editado?: boolean;
}

export const ANCHO = 42;
const ANCHO_DOBLE_ANCHO = Math.floor(ANCHO / 2);
const SEP = "=".repeat(ANCHO);
const SUB = "-".repeat(ANCHO);
const FEED_PAPEL = "\n\n\n\n\n";

/** Comandos ESC/POS para tamaño de letra */
const DOBLE_TAMAÑO = "\x1B\x21\x30";
const DOBLE_ALTO = "\x1B\x21\x10";
/** Solo doble alto (sin doble ancho) — 42 columnas en comanda cocina */
const SOLO_DOBLE_ALTO = "\x1B\x21\x10";
const NORMAL = "\x1B\x21\x00";

function pushSeccion(dest: string[], modo: string, lineas: string[]) {
  if (lineas.length === 0) return;
  dest.push(modo + lineas.join("\n") + NORMAL);
}

/** Solo ASCII imprimible: sin emojis, tildes ni caracteres especiales */
export function toAscii(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ñ/g, "n")
    .replace(/Ñ/g, "N")
    .replace(/[^\x20-\x7E]/g, "");
}

function centrar(texto: string, ancho: number = ANCHO): string {
  const t = toAscii(texto);
  if (t.length >= ancho) return t.slice(0, ancho);
  const espacios = Math.max(0, Math.floor((ancho - t.length) / 2));
  return " ".repeat(espacios) + t;
}

function alinearDerecha(izq: string, der: string, ancho: number = ANCHO): string {
  const l = toAscii(izq);
  const r = toAscii(der);
  if (l.length + r.length >= ancho) {
    const maxL = Math.max(1, ancho - r.length - 1);
    return l.slice(0, maxL) + " " + r;
  }
  const espacios = ancho - l.length - r.length;
  return l + " ".repeat(Math.max(1, espacios)) + r;
}

function bloqueNumeroPedido(numero: number | string, editado?: boolean, ancho: number = ANCHO): string[] {
  const suf = editado ? " (MOD)" : "";
  return ["", centrar(`>>>>>>  PEDIDO #${numero}${suf}  <<<<`, ancho), ""];
}

function finalizarComanda(lineas: string[]): string {
  return lineas.join("\n") + FEED_PAPEL;
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(n);

function fmtPrecio(n: number): string {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n));
  const cuerpo = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return neg ? `-$${cuerpo}` : `$${cuerpo}`;
}

function labelMetodoPago(m?: string | null): string | null {
  if (!m) return null;
  const map: Record<string, string> = {
    efectivo: "EFECTIVO",
    transferencia: "TRANSFERENCIA",
    tarjeta: "TARJETA",
    mixto: "MIXTO",
  };
  return map[m] ?? toAscii(m).toUpperCase();
}

function bloquePagoComandaToma(d: ComandaData): string[] {
  const metodo = labelMetodoPago(d.metodoPago);
  if (!metodo) return [];

  const out: string[] = [SUB];
  if (d.pagoRegistrado) {
    out.push(`OK PAGADO: ${metodo}`);
  } else {
    out.push(`PAGO ESPERADO: ${metodo}`);
  }
  return out;
}

function bloquePagoComandaHtml(d: ComandaData): string {
  const metodo = labelMetodoPago(d.metodoPago);
  if (!metodo) return "";
  if (d.pagoRegistrado) {
    return `<pre>${SUB}
✓ PAGADO: ${escapeHtml(metodo)}
${SUB}</pre>`;
  }
  return `<pre>${SUB}
PAGO ESPERADO: ${escapeHtml(metodo)}
${SUB}</pre>`;
}

function fechaHoraAscii(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const y = now.getFullYear();
  const h = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");
  return `${d}/${m}/${y}  ${h}:${min}`;
}

function lineaEtiqueta(etiqueta: string, valor: string, ancho: number = ANCHO): string[] {
  const pref = `${etiqueta}: `;
  const v = toAscii(valor);
  if (pref.length + v.length <= ancho) return [pref + v];
  const out: string[] = [pref + v.slice(0, ancho - pref.length)];
  let rest = v.slice(ancho - pref.length);
  while (rest.length > 0) {
    out.push(" " + rest.slice(0, ancho - 1));
    rest = rest.slice(ancho - 1);
  }
  return out;
}

function lineaItemConPrecio(cant: number, nombre: string, precio: string, width = ANCHO): string[] {
  const prefix = `  ${cant}x `;
  const name = toAscii(nombre);
  const price = toAscii(precio);
  const full = prefix + name;
  if (full.length + 1 + price.length <= width) return [alinearDerecha(full, price, width)];
  const out: string[] = [];
  let rest = name;
  let first = true;
  while (rest.length > 0) {
    const p = first ? prefix : "     ";
    first = false;
    const maxName = width - p.length;
    const chunk = rest.slice(0, maxName);
    rest = rest.slice(maxName);
    if (rest.length === 0 && p.length + chunk.length + 1 + price.length <= width) {
      out.push(alinearDerecha(p + chunk, price, width));
    } else {
      out.push(p + chunk);
    }
  }
  if (!out[out.length - 1].includes(price)) {
    out.push(alinearDerecha("", price, width));
  }
  return out;
}

function lineaItemCocina(cant: number, nombre: string, width = ANCHO): string[] {
  const prefix = `  ${cant}x `;
  const name = toAscii(nombre).toUpperCase();
  const full = prefix + name;
  if (full.length <= width) return [full];
  const out: string[] = [];
  let rest = name;
  let first = true;
  while (rest.length > 0) {
    const p = first ? prefix : "     ";
    first = false;
    const maxName = width - p.length;
    out.push(p + rest.slice(0, maxName));
    rest = rest.slice(maxName);
  }
  return out;
}

function lineaExtra(nombre: string, precio?: string, width = ANCHO): string[] {
  const pref = "    + ";
  const name = toAscii(nombre);
  if (precio) {
    const full = pref + name;
    const p = toAscii(precio);
    if (full.length + 1 + p.length <= width) return [alinearDerecha(full, p, width)];
    return [pref + name.slice(0, width - pref.length), ...lineaExtra(name.slice(width - pref.length), precio, width)];
  }
  if (pref.length + name.length <= width) return [pref + name];
  const out: string[] = [];
  let rest = name;
  let first = true;
  while (rest.length > 0) {
    const p = first ? pref : "      ";
    first = false;
    out.push(p + rest.slice(0, width - p.length));
    rest = rest.slice(width - p.length);
  }
  return out;
}

function lineaNotaItem(texto: string, prefijo: string, width = ANCHO): string[] {
  const t = toAscii(texto);
  if (!t) return [];
  if (prefijo.length + t.length <= width) return [prefijo + t];
  const out: string[] = [];
  let rest = t;
  let first = true;
  while (rest.length > 0) {
    const p = first ? prefijo : "    ";
    first = false;
    out.push(p + rest.slice(0, width - p.length));
    rest = rest.slice(width - p.length);
  }
  return out;
}

export const PROMO_JARROS_ETIQUETA = "[PROMO JARROS]";

function lineasPromoItem(it: ComandaItem, prefijo = "  ", width = ANCHO): string[] {
  const out: string[] = [];
  if (it.esPromoJarros) {
    out.push(...lineaNotaItem(PROMO_JARROS_ETIQUETA, prefijo, width));
  }
  if (it.notaPromo) {
    let rest = toAscii(it.notaPromo);
    while (rest.length > 0) {
      out.push(prefijo + rest.slice(0, width - prefijo.length));
      rest = rest.slice(width - prefijo.length);
    }
  }
  return out;
}

function lineasNotasClienteItem(it: ComandaItem, prefijo = "  Nota: ", prefijoCocina = "  >> ", width = ANCHO, cocina = false): string[] {
  if (!it.notas?.trim()) return [];
  return lineaNotaItem(it.notas.trim(), cocina ? prefijoCocina : prefijo, width);
}

function tipoLabelTexto(tipo: ComandaCocinaTipo | string): string {
  // ESC/POS: sin emoji (toAscii los elimina). Uber/Rappi con brackets para que destaquen.
  switch (normalizarTipoComanda(tipo)) {
    case "despacho":
    case "delivery":
      return "*** DESPACHO ***";
    case "uber":
      return "[UBER EATS]";
    case "rappi":
      return "[RAPPI]";
    case "puerta":
      return "*** PUERTA ***";
    case "retiro":
    case "local":
    default:
      return "*** RETIRO ***";
  }
}

function tipoLabelHtml(tipo: ComandaCocinaTipo | string): string {
  switch (normalizarTipoComanda(tipo)) {
    case "despacho":
    case "delivery":
      return "DESPACHO 🛵";
    case "uber":
      return "🟠 UBER EATS";
    case "rappi":
      return "🔴 RAPPI";
    case "puerta":
      return "PUERTA 🚪";
    case "retiro":
    case "local":
    default:
      return "RETIRO 🏪";
  }
}

function cocinaEncabezadoTipo(tipo: ComandaCocinaTipo | string): string {
  return tipoLabelTexto(tipo);
}

function cocinaEsExterno(tipo: ComandaCocinaTipo | string): boolean {
  const t = normalizarTipoComanda(tipo);
  return t === "uber" || t === "rappi";
}

function cocinaEsDespacho(tipo: ComandaCocinaTipo | string): boolean {
  return normalizarTipoComanda(tipo) === "despacho";
}

function bloqueEncabezadoCocina(d: ComandaCocinaData): { detalle: string[] } {
  const detalle: string[] = [SUB];
  if (!cocinaEsExterno(d.tipo)) {
    if (d.telefono?.trim()) detalle.push(...lineaEtiqueta("TEL", d.telefono.trim()));
    if (cocinaEsDespacho(d.tipo)) {
      if (d.direccion?.trim()) detalle.push(...lineaEtiqueta("DIR", d.direccion.trim()));
      if (d.referencia?.trim()) detalle.push(...lineaEtiqueta("REF", d.referencia.trim()));
    }
  }
  detalle.push(SEP);
  return { detalle };
}

function headerSucursal(sucursal: string): string[] {
  return [SEP, centrar(`DLITRO - ${toAscii(sucursal)}`), SEP];
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildComandaTexto(d: ComandaData): string {
  const bloques: string[] = [
    ...headerSucursal(d.sucursalNombre),
  ];

  pushSeccion(bloques, DOBLE_TAMAÑO, bloqueNumeroPedido(d.numero, d.editado, ANCHO_DOBLE_ANCHO));

  bloques.push(SEP);
  pushSeccion(bloques, DOBLE_ALTO, [centrar(tipoLabelTexto(d.tipo))]);
  bloques.push(SEP);

  pushSeccion(bloques, DOBLE_ALTO, lineaEtiqueta("CLIENTE", d.cliente));

  if (d.telefono) bloques.push(...lineaEtiqueta("TEL", d.telefono));
  if (cocinaEsDespacho(d.tipo) && d.direccion) bloques.push(...lineaEtiqueta("DIR", d.direccion));
  if (cocinaEsDespacho(d.tipo) && d.referencia) bloques.push(...lineaEtiqueta("REF", d.referencia));
  if (d.despachador) bloques.push(...lineaEtiqueta("DESPA", d.despachador));

  bloques.push(SEP, "PRODUCTOS:");

  const lineasItems: string[] = [];
  for (const it of d.items) {
    const tag = it.marker === "nuevo" ? " (NUEVO)" : it.marker === "cancelado" ? " (CANCELADO)" : "";
    const promoPrecioTag =
      it.precioOriginal != null && it.precio_unitario < it.precioOriginal ? " (PROMO)" : "";
    const nombre = it.nombre + promoPrecioTag + tag;
    const precio =
      it.marker === "cancelado" ? "---" : it.esRegalo ? "GRATIS" : fmtPrecio(it.precio_unitario * it.cantidad);
    lineasItems.push(...lineaItemConPrecio(it.cantidad, nombre, precio));
    if (it.extras?.length) {
      for (const e of it.extras) {
        lineasItems.push(...lineaExtra(formatSaborExtra(e.nombre), fmtPrecio(e.precio * it.cantidad)));
      }
    }
    lineasItems.push(...lineasPromoItem(it));
    lineasItems.push(...lineasNotasClienteItem(it));
    if (it.precioOriginal != null && it.precio_unitario < it.precioOriginal) {
      const normalLine = `  Precio normal: ${fmtPrecio(it.precioOriginal)}`;
      lineasItems.push(normalLine.length <= ANCHO ? normalLine : normalLine.slice(0, ANCHO));
    }
  }
  pushSeccion(bloques, DOBLE_ALTO, lineasItems);

  bloques.push(
    SUB,
    alinearDerecha("SUBTOTAL:", fmtPrecio(d.subtotal)),
  );
  if (d.costoDespacho > 0) bloques.push(alinearDerecha("DESPACHO:", fmtPrecio(d.costoDespacho)));
  if (d.descuento > 0) bloques.push(alinearDerecha("DESCUENTO:", fmtPrecio(-d.descuento)));
  bloques.push(SEP);
  pushSeccion(bloques, DOBLE_TAMAÑO, [alinearDerecha("TOTAL:", fmtPrecio(d.total), ANCHO_DOBLE_ANCHO)]);
  bloques.push(SEP);

  if (d.promoLabel) {
    bloques.push(centrar(toAscii(d.promoLabel)), SEP);
  }
  if (d.notas) {
    for (const l of lineaEtiqueta("NOTA", d.notas)) bloques.push(l);
    bloques.push(SEP);
  }

  const pago = bloquePagoComandaToma(d);
  if (pago.length > 0) {
    bloques.push(...pago);
    bloques.push(SEP);
  }

  bloques.push(centrar(fechaHoraAscii()), SEP);
  return finalizarComanda(bloques);
}

export function buildComandaHtml(d: ComandaData): string {
  const sep = SEP;
  const sub = SUB;
  const tipoLabel = tipoLabelHtml(d.tipo);

  const lineasItems: string[] = [];
  for (const it of d.items) {
    const tag = it.marker === "nuevo" ? " (NUEVO)" : it.marker === "cancelado" ? " (CANCELADO)" : "";
    const promoPrecioTag =
      it.precioOriginal != null && it.precio_unitario < it.precioOriginal ? " (PROMO)" : "";
    const label = `${it.cantidad}x ${it.nombre}${promoPrecioTag}${tag}`;
    const monto = it.marker === "cancelado" ? "—" : it.esRegalo ? "GRATIS" : fmt(it.precio_unitario * it.cantidad);
    lineasItems.push(alinearDerecha("  " + label, monto));
    if (it.extras && it.extras.length > 0) {
      for (const e of it.extras) {
        lineasItems.push(alinearDerecha("    + " + formatSaborExtra(e.nombre), fmt(e.precio * it.cantidad)));
      }
    }
    if (it.esPromoJarros) lineasItems.push("    " + PROMO_JARROS_ETIQUETA);
    if (it.notaPromo) lineasItems.push("    " + it.notaPromo);
    if (it.notas?.trim()) lineasItems.push("    Nota: " + it.notas.trim());
    if (it.precioOriginal != null && it.precio_unitario < it.precioOriginal) {
      lineasItems.push("    Precio normal: " + fmt(it.precioOriginal));
    }
  }

  const ahora = new Date().toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });

  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Comanda #${d.numero}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; margin: 0; padding: 8px; font-size: 12px; line-height: 1.35; }
  .center { text-align: center; }
  .num { font-size: 64px; font-weight: 900; line-height: 1; margin: 6px 0; letter-spacing: 2px; }
  .tipo { font-size: 22px; font-weight: 900; margin: 8px 0; letter-spacing: 1px; }
  pre { white-space: pre; font-family: inherit; font-size: 12px; margin: 0; }
  .header { font-weight: 900; font-size: 14px; }
  .total { font-size: 16px; font-weight: 900; }
  .promo { font-weight: 700; }
</style></head>
<body>
<pre>${sep}</pre>
<div class="center header">DLITRO — ${escapeHtml(d.sucursalNombre)}</div>
<pre>${sep}</pre>
<div class="center num">#${d.numero}${d.editado ? ' <span style="font-size:22px;font-weight:900;">(MODIFICADO)</span>' : ''}</div>
<div class="center tipo">${tipoLabel}</div>
<pre>${sep}
CLIENTE: ${escapeHtml(d.cliente)}
${d.telefono ? "TEL: " + escapeHtml(d.telefono) + "\n" : ""}${cocinaEsDespacho(d.tipo) && d.direccion ? "DIR: " + escapeHtml(d.direccion) + "\n" : ""}${cocinaEsDespacho(d.tipo) && d.referencia ? "REF: " + escapeHtml(d.referencia) + "\n" : ""}${d.tomador ? "TOMA: " + escapeHtml(d.tomador) + "\n" : ""}${d.despachador ? "DESPA: " + escapeHtml(d.despachador) + "\n" : ""}${sep}
PRODUCTOS:
${lineasItems.map(escapeHtml).join("\n")}
${sub}
${alinearDerecha("SUBTOTAL:", fmt(d.subtotal))}
${d.costoDespacho > 0 ? alinearDerecha("DESPACHO:", fmt(d.costoDespacho)) + "\n" : ""}${d.descuento > 0 ? alinearDerecha("DESCUENTO:", "-" + fmt(d.descuento)) + "\n" : ""}${sep}</pre>
<pre class="total">${alinearDerecha("TOTAL:", fmt(d.total))}</pre>
<pre>${sep}</pre>
${d.promoLabel ? `<div class="center promo">${escapeHtml(d.promoLabel)}</div><pre>${sep}</pre>` : ""}
${d.notas ? `<pre>${escapeHtml(d.notas)}</pre><pre>${sep}</pre>` : ""}
${bloquePagoComandaHtml(d)}
<div class="center">${escapeHtml(ahora)}</div>
<pre>${sep}</pre>
</body></html>`;
}

export function imprimirComanda(d: ComandaData) {
  const html = buildComandaHtml(d);
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  w.document.open();
  w.document.write(html + `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},100);};window.onafterprint=function(){window.close();};</script>`);
  w.document.close();
}

export interface ComandaCocinaData {
  numero: number | string;
  sucursalNombre?: string;
  tipo: ComandaCocinaTipo;
  cliente: string;
  telefono?: string | null;
  direccion?: string | null;
  referencia?: string | null;
  items: { cantidad: number; nombre: string; extras?: { nombre: string }[]; notas?: string; esRegalo?: boolean; esPromoJarros?: boolean; notaPromo?: string; marker?: "nuevo" | "cancelado" }[];
  notas?: string | null;
  editado?: boolean;
  /** Total a cobrar (omitido en Uber/Rappi). */
  total?: number | null;
  subtotal?: number | null;
  /** Descuento por jarros retornables; si > 0 se muestra el desglose. */
  descuentoJarros?: number | null;
  metodoPago?: string | null;
  pagoRegistrado?: boolean | null;
}

/** Bloque TOTAL / pago para comanda cocina (ASCII, 42 cols). No usar en Uber/Rappi. */
function bloquePagoCocina(d: ComandaCocinaData): string[] {
  if (cocinaEsExterno(d.tipo)) return [];
  if (d.total == null || !Number.isFinite(Number(d.total))) return [];

  const total = Number(d.total);
  const subtotal = d.subtotal != null && Number.isFinite(Number(d.subtotal)) ? Number(d.subtotal) : null;
  const descJarros = d.descuentoJarros != null && Number(d.descuentoJarros) > 0 ? Number(d.descuentoJarros) : 0;
  const metodo = labelMetodoPago(d.metodoPago);

  const out: string[] = [SEP];
  if (descJarros > 0 && subtotal != null) {
    out.push(alinearDerecha("SUBTOTAL:", fmtPrecio(subtotal)));
    out.push(alinearDerecha("DESCUENTO JARROS:", fmtPrecio(-descJarros)));
  }
  out.push(alinearDerecha("TOTAL:", fmtPrecio(total)));
  if (d.pagoRegistrado) {
    out.push(toAscii(metodo ? `YA PAGADO - ${metodo}` : "YA PAGADO"));
  } else {
    out.push(toAscii(`PAGO: ${metodo ?? "POR DEFINIR"}`));
  }
  out.push(SEP);
  return out;
}

export function buildComandaCocinaTexto(d: ComandaCocinaData): string {
  const bloques: string[] = [
    ...headerSucursal(d.sucursalNombre ?? ""),
  ];

  pushSeccion(bloques, DOBLE_TAMAÑO, bloqueNumeroPedido(d.numero, d.editado, ANCHO_DOBLE_ANCHO));
  pushSeccion(bloques, SOLO_DOBLE_ALTO, [centrar(cocinaEncabezadoTipo(d.tipo))]);
  bloques.push(...bloqueEncabezadoCocina(d).detalle);

  for (const it of d.items) {
    const tag = it.marker === "nuevo" ? " (NUEVO)" : it.marker === "cancelado" ? " (CANCELADO)" : "";
    const regalo = it.esRegalo ? " (REGALO)" : "";
    pushSeccion(bloques, SOLO_DOBLE_ALTO, lineaItemCocina(it.cantidad, it.nombre + regalo + tag, ANCHO));

    const detalleItem: string[] = [];
    if (it.extras?.length) {
      for (const e of it.extras) {
        detalleItem.push(...lineaExtra(formatSaborExtra(e.nombre).toUpperCase(), undefined, ANCHO));
      }
    }
    if (it.esPromoJarros) {
      detalleItem.push(...lineaNotaItem(PROMO_JARROS_ETIQUETA, "  ", ANCHO));
    } else if (it.notaPromo) {
      detalleItem.push(...lineaNotaItem(it.notaPromo, "  ", ANCHO));
    }
    if (it.notas?.trim()) {
      detalleItem.push(...lineaNotaItem(it.notas.trim(), "  >> ", ANCHO));
    }
    if (detalleItem.length > 0) bloques.push(...detalleItem);

    bloques.push(SUB);
  }

  bloques.push(...bloquePagoCocina(d));

  bloques.push(SEP, ...lineaEtiqueta("CLIENTE", d.cliente));
  if (d.notas) bloques.push(...lineaEtiqueta("NOTA", d.notas));
  bloques.push(SEP, centrar(fechaHoraAscii()), SEP);

  return finalizarComanda(bloques);
}

export function buildComandaCocinaHtml(d: ComandaCocinaData): string {
  const sep = SEP;
  const sub = SUB;
  const suf = d.editado ? " (MOD.)" : "";
  const tipoLabel = tipoLabelHtml(d.tipo);
  const contacto: string[] = [];
  if (!cocinaEsExterno(d.tipo)) {
    if (d.telefono?.trim()) contacto.push(`TEL: ${escapeHtml(d.telefono.trim())}`);
    if (cocinaEsDespacho(d.tipo)) {
      if (d.direccion?.trim()) contacto.push(`DIR: ${escapeHtml(d.direccion.trim())}`);
      if (d.referencia?.trim()) contacto.push(`REF: ${escapeHtml(d.referencia.trim())}`);
    }
  }
  const lineas: string[] = [];
  for (const it of d.items) {
    const tag = it.marker === "nuevo" ? "  (NUEVO)" : it.marker === "cancelado" ? "  (CANCELADO)" : "";
    lineas.push(`  ${it.cantidad}x ${it.nombre}${it.esRegalo ? "  (REGALO)" : ""}${tag}`);
    if (it.extras?.length) for (const e of it.extras) lineas.push(`    + ${formatSaborExtra(e.nombre)}`);
    if (it.esPromoJarros) lineas.push(`    ${PROMO_JARROS_ETIQUETA}`);
    else if (it.notaPromo) lineas.push(`    ${it.notaPromo}`);
    if (it.notas?.trim()) lineas.push(`    >> ${it.notas.trim()}`);
    lineas.push(SUB);
  }
  const ahora = new Date().toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>Cocina #${d.numero}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', Courier, monospace; color: #000; background: #fff; margin: 0; padding: 8px; font-size: 16px; line-height: 1.4; font-weight: 700; }
  .center { text-align: center; }
  .num { font-size: 96px; font-weight: 900; line-height: 1; margin: 8px 0; letter-spacing: 3px; }
  .tipo { font-size: 28px; font-weight: 900; margin: 10px 0; letter-spacing: 2px; }
  pre { white-space: pre; font-family: inherit; font-size: 16px; margin: 0; font-weight: 700; }
  .cli { font-size: 18px; font-weight: 900; }
  .nota { font-size: 16px; font-weight: 700; }
</style></head>
<body>
<pre>${sep}</pre>
<div class="center num">#${d.numero}${suf}</div>
<div class="center tipo">PEDIDO #${d.numero}${suf} — ${escapeHtml(tipoLabel)}</div>
<pre>${sub}
${contacto.map(escapeHtml).join("\n")}
${sep}</pre>
<pre>${lineas.map(escapeHtml).join("\n")}</pre>
${bloquePagoCocina(d).map((l) => `<pre>${escapeHtml(l)}</pre>`).join("\n")}
<pre>${sep}</pre>
<div class="cli">Cliente: ${escapeHtml(d.cliente)}</div>
${d.notas ? `<div class="nota">Nota: ${escapeHtml(d.notas)}</div>` : ""}
<pre>${sep}</pre>
<div class="center">${escapeHtml(ahora)}</div>
<pre>${sep}</pre>
</body></html>`;
}

export function imprimirComandaCocina(d: ComandaCocinaData) {
  const html = buildComandaCocinaHtml(d);
  const w = window.open("", "_blank", "width=420,height=720");
  if (!w) return;
  w.document.open();
  w.document.write(html + `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},100);};window.onafterprint=function(){window.close();};</script>`);
  w.document.close();
}

export function buildPruebaTexto(rol: string, nombreImpresora: string): string {
  return finalizarComanda([
    SEP,
    centrar("PRUEBA"),
    centrar(toAscii(rol)),
    centrar(toAscii(nombreImpresora || "(sin nombre)")),
    SEP,
    centrar(fechaHoraAscii()),
    SEP,
  ]);
}

export function buildPruebaHtml(rol: string, nombreImpresora: string): string {
  const ahora = new Date().toLocaleString("es-CL");
  return `<!doctype html><html><head><meta charset="utf-8"/><title>Prueba ${rol}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { font-family: 'Courier New', monospace; padding: 8px; font-size: 14px; }
  .center { text-align: center; }
  .big { font-size: 32px; font-weight: 900; margin: 12px 0; }
  pre { white-space: pre; margin: 0; }
</style></head><body>
<pre>${SEP}</pre>
<div class="center big">PRUEBA</div>
<div class="center">Impresora ${rol}</div>
<div class="center">${escapeHtml(nombreImpresora || "(sin nombre)")}</div>
<pre>${SEP}</pre>
<div class="center">${escapeHtml(ahora)}</div>
<pre>${SEP}</pre>
</body></html>`;
}
