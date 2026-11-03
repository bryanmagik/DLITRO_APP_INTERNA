import { describe, expect, it } from "vitest";
import { auditChanges, auditDayBoundary } from "./orderAudit";

describe("historial de pedidos", () => {
  it("presenta cantidad y precio con sus valores anteriores y nuevos", () => {
    expect(auditChanges({ campo: "pedido_items", campos: ["cantidad","precio_unitario"],
      valor_anterior: '{"cantidad":1,"precio_unitario":5000,"linea_id":"a"}',
      valor_nuevo: '{"cantidad":2,"precio_unitario":6000,"linea_id":"a"}',
    })).toEqual([
      { field: "cantidad", label: "Cantidad", before: "1", after: "2" },
      { field: "precio_unitario", label: "Precio unitario", before: "5000", after: "6000" },
    ]);
  });
  it("conserva los valores históricos de texto sin inventar datos", () => {
    expect(auditChanges({ campo:"metodo_pago", campos:null, valor_anterior:null, valor_nuevo:"efectivo" }))
      .toEqual([{ field:"metodo_pago", label:"Método de pago", before:"Sin dato", after:"efectivo" }]);
  });
  it("muestra composiciones de pagos y ceros explícitos", () => {
    const changes = auditChanges({ campo:"composicion_pago", campos:null,
      valor_anterior:'[{"metodo":"efectivo","monto":5000}]', valor_nuevo:'[{"metodo":"tarjeta","monto":5000}]' });
    expect(changes[0].before).toContain('efectivo');
    expect(changes[0].after).toContain('tarjeta');
    expect(changes[0].before).toContain('5.000');
    expect(changes[0].before).not.toContain('"monto"');
    expect(auditChanges({ campo:"descuento", campos:null, valor_anterior:"0", valor_nuevo:"1000" })[0].before).toBe("0");
  });
  it("resuelve fechas de verano de Chile sin depender del equipo", () => {
    expect(auditDayBoundary("2026-10-04")).toBe("2026-10-04T03:00:00.000Z");
    expect(auditDayBoundary("2026-10-04",true)).toBe("2026-10-05T03:00:00.000Z");
  });
  it("resuelve fechas de invierno de Chile", () => {
    expect(auditDayBoundary("2026-07-04")).toBe("2026-07-04T04:00:00.000Z");
  });
  it("rechaza fechas inválidas", () => {
    expect(() => auditDayBoundary("fecha inválida")).toThrow("Fecha inválida");
  });
});
