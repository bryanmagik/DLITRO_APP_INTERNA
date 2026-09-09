import { describe, expect, it } from "vitest";
import { buildNotasClienteDeItem, comandaItemFromPedidoItem } from "@/lib/pedidoImpresion";
import {
  cobraRecargoPorSabor,
  normalizarNombreProducto,
  precioTotalSabores,
  saboresConPrecioAplicable,
} from "@/lib/precioSaboresExtra";

const sabor = { nombre: "Frambuesa", precio: 1_000 };

describe("precio de sabores extra", () => {
  it("Mojito Corona sin sabor conserva su precio base", () => {
    expect(8_000 + precioTotalSabores({ nombre: "Mojito Corona" }, [])).toBe(8_000);
  });

  it("Mojito Corona con sabor conserva su precio base y registra el sabor en la comanda", () => {
    const producto = { nombre: "Mojito Corona" };
    const notas = buildNotasClienteDeItem({ extras: [sabor] });
    const item = comandaItemFromPedidoItem({
      cantidad: 1,
      nombre: producto.nombre,
      precio_unitario: 8_000 + precioTotalSabores(producto, [sabor]),
      notas,
    });

    expect(item.precio_unitario).toBe(8_000);
    expect(notas).toContain("Frambuesa");
    expect(item.extras).toEqual([{ nombre: "Frambuesa", precio: 0 }]);
  });

  it("otro trago continúa cobrando el sabor", () => {
    expect(precioTotalSabores({ nombre: "Mojito Tradicional" }, [sabor])).toBe(1_000);
  });

  it("mantiene los recargos de otros productos al sumar varios ítems", () => {
    const total = 8_000 + precioTotalSabores({ nombre: "Mojito Corona" }, [sabor])
      + 7_000 + precioTotalSabores({ nombre: "Piña Colada" }, [sabor]);
    expect(total).toBe(16_000);
  });

  it("al editar un pedido activo no introduce el recargo en Mojito Corona", () => {
    const precioBaseGuardado = 8_000;
    const precioUnitarioRecalculado = precioBaseGuardado
      + precioTotalSabores({ nombre: "Mojito Corona" }, [sabor]);

    expect(precioUnitarioRecalculado).toBe(precioBaseGuardado);
  });

  it("usa el mismo importe correcto para subtotal, descuento, total y pago", () => {
    const precioUnitario = 8_000 + precioTotalSabores({ nombre: "Mojito Corona" }, [sabor]);
    const subtotal = precioUnitario * 2;
    const descuento = 2_000;
    const total = subtotal - descuento;
    const pagos = [5_000, 9_000];

    expect({ subtotal, descuento, total, pagos: pagos.reduce((sum, monto) => sum + monto, 0) })
      .toEqual({ subtotal: 16_000, descuento: 2_000, total: 14_000, pagos: 14_000 });
  });

  it("normaliza mayúsculas, espacios y tildes sin ampliar la excepción", () => {
    expect(normalizarNombreProducto("  MOJITO   CORONA  ")).toBe("mojito corona");
    expect(cobraRecargoPorSabor({ nombre: "  MOJITO   CORONA  " })).toBe(false);
    expect(cobraRecargoPorSabor({ nombre: "Mójito Corona" })).toBe(false);
    expect(cobraRecargoPorSabor({ nombre: "Mojito Corona Especial" })).toBe(true);
    expect(saboresConPrecioAplicable({ nombre: "Mójito Corona" }, [sabor]))
      .toEqual([{ nombre: "Frambuesa", precio: 0 }]);
  });
});
