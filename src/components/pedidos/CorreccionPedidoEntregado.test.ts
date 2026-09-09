import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: vi.fn() },
}));
import {
  crearComposicionInicial,
  normalizarComposicionPagos,
  validarComposicionPagos,
  validarMotivoCorreccion,
  type PagoCorreccion,
} from "./CorreccionPedidoEntregado.logic";
import { CorreccionPedidoEntregado } from "./CorreccionPedidoEntregado";

const pedido = { total: 30_000, metodo_pago: "efectivo", referencia_pago: null };

const pago = (metodo: PagoCorreccion["metodo"], monto: number): PagoCorreccion => ({
  metodo,
  monto,
  referencia: "",
});

describe("corrección compartida de pagos de pedido entregado", () => {
  it("abre el editor avanzado para un pedido entregado", () => {
    render(createElement(CorreccionPedidoEntregado, {
      pedido: { id: "pedido-qa", estado: "entregado", total: 30_000, notas: null, metodo_pago: "efectivo", referencia_pago: null },
      pagosActuales: [{ metodo: "efectivo", monto: 30_000, referencia: null }],
      onSuccess: vi.fn(),
    }));

    fireEvent.click(screen.getByRole("button", { name: /corregir pedido/i }));

    expect(screen.getByText("Corrección administrativa post-cierre")).toBeInTheDocument();
    expect(screen.getByText("Total distribuido")).toBeInTheDocument();
    expect(screen.getByText("Diferencia pendiente")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /revisar corrección/i })).toBeEnabled();
  });

  it("inicializa y valida una corrección simple a simple", () => {
    expect(crearComposicionInicial(pedido, [{ metodo: "efectivo", monto: 30_000, referencia: null }]))
      .toEqual([pago("efectivo", 30_000)]);
    expect(validarComposicionPagos([pago("tarjeta", 30_000)], pedido.total)).toBeNull();
  });

  it("valida simple a mixto", () => {
    expect(validarComposicionPagos([
      pago("efectivo", 10_000),
      pago("transferencia", 20_000),
    ], pedido.total)).toBeNull();
  });

  it("inicializa mixto y valida mixto a simple", () => {
    expect(crearComposicionInicial(
      { ...pedido, metodo_pago: "mixto" },
      [{ metodo: "efectivo", monto: 10_000, referencia: null }, { metodo: "tarjeta", monto: 20_000, referencia: null }],
    )).toHaveLength(2);
    expect(validarComposicionPagos([pago("transferencia", 30_000)], pedido.total)).toBeNull();
  });

  it("valida mixto a mixto y normaliza el payload de la RPC", () => {
    const pagos = [
      { ...pago("tarjeta", 12_000), referencia: "  voucher-1  " },
      pago("efectivo", 18_000),
    ];
    expect(validarComposicionPagos(pagos, pedido.total)).toBeNull();
    expect(normalizarComposicionPagos(pagos)).toEqual([
      { metodo: "efectivo", monto: 18_000, referencia: null },
      { metodo: "tarjeta", monto: 12_000, referencia: "voucher-1" },
    ]);
  });

  it("rechaza sumas diferentes, duplicados y montos inválidos", () => {
    expect(validarComposicionPagos([pago("efectivo", 29_999)], pedido.total)).toMatch(/sumar exactamente/);
    expect(validarComposicionPagos([pago("efectivo", 10_000), pago("efectivo", 20_000)], pedido.total)).toMatch(/repetir/);
    expect(validarComposicionPagos([pago("efectivo", 0), pago("tarjeta", 30_000)], pedido.total)).toMatch(/mayor que cero/);
  });

  it("exige motivo y detalle para Otro", () => {
    expect(validarMotivoCorreccion("", "")).toMatch(/Selecciona/);
    expect(validarMotivoCorreccion("otro", "   ")).toMatch(/Describe/);
    expect(validarMotivoCorreccion("otro", "Ajuste solicitado por caja")).toBeNull();
    expect(validarMotivoCorreccion("error_digitacion", "")).toBeNull();
  });

  it("mantiene una sola implementación y una sola llamada frontend a la RPC", () => {
    const root = resolve(process.cwd(), "src");
    const operativo = readFileSync(resolve(root, "pages/turno/tabs/MisPedidosTab.tsx"), "utf8");
    const admin = readFileSync(resolve(root, "pages/admin/PedidosAdminPage.tsx"), "utf8");
    const compartido = readFileSync(resolve(root, "components/pedidos/CorreccionPedidoEntregado.tsx"), "utf8");

    expect(operativo).toContain("<CorreccionPedidoEntregado");
    expect(admin).toContain("<CorreccionPedidoEntregado");
    expect(operativo).not.toContain('rpc("corregir_pagos_pedido_entregado"');
    expect(admin).not.toContain('rpc("corregir_pagos_pedido_entregado"');
    expect(compartido.match(/rpc\("corregir_pagos_pedido_entregado"/g)).toHaveLength(1);
    expect(compartido).toContain('if (pedido.estado !== "entregado") return null');
  });
});
