import { describe, expect, it } from "vitest";
import { filtrarUsuarios, normalizarBusqueda, type UsuarioBuscable } from "./usuariosBusqueda";

type UsuarioPrueba = UsuarioBuscable & { id: string };

const usuarios: UsuarioPrueba[] = [
  {
    id: "1",
    nombre: "jperez",
    apellido: "Pérez",
    nombre_completo: "José Pérez",
    rol: "tomador_pedidos",
    sucursal_id: "centro",
  },
  {
    id: "2",
    nombre: "maria",
    apellido: "Soto",
    nombre_completo: null,
    rol: "admin",
    sucursal_id: null,
  },
];

const roles: Record<string, string> = {
  tomador_pedidos: "Tomador de pedidos",
  admin: "Admin",
};

const sucursales: Record<string, string> = { centro: "Sucursal Centro" };

const buscar = (termino: string) =>
  filtrarUsuarios(
    usuarios,
    termino,
    (rol) => roles[rol] ?? rol,
    (id) => (id ? sucursales[id] ?? "" : ""),
  ).map((usuario) => usuario.id);

describe("normalizarBusqueda", () => {
  it("ignora mayúsculas, diacríticos y espacios accidentales", () => {
    expect(normalizarBusqueda("  JOSÉ   PÉREZ  ")).toBe("jose perez");
  });
});

describe("filtrarUsuarios", () => {
  it.each([
    ["jose perez", ["1"]],
    ["JPEREZ", ["1"]],
    ["tomador de pedidos", ["1"]],
    ["sucursal centro", ["1"]],
    ["  MARIA   SOTO ", ["2"]],
    ["administrador inexistente", []],
  ])("filtra '%s' por los campos soportados", (termino, idsEsperados) => {
    expect(buscar(termino as string)).toEqual(idsEsperados);
  });

  it("devuelve el listado original cuando la consulta sólo contiene espacios", () => {
    expect(buscar("   ")).toEqual(["1", "2"]);
  });
});
