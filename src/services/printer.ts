import { invoke, isTauri } from "@tauri-apps/api/core";
import { getPrinters, printHtml, type PrintHtmlOptions } from "tauri-plugin-printer-v2";
import { toast } from "sonner";
import {
  ANCHO,
  buildComandaCocinaHtml,
  buildComandaCocinaTexto,
  buildComandaHtml,
  buildComandaTexto,
  buildPruebaHtml,
  buildPruebaTexto,
  imprimirComanda as imprimirComandaWeb,
  imprimirComandaCocina as imprimirComandaCocinaWeb,
  type ComandaCocinaData,
  type ComandaData,
} from "@/lib/printComanda";
import {
  DEFAULT_PRINTNODE_ID_COCINA,
  DEFAULT_PRINTNODE_ID_TOMA,
  imprimirViaPrintNode,
  verificarImpresoraPrintNode,
} from "@/services/printnode";

export { ANCHO };
export { verificarImpresoraPrintNode } from "@/services/printnode";
export {
  DEFAULT_PRINTNODE_ID_COCINA,
  DEFAULT_PRINTNODE_ID_TOMA,
  PRINTNODE_ID_SLK_TS100,
} from "@/services/printnode";

const KEY_TOMA = "dlitro_impresora_toma";
const KEY_COCINA = "dlitro_impresora_cocina";
const KEY_CONFIG_TOMA = "dlitro_impresora_config_toma";
const KEY_CONFIG_COCINA = "dlitro_impresora_config_cocina";
/** IDs PrintNode (legacy, usados por configuración manual) */
const KEY_PRINTNODE_TOMA = "dlitro_printer_toma_pedidos";
const KEY_PRINTNODE_COCINA = "dlitro_printer_preparacion";
const KEY_METODO = "dlitro_impresion_metodo";
const KEY_ULTIMO_LOG = "dlitro_impresion_ultimo_log";
export const DEFAULT_IMPRESORA_TOMA = "sewoo toma de pedidos";
export const DEFAULT_IMPRESORA_COCINA = "sewoo preparacion";
/** @deprecated Usar DEFAULT_IMPRESORA_TOMA / DEFAULT_IMPRESORA_COCINA */
export const DEFAULT_IMPRESORA = DEFAULT_IMPRESORA_TOMA;

export type MetodoImpresion = "auto" | "plugin" | "raw";
export type ModoImpresora = "printnode" | "usb";
export type TipoComandaImpresion = "toma_pedidos" | "preparacion";

export interface PrinterConfig {
  modo: ModoImpresora;
  printNodeId: number;
  /** Nombre de impresora Windows para fallback USB */
  nombre: string;
}

export interface PedidoImpresion {
  toma: ComandaData;
  cocina: ComandaCocinaData;
}

export interface ResultadoImpresion {
  metodo: "printnode" | "plugin" | "raw" | "web";
  ok: boolean;
  resultado?: string;
  error?: string;
}

function defaultConfig(defaultPrintNodeId: number, nombre: string): PrinterConfig {
  return { modo: "printnode", printNodeId: defaultPrintNodeId, nombre };
}

function migrarConfigAntigua() {
  if (localStorage.getItem(KEY_TOMA) || localStorage.getItem(KEY_COCINA)) return;
  try {
    const raw = localStorage.getItem("dlitro_impresoras");
    if (!raw) return;
    const cfg = JSON.parse(raw) as { toma?: { nombre?: string }; cocina?: { nombre?: string } };
    if (cfg.toma?.nombre) localStorage.setItem(KEY_TOMA, cfg.toma.nombre);
    if (cfg.cocina?.nombre) localStorage.setItem(KEY_COCINA, cfg.cocina.nombre);
  } catch { /* ignore */ }
}

function normalizarConfig(
  parsed: Partial<PrinterConfig> & { modo?: string; ip?: string },
  defaultPrintNodeId: number,
  defaultNombre: string,
): PrinterConfig | null {
  const modoRaw = parsed.modo;
  let modo: ModoImpresora | null = null;
  if (modoRaw === "printnode" || modoRaw === "usb") modo = modoRaw;
  else if (modoRaw === "red") modo = "usb";

  if (!modo) return null;

  return {
    modo,
    printNodeId: parsed.printNodeId ?? defaultPrintNodeId,
    nombre: parsed.nombre ?? defaultNombre,
  };
}

function printNodeLegacyKey(tipo: TipoComandaImpresion): string {
  return tipo === "toma_pedidos" ? KEY_PRINTNODE_TOMA : KEY_PRINTNODE_COCINA;
}

function resolvePrintNodeId(tipo: TipoComandaImpresion, config: PrinterConfig): number {
  const legacy = localStorage.getItem(printNodeLegacyKey(tipo));
  if (legacy) {
    const id = parseInt(legacy, 10);
    if (!Number.isNaN(id) && id > 0) return id;
  }
  return config.printNodeId;
}

