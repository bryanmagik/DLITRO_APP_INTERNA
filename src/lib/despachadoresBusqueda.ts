import { supabase } from "@/integrations/supabase/client";

export interface DespachadorBusqueda {
  id: string;
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
  rut: string | null;
  telefono: string | null;
  sucursal_nombre: string | null;
  turnoActivoId: string | null;
  turnoActivoSucursal: string | null;
  ocupado: boolean;
}

type DespachadorRow = {
  id: string;
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
  rut: string | null;
  telefono: string | null;
  sucursales: { nombre: string } | null;
  turno_despachadores: Array<{
    activo: boolean | null;
    turno_id: string;
    turnos: {
      id: string;
      estado: string;
      sucursales: { nombre: string } | null;
    } | null;
  }> | null;
};

export function nombreDespachador(
  d: Pick<DespachadorBusqueda, "nombre" | "apellido" | "nombre_completo">,
): string {
  return d.nombre_completo?.trim()
    || [d.nombre, d.apellido].filter(Boolean).join(" ").trim()
    || d.nombre;
}

export function normalizarBusquedaDespachador(s: string): string {
  return s.toLowerCase().replace(/[.\-\s]/g, "");
}

function parseDespachador(row: DespachadorRow): DespachadorBusqueda {
  const turnoActivo = row.turno_despachadores?.find(
    (td) => td.activo === true && td.turnos?.estado === "abierto",
  );
  return {
    id: row.id,
    nombre: row.nombre,
    apellido: row.apellido,
    nombre_completo: row.nombre_completo,
    rut: row.rut,
    telefono: row.telefono,
    sucursal_nombre: row.sucursales?.nombre ?? null,
    turnoActivoId: turnoActivo?.turno_id ?? turnoActivo?.turnos?.id ?? null,
    turnoActivoSucursal: turnoActivo?.turnos?.sucursales?.nombre ?? null,
    ocupado: !!turnoActivo,
  };
}

export async function fetchDespachadoresGlobales(): Promise<{
  data: DespachadorBusqueda[];
  error: string | null;
}> {
  const { data, error } = await supabase
    .from("usuarios")
    .select(`
      id, nombre, apellido, nombre_completo, rut, telefono,
      sucursales(nombre),
      turno_despachadores(
        activo,
        turno_id,
        turnos(estado, id, sucursales(nombre))
      )
    `)
    .eq("rol", "despachador")
    .eq("activo", true)
    .order("nombre");

  if (error) return { data: [], error: error.message };
  return {
    data: ((data as DespachadorRow[]) ?? []).map(parseDespachador),
    error: null,
  };
}

/** Bloqueado si tiene turno activo abierto en otra jornada (no el turno actual). */
export function estaBloqueadoDespachador(
  d: DespachadorBusqueda,
  opts?: { turnoIdActual?: string },
): boolean {
  if (!d.ocupado) return false;
  if (opts?.turnoIdActual && d.turnoActivoId === opts.turnoIdActual) return false;
  return true;
}

export function filtrarDespachadoresBusqueda(
  list: DespachadorBusqueda[],
  query: string,
  excluirIds: Set<string>,
): DespachadorBusqueda[] {
  const q = query.trim();
  if (!q) return [];
  const qNorm = normalizarBusquedaDespachador(q);
  const qLower = q.toLowerCase();
  return list
    .filter((d) => {
      if (excluirIds.has(d.id)) return false;
      const nombre = nombreDespachador(d).toLowerCase();
      const rut = normalizarBusquedaDespachador(d.rut ?? "");
      return (
        nombre.includes(qLower)
        || (d.apellido?.toLowerCase().includes(qLower) ?? false)
        || rut.includes(qNorm)
      );
    })
    .slice(0, 12);
}
