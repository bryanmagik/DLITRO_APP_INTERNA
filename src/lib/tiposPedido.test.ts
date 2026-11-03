import { describe, expect, it } from "vitest";
import { tipoFiltroPedido, tipoMeta } from "./tiposPedido";

describe("modalidades de pedido", () => {
  it("agrupa retiros y despachos históricos sin mezclar plataformas o puerta", () => {
    expect(["local", "retiro", "delivery", "despacho", "uber", "rappi", "puerta"].map(tipoFiltroPedido))
      .toEqual(["retiro", "retiro", "despacho", "despacho", "uber", "rappi", "puerta"]);
    expect(tipoMeta("local").label).toBe("Retiro");
    expect(tipoMeta("retiro").label).toBe("Retiro");
  });
});
