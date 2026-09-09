import { describe, expect, it } from "vitest";
import {
  construirMotivoAjuste,
  validarCostoDespacho,
  validarMotivoAjuste,
} from "@/lib/ajusteCostoDespacho";

describe("ajuste de costo de despacho", () => {
  it("acepta enteros CLP no negativos dentro del máximo", () => {
    expect(validarCostoDespacho("0")).toBe(0);
    expect(validarCostoDespacho("4000")).toBe(4000);
    expect(validarCostoDespacho("100000")).toBe(100000);
  });

  it("rechaza negativos, decimales y montos excesivos", () => {
    expect(validarCostoDespacho("-1")).toBeNull();
    expect(validarCostoDespacho("3000.5")).toBeNull();
    expect(validarCostoDespacho("100001")).toBeNull();
  });

  it("exige motivo sólo cuando difiere de la tarifa calculada", () => {
    expect(validarMotivoAjuste(3000, 3000, "", "")).toBeNull();
    expect(validarMotivoAjuste(4000, 3000, "", "")).toBe("Selecciona el motivo del ajuste.");
  });

  it("exige detalle para Otro y limita el resultado a 500 caracteres", () => {
    expect(validarMotivoAjuste(4000, 3000, "Otro", "")).toBe("Describe el motivo del ajuste.");
    expect(validarMotivoAjuste(4000, 3000, "Otro", "a".repeat(501))).toBe("El motivo no puede superar 500 caracteres.");
    expect(construirMotivoAjuste("Acceso complejo", "Portón lateral")).toBe("Acceso complejo: Portón lateral");
  });
});
