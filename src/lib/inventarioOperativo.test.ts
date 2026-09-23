import { describe, expect, it } from "vitest";
import { agruparInventario, ordenarInventario, validarCantidadInventario } from "./inventarioOperativo";
import { formatearStockDisplay, mlACajasUnidades } from "@/utils/stockUtils";

describe("inventario operativo", () => {
  it("respeta orden de producto, presentación y sección", () => {
    const items = [
      { nombre: "Paños unidades", grupo_inventario: "Paños", seccion_inventario: "Útiles de aseo", orden_visual: 36, orden_presentacion: 1 },
      { nombre: "Ron sueltas", grupo_inventario: "Ron", seccion_inventario: "Inventario general", orden_visual: 1, orden_presentacion: 2 },
      { nombre: "Ron cajas", grupo_inventario: "Ron", seccion_inventario: "Inventario general", orden_visual: 1, orden_presentacion: 1 },
      { nombre: "Sin configurar", tipo: "Preparación", orden_visual: null },
    ];
    expect(ordenarInventario(items).map((item) => item.nombre)).toEqual([
      "Ron cajas", "Ron sueltas", "Sin configurar", "Paños unidades",
    ]);
    expect(agruparInventario(items).map((section) => section.seccion)).toEqual([
      "Inventario general", "Útiles de aseo",
    ]);
  });

  it("distingue vacío de cero confirmado", () => {
    expect(validarCantidadInventario("", "decimal")).toEqual({ valor: null, error: null });
    expect(validarCantidadInventario("0", "decimal")).toEqual({ valor: 0, error: null });
  });

  it("acepta medio bidón y coma decimal", () => {
    expect(validarCantidadInventario("0.5", "decimal").valor).toBe(0.5);
    expect(validarCantidadInventario("0,5", "decimal").valor).toBe(0.5);
    expect(mlACajasUnidades(0.5, null, null).unidades).toBe(0.5);
    expect(formatearStockDisplay(0.5, { unidad: "bidón" })).toContain("0,5");
  });

  it("rechaza negativos, decimales enteros y porcentajes fuera de rango", () => {
    expect(validarCantidadInventario("-1", "decimal").error).toMatch(/negativa/);
    expect(validarCantidadInventario("1.5", "entero").error).toMatch(/entero/);
    expect(validarCantidadInventario("101", "porcentaje").error).toMatch(/100/);
    expect(validarCantidadInventario("100", "porcentaje").valor).toBe(100);
  });
});
