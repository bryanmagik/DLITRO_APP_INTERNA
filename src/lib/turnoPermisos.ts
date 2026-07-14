import type { Rol } from "@/stores/authStore";

const ROLES_CIERRE_TURNO: Rol[] = ["encargado", "admin", "superadmin"];

/** Puede cerrar el turno quien lo abrió o roles con permiso elevado. */
export function puedeCerrarTurno(
  tomadorIdTurno: string,
  usuarioId: string | undefined,
  rol: Rol | undefined,
): boolean {
  if (!usuarioId || !rol) return false;
  if (usuarioId === tomadorIdTurno) return true;
  return ROLES_CIERRE_TURNO.includes(rol);
}