function loadConfig(
  key: string,
  legacyKey: string,
  printNodeLegacyKeyName: string,
  defaultPrintNodeId: number,
  defaultNombre: string,
): PrinterConfig {
  const raw = localStorage.getItem(key);
  let cfg: PrinterConfig | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<PrinterConfig> & { modo?: string };
      cfg = normalizarConfig(parsed, defaultPrintNodeId, defaultNombre);
    } catch { /* ignore */ }
  }

  if (!cfg) {
    migrarConfigAntigua();
    const nombre = localStorage.getItem(legacyKey) || defaultNombre;
    cfg = defaultConfig(defaultPrintNodeId, nombre);
  }

  const legacyId = localStorage.getItem(printNodeLegacyKeyName);
  if (legacyId) {
    const id = parseInt(legacyId, 10);
    if (!Number.isNaN(id) && id > 0) cfg.printNodeId = id;
  }

  return cfg;
}

function saveConfig(key: string, legacyKey: string, printNodeLegacyKeyName: string, config: PrinterConfig) {
  localStorage.setItem(key, JSON.stringify(config));
  localStorage.setItem(legacyKey, config.nombre);
  localStorage.setItem(printNodeLegacyKeyName, String(config.printNodeId));
}

export function getConfigImpresoraToma(): PrinterConfig {
  return loadConfig(KEY_CONFIG_TOMA, KEY_TOMA, KEY_PRINTNODE_TOMA, DEFAULT_PRINTNODE_ID_TOMA, DEFAULT_IMPRESORA_TOMA);
}

export function setConfigImpresoraToma(config: PrinterConfig) {
  saveConfig(KEY_CONFIG_TOMA, KEY_TOMA, KEY_PRINTNODE_TOMA, config);
}

export function getConfigImpresoraCocina(): PrinterConfig {
  return loadConfig(KEY_CONFIG_COCINA, KEY_COCINA, KEY_PRINTNODE_COCINA, DEFAULT_PRINTNODE_ID_COCINA, DEFAULT_IMPRESORA_COCINA);
}

export function setConfigImpresoraCocina(config: PrinterConfig) {
  saveConfig(KEY_CONFIG_COCINA, KEY_COCINA, KEY_PRINTNODE_COCINA, config);
}

export function cargarConfigImpresora(tipo: TipoComandaImpresion): PrinterConfig {
  return tipo === "toma_pedidos" ? getConfigImpresoraToma() : getConfigImpresoraCocina();
}

export function getImpresoraToma(): string {
  return getConfigImpresoraToma().nombre;
}

export function setImpresoraToma(nombre: string) {
  setConfigImpresoraToma({ ...getConfigImpresoraToma(), nombre });
}

export function getImpresoraCocina(): string {
  return getConfigImpresoraCocina().nombre;
}

export function setImpresoraCocina(nombre: string) {
  setConfigImpresoraCocina({ ...getConfigImpresoraCocina(), nombre });
}

export function getMetodoImpresion(): MetodoImpresion {
  const v = localStorage.getItem(KEY_METODO);
  if (v === "plugin" || v === "raw" || v === "auto") return v;
  if (typeof navigator !== "undefined" && navigator.userAgent.includes("Windows")) return "raw";
  return "auto";
}

export function setMetodoImpresion(metodo: MetodoImpresion) {
  localStorage.setItem(KEY_METODO, metodo);
}

export function getUltimoLogImpresion(): string | null {
  return localStorage.getItem(KEY_ULTIMO_LOG);
}

function guardarLog(entry: Record<string, unknown>) {
  const line = `[${new Date().toISOString()}] ${JSON.stringify(entry)}`;
  console.log("DLITRO impresión:", line);
  localStorage.setItem(KEY_ULTIMO_LOG, line);
}

/** Mismo envelope ESC/POS que el spooler RAW de Windows: init + texto + feed + corte. */
export function buildEscPosPayload(texto: string): Uint8Array {
  const init = new Uint8Array([0x1b, 0x40]);
  const textBytes = new TextEncoder().encode(texto);
  const feed = new Uint8Array([0x0a, 0x0a, 0x0a]);
  const cut = new Uint8Array([0x1d, 0x56, 0x00]);
  const all = new Uint8Array(init.length + textBytes.length + feed.length + cut.length);
  all.set(init, 0);
  all.set(textBytes, init.length);
  all.set(feed, init.length + textBytes.length);
  all.set(cut, init.length + textBytes.length + feed.length);
  return all;
}

function pluginPareceFallido(result: string): boolean {
  const r = result.trim().toLowerCase();
  if (!r) return true;
  return /error|fail|invalid|denied|not found|no such/.test(r);
}

