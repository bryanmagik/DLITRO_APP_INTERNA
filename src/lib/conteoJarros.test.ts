import { describe, expect, it } from "vitest";
import { fechaConteoJarros, validarConteoJarros } from "./conteoJarros";

describe("conteo diario de jarros", () => {
  it("acepta el conteo operativo con ceros confirmados", () => {
    expect(validarConteoJarros({
      cajasConSticker: "2",
      cajasSinSticker: "20",
      jarrosSueltos: "46",
      jarrosRotos: "0",
    })).toEqual({
      value: {
        cajasConSticker: 2,
        cajasSinSticker: 20,
        jarrosSueltos: 46,
        jarrosRotos: 0,
      },
      error: null,
    });
  });

  it("exige los cuatro valores y rechaza negativos o decimales", () => {
    expect(validarConteoJarros({
      cajasConSticker: "",
      cajasSinSticker: "20",
      jarrosSueltos: "46",
      jarrosRotos: "0",
    }).value).toBeNull();
    expect(validarConteoJarros({
      cajasConSticker: "-1",
      cajasSinSticker: "20",
      jarrosSueltos: "46",
      jarrosRotos: "0",
    }).value).toBeNull();
    expect(validarConteoJarros({
      cajasConSticker: "1.5",
      cajasSinSticker: "20",
      jarrosSueltos: "46",
      jarrosRotos: "0",
    }).value).toBeNull();
  });

  it("formatea la fecha usando el día de Chile", () => {
    expect(fechaConteoJarros(new Date("2026-09-11T02:30:00.000Z"))).toBe("10 de septiembre de 2026");
  });
});
