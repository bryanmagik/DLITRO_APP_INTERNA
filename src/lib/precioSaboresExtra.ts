export interface ProductoParaPrecioSabor {
  nombre: string;
}

export interface SaborConPrecio {
  nombre: string;
  precio: number;
}

const NOMBRE_MOJITO_CORONA = "mojito corona";

export function normalizarNombreProducto(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("es-CL");
}

export function cobraRecargoPorSabor(producto: ProductoParaPrecioSabor): boolean {
  return normalizarNombreProducto(producto.nombre) !== NOMBRE_MOJITO_CORONA;
}

export function precioSaborParaProducto(
  producto: ProductoParaPrecioSabor,
  sabor: SaborConPrecio,
): number {
  return cobraRecargoPorSabor(producto) ? Number(sabor.precio) || 0 : 0;
}

export function precioTotalSabores(
  producto: ProductoParaPrecioSabor,
  sabores: SaborConPrecio[] | null | undefined,
): number {
  return sabores?.reduce((total, sabor) => total + precioSaborParaProducto(producto, sabor), 0) ?? 0;
}

export function precioSinSabores(
  producto: ProductoParaPrecioSabor,
  precioUnitario: number,
  sabores: SaborConPrecio[] | null | undefined,
): number {
  return Math.max(0, Number(precioUnitario) - precioTotalSabores(producto, sabores));
}

export function saboresConPrecioAplicable<T extends SaborConPrecio>(
  producto: ProductoParaPrecioSabor,
  sabores: T[] | null | undefined,
): T[] | undefined {
  return sabores?.map((sabor) => ({
    ...sabor,
    precio: precioSaborParaProducto(producto, sabor),
  }));
}