async function imprimirConPlugin(html: string, impresora: string): Promise<ResultadoImpresion> {
  const config: PrintHtmlOptions = {
    id: `dlitro-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    html,
    printer: impresora,
    page_width: 80,
    remove_after_print: true,
  };

  try {
    const result = await printHtml(config);
    guardarLog({ metodo: "plugin", impresora, result });
    if (pluginPareceFallido(result)) {
      throw new Error(`Plugin retornó respuesta sospechosa: ${result}`);
    }
    return { metodo: "plugin", ok: true, resultado: result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    guardarLog({ metodo: "plugin", impresora, error: msg });
    return { metodo: "plugin", ok: false, error: msg };
  }
}

async function imprimirConRawWindows(texto: string, impresora: string): Promise<ResultadoImpresion> {
  if (!isTauri()) {
    return { metodo: "raw", ok: false, error: "RAW Windows solo disponible en Tauri" };
  }
  try {
    const result = await invoke<string>("imprimir_raw_windows", {
      printer: impresora,
      contenido: texto,
    });
    guardarLog({ metodo: "raw", impresora, bytes: texto.length, result });
    return { metodo: "raw", ok: true, resultado: result };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    guardarLog({ metodo: "raw", impresora, error: msg });
    return { metodo: "raw", ok: false, error: msg };
  }
}

async function imprimirUsbFallback(texto: string, html: string, config: PrinterConfig): Promise<ResultadoImpresion> {
  const impresora = config.nombre;

  if (!isTauri()) {
    const w = window.open("", "_blank", "width=420,height=720");
    if (!w) throw new Error("Bloqueador de pop-ups activo");
    w.document.open();
    w.document.write(html + `<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},100);};window.onafterprint=function(){window.close();};</script>`);
    w.document.close();
    return { metodo: "web", ok: true, resultado: "window.print" };
  }

  const metodo = getMetodoImpresion();
  const esWindows = navigator.userAgent.includes("Windows");

  const intentarPlugin = () => imprimirConPlugin(html, impresora);
  const intentarRaw = () => {
    if (!esWindows) {
      return Promise.resolve<ResultadoImpresion>({
        metodo: "raw",
        ok: false,
        error: "RAW Windows no disponible fuera de Windows",
      });
    }
    return imprimirConRawWindows(texto, impresora);
  };

  if (metodo === "plugin") {
    const r = await intentarPlugin();
    if (!r.ok) throw new Error(r.error ?? "Falló impresión por plugin");
    return r;
  }

  if (metodo === "raw") {
    const r = await intentarRaw();
    if (!r.ok) throw new Error(r.error ?? "Falló impresión RAW");
    return r;
  }

  const pluginResult = await intentarPlugin();
  if (pluginResult.ok) return pluginResult;

  if (esWindows) {
    const rawResult = await intentarRaw();
    if (rawResult.ok) return rawResult;
    throw new Error(`Plugin: ${pluginResult.error ?? "falló"}. RAW: ${rawResult.error ?? "falló"}`);
  }

  throw new Error(pluginResult.error ?? "Falló impresión por plugin");
}

/** Envía bytes ESC/POS vía PrintNode o fallback USB según configuración. */
export async function imprimirComandaEscPos(
  contenido: Uint8Array,
  tipo: TipoComandaImpresion,
  titulo: string = "Comanda dlitro",
  textoFallback?: string,
  htmlFallback?: string,
  configOverride?: PrinterConfig,
): Promise<void> {
  const config = configOverride ?? cargarConfigImpresora(tipo);

  if (config.modo === "printnode") {
    const printerId = resolvePrintNodeId(tipo, config);
    try {
      await imprimirViaPrintNode(printerId, contenido, titulo);
      guardarLog({ metodo: "printnode", printerId, tipo, bytes: contenido.length, titulo });
      return;
    } catch (error) {
      console.error("PrintNode falló, intentando USB:", error);
      toast.warning("PrintNode no disponible, intentando USB...");
    }
  }

  if (!textoFallback || !htmlFallback) {
    throw new Error("Faltan datos para fallback USB");
  }

  const r = await imprimirUsbFallback(textoFallback, htmlFallback, config);
  if (!r.ok) throw new Error(r.error ?? "Falló impresión USB");
}

function parseNombresImpresoraJson(raw: string): string[] {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed === "string") return [parsed];
  if (Array.isArray(parsed)) {
    return parsed
      .map((p) => {
        if (typeof p === "string") return p;
        if (p && typeof p === "object") {
          const obj = p as Record<string, unknown>;
          if (typeof obj.Name === "string") return obj.Name;
          if (typeof obj.name === "string") return obj.name;
        }
        return null;
      })
      .filter((n): n is string => Boolean(n));
  }
  if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.Name === "string") return [obj.Name];
    if (typeof obj.name === "string") return [obj.name];
  }
  return [];
}

async function listarImpresorasPlugin(): Promise<string[]> {
  const raw = await getPrinters();
  return parseNombresImpresoraJson(raw);
}

async function listarImpresorasPowerShell(): Promise<string[]> {
  const raw = await invoke<string>("listar_impresoras_windows");
  return parseNombresImpresoraJson(raw);
}

export async function listarImpresoras(): Promise<string[]> {
  if (!isTauri()) return [];

  const esWindows = navigator.userAgent.includes("Windows");
  let pluginList: string[] = [];
  let psList: string[] = [];

  try {
    pluginList = await listarImpresorasPlugin();
  } catch (e) {
    console.error("Error al listar impresoras (plugin):", e);
  }

  if (esWindows) {
    try {
      psList = await listarImpresorasPowerShell();
    } catch (e) {
      console.error("Error al listar impresoras (PowerShell):", e);
    }
  }

  const merged = [...new Set([...psList, ...pluginList])].sort((a, b) =>
    a.localeCompare(b, "es", { sensitivity: "base" }),
  );

  return merged.length > 0 ? merged : psList.length > 0 ? psList : pluginList;
}

function clonarComandaToma(d: ComandaData): ComandaData {
  return {
    ...d,
    items: d.items.map((it) => ({
      ...it,
      extras: it.extras?.map((e) => ({ ...e })),
    })),
  };
}

function clonarComandaCocina(d: ComandaCocinaData): ComandaCocinaData {
  return {
    ...d,
    items: d.items.map((it) => ({
      ...it,
      extras: it.extras?.map((e) => ({ ...e })),
    })),
  };
}

export async function imprimirComandaToma(pedido: ComandaData) {
  const texto = buildComandaTexto(pedido);
  const html = buildComandaHtml(pedido);
  const payload = buildEscPosPayload(texto);
  await imprimirComandaEscPos(
    payload,
    "toma_pedidos",
    `Comanda toma #${pedido.numero}`,
    texto,
    html,
  );
}

