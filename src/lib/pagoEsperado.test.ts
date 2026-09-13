import { describe, expect, it } from "vitest";
import {
  buildPagoEsperadoDetalle,
  pagoEsperadoColumns,
  pagoEsperadoDetalleFromPedido,
  parseMontoPagoEsperado,
  validarPagoEsperadoMixto,
} from "@/lib/pagoEsperado";
import { buildComandaCocinaTexto, buildComandaTexto } from "@/lib/printComanda";

const montos = { efectivo: 5000, transferencia: 0, tarjeta: 7000 };

describe("pago esperado", () => {
  it("mantiene opcional la selección y asigna el total completo a un método único", () => {
    expect(buildPagoEsperadoDetalle([], montos, 12000)).toEqual([]);
    expect(buildPagoEsperadoDetalle(["efectivo"], montos, 12000))
      .toEqual([{ metodo: "efectivo", monto: 12000 }]);
    expect(validarPagoEsperadoMixto([], montos, 12000)).toBeNull();
  });

  it("exige montos positivos que cuadren exactamente en un pago mixto", () => {
    expect(validarPagoEsperadoMixto(["efectivo", "tarjeta"], montos, 12000)).toBeNull();
    expect(validarPagoEsperadoMixto(["efectivo", "tarjeta"], { ...montos, tarjeta: 6000 }, 12000))
      .toBe("Faltan $1.000.");
    expect(validarPagoEsperadoMixto(["efectivo", "tarjeta"], { ...montos, tarjeta: 8000 }, 12000))
      .toBe("Sobran $1.000.");
    expect(validarPagoEsperadoMixto(["efectivo", "tarjeta"], { ...montos, tarjeta: 0 }, 12000))
      .toContain("mayor a $0");
  });

  it("rechaza decimales y texto en montos CLP", () => {
    expect(parseMontoPagoEsperado("5000")).toBe(5000);
    expect(parseMontoPagoEsperado("5000.5")).toBeNull();
    expect(parseMontoPagoEsperado("abc")).toBeNull();
  });

  it("convierte el desglose hacia y desde las columnas del pedido", () => {
    const detalle = buildPagoEsperadoDetalle(["efectivo", "tarjeta"], montos, 12000);
    const columns = pagoEsperadoColumns(detalle);
    expect(columns).toEqual({
      pago_esperado_efectivo: 5000,
      pago_esperado_transferencia: null,
      pago_esperado_tarjeta: 7000,
    });
    expect(pagoEsperadoDetalleFromPedido(columns)).toEqual(detalle);
  });

  it("muestra cada monto esperado en ambas comandas sin marcarlo como pagado", () => {
    const detalle = [
      { metodo: "efectivo" as const, monto: 5000 },
      { metodo: "tarjeta" as const, monto: 7000 },
    ];
    const toma = buildComandaTexto({
      numero: 15,
      sucursalNombre: "Centro",
      tipo: "despacho",
      cliente: "Cliente",
      items: [],
      subtotal: 12000,
      descuento: 0,
      costoDespacho: 0,
      total: 12000,
      metodoPago: "mixto",
      pagoRegistrado: false,
      pagoEsperadoDetalle: detalle,
    });
    const cocina = buildComandaCocinaTexto({
      numero: 15,
      sucursalNombre: "Centro",
      tipo: "despacho",
      cliente: "Cliente",
      items: [],
      total: 12000,
      metodoPago: "mixto",
      pagoRegistrado: false,
      pagoEsperadoDetalle: detalle,
    });

    for (const output of [toma, cocina]) {
      expect(output).toContain("EFECTIVO:");
      expect(output).toContain("$5.000");
      expect(output).toContain("TARJETA:");
      expect(output).toContain("$7.000");
      expect(output).not.toContain("YA PAGADO");
    }
  });
});
