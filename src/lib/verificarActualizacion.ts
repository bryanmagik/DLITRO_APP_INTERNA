import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { isTauri } from "@tauri-apps/api/core";
import { toast } from "sonner";

/**
 * Verifica actualizaciones de la app (solo build de producción Tauri).
 * No hace nada en web ni si no hay release más nueva.
 */
export async function verificarActualizacion(): Promise<void> {
  if (!isTauri()) return;

  try {
    const update = await check();
    if (!update) return;

    const body = update.body?.trim() || "Nueva versión disponible";
    const confirmado = window.confirm(
      `Nueva versión disponible: ${update.version}\n\n${body}\n\n¿Deseas actualizar ahora?`,
    );

    if (!confirmado) return;

    await update.downloadAndInstall();
    await relaunch();
  } catch (err) {
    // TEMP diagnóstico: el catch atrapaba el error sin UI (solo console.log).
    // Quitar el toast cuando se confirme la causa raíz.
    const msg =
      err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err);
    console.error("[updater] error:", err);
    toast.error(`Error al actualizar: ${msg}`);
  }
}
