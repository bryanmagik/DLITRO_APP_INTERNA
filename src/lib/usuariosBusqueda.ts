export interface UsuarioBuscable {
  nombre: string;
  apellido: string | null;
  nombre_completo: string | null;
  rol: string;
  sucursal_id: string | null;
}

export function normalizarBusqueda(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-CL");
}

export function filtrarUsuarios<T extends UsuarioBuscable>(
  usuarios: T[],
  termino: string,
  rolLabel: (rol: T["rol"]) => string,
  sucursalNombre: (id: string | null) => string,
): T[] {
  const consulta = normalizarBusqueda(termino);
  if (!consulta) return usuarios;

  return usuarios.filter((usuario) => {
    const nombreCompleto =
      usuario.nombre_completo || [usuario.nombre, usuario.apellido].filter(Boolean).join(" ");
    const contenido = normalizarBusqueda(
      [
        nombreCompleto,
        usuario.nombre,
        usuario.rol,
        rolLabel(usuario.rol),
        usuario.sucursal_id ? sucursalNombre(usuario.sucursal_id) : "",
      ].join(" "),
    );

    return contenido.includes(consulta);
  });
}