export async function imprimirComandaCocina(pedido: ComandaCocinaData) {
  const texto = buildComandaCocinaTexto(pedido);
  const html = buildComandaCocinaHtml(pedido);
  const payload = buildEscPosPayload(texto);
  await imprimirComandaEscPos(
    payload,
    "preparacion",
    `Comanda cocina #${pedido.numero}`,
    texto,
    html,
  );
}

export async function imprimirAmbas(pedido: PedidoImpresion): Promise<void> {
  const configToma = getConfigImpresoraToma();
  const configCocina = getConfigImpresoraCocina();

  const datosToma = clonarComandaToma(pedido.toma);
  const datosCocina = clonarComandaCocina(pedido.cocina);

  let errores = 0;

  try {
    const textoToma = buildComandaTexto(datosToma);
    const htmlToma = buildComandaHtml(datosToma);
    const bytesToma = buildEscPosPayload(textoToma);
    await imprimirComandaEscPos(
      bytesToma,
      "toma_pedidos",
      `Comanda toma #${datosToma.numero}`,
      textoToma,
      htmlToma,
      configToma,
    );
  } catch (error) {
    errores++;
    console.error("Error impresora toma pedidos:", error);
    toast.warning("Error al imprimir comanda de toma de pedidos");
  }

  try {
    const textoCocina = buildComandaCocinaTexto(datosCocina);
    const htmlCocina = buildComandaCocinaHtml(datosCocina);
    const bytesCocina = buildEscPosPayload(textoCocina);
    await imprimirComandaEscPos(
      bytesCocina,
      "preparacion",
      `Comanda cocina #${datosCocina.numero}`,
      textoCocina,
      htmlCocina,
      configCocina,
    );
  } catch (error) {
    errores++;
    console.error("Error impresora cocina:", error);
    toast.warning("Error al imprimir comanda de cocina");
  }

  if (errores === 2) {
    throw new Error("No se pudo imprimir ninguna comanda");
  }
}

export async function imprimirPrueba(rol: "Toma de Pedidos" | "Cocina", config: PrinterConfig) {
  const tipo: TipoComandaImpresion = rol === "Toma de Pedidos" ? "toma_pedidos" : "preparacion";
  const destino = config.modo === "printnode"
    ? `PrintNode #${config.printNodeId}`
    : config.nombre;
  const texto = buildPruebaTexto(rol, destino);
  const html = buildPruebaHtml(rol, destino);
  const payload = buildEscPosPayload(texto);
  await imprimirComandaEscPos(payload, tipo, `Prueba ${rol}`, texto, html, config);
}

export async function reimprimirToma(data: ComandaData) {
  if (isTauri()) await imprimirComandaToma(data);
  else imprimirComandaWeb(data);
}

export async function reimprimirCocina(data: ComandaCocinaData) {
  if (isTauri()) await imprimirComandaCocina(data);
  else imprimirComandaCocinaWeb(data);
}
