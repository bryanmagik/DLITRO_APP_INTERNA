/** Hardcodeada por ahora; mover a variable de entorno en el futuro. */
export const PRINTNODE_API_KEY = "OTlB7yh2OvgtLBOyNvID3gAGBU21DYFpHrUtNqGx8JQ";

export const DEFAULT_PRINTNODE_ID_TOMA = 75609393;
export const DEFAULT_PRINTNODE_ID_COCINA = 75609395;
/** Impresora SLK-TS100 (referencia) */
export const PRINTNODE_ID_SLK_TS100 = 75609394;

const API_BASE = "https://api.printnode.com";

function authHeader(): string {
  return `Basic ${btoa(`${PRINTNODE_API_KEY}:`)}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export interface PrintNodePrinterStatus {
  online: boolean;
  nombre?: string;
  mensaje: string;
}

export async function imprimirViaPrintNode(
  printerId: number,
  contenido: Uint8Array,
  titulo: string = "Comanda dlitro",
): Promise<void> {
  if (!printerId || printerId <= 0) {
    throw new Error("ID de impresora PrintNode inválido");
  }

  const bytes = new Uint8Array(contenido);

  const response = await fetch(`${API_BASE}/printjobs`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      printerId,
      title: titulo,
      contentType: "raw_base64",
      content: bytesToBase64(bytes),
      source: "dlitro-app",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`PrintNode error: ${response.status}${body ? ` — ${body}` : ""}`);
  }
}

export async function verificarImpresoraPrintNode(printerId: number): Promise<PrintNodePrinterStatus> {
  if (!printerId || printerId <= 0) {
    return { online: false, mensaje: "ID de impresora inválido" };
  }

  const response = await fetch(`${API_BASE}/printers/${printerId}`, {
    headers: { Authorization: authHeader() },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`No se pudo consultar la impresora (${response.status})${body ? `: ${body}` : ""}`);
  }

  const data = (await response.json()) as {
    name?: string;
    state?: string;
    computer?: { state?: string };
  };

  const state = (data.state ?? "").toLowerCase();
  const computerState = (data.computer?.state ?? "").toLowerCase();
  const online = state === "online" || computerState === "connected";

  return {
    online,
    nombre: data.name,
    mensaje: online ? "Online — lista para imprimir" : "Offline — verificar conexión",
  };
}
