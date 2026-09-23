import { describe, expect, it } from "vitest";
import { calcularEfectivoEsperadoTurno, parsearEfectivoDeclarado } from "./cierreTurnoAdmin";

describe("calcularEfectivoEsperadoTurno", () => {
  it("replica el cálculo del cierre operativo", () => {
    expect(calcularEfectivoEsperadoTurno({
      cajaChicaApertura: 20_000,
      ventasEfectivo: 85_000,
      gastosEfectivo: 5_000,
      pagosDespachadores: 12_000,
    })).toBe(88_000);
  });

  it("permite un resultado negativo para hacer visible el descuadre real", () => {
    expect(calcularEfectivoEsperadoTurno({
      cajaChicaApertura: 10_000,
      ventasEfectivo: 0,
      gastosEfectivo: 20_000,
      pagosDespachadores: 0,
    })).toBe(-10_000);
  });
});
describe("parsearEfectivoDeclarado", () => {
  it("acepta cero como una declaración válida", () => {
    expect(parsearEfectivoDeclarado("0")).toBe(0);
  });

  it("acepta montos enteros y espacios exteriores", () => {
    expect(parsearEfectivoDeclarado(" 12500 ")).toBe(12_500);
  });

  it.each(["", "-1", "1.5", "abc", "2147483648"])("rechaza %s", (valor) => {
    expect(parsearEfectivoDeclarado(valor)).toBeNull();
  });
});
