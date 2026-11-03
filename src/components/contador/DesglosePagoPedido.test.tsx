import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DesglosePagoPedido } from "./DesglosePagoPedido";
import { desglosePagoPedido } from "./agrupacionPagos";
afterEach(cleanup);
describe("desglose de pagos en caja diaria", () => {
  it("suma registros del mismo método y aísla el pedido", () => {
    expect(desglosePagoPedido([
      { pedido_id: "a", metodo: "efectivo", monto: 5000 },
      { pedido_id: "a", metodo: "efectivo", monto: 7000 },
      { pedido_id: "a", metodo: "transferencia", monto: 8000 },
      { pedido_id: "b", metodo: "tarjeta", monto: 99999 },
      { pedido_id: null, metodo: "efectivo", monto: 99999 },
    ], "a")).toEqual({ efectivo: 12000, transferencia: 8000 });
  });
  it("muestra los importes reales de un pago mixto", () => {
    render(<DesglosePagoPedido pedidoId="a" metodo="mixto" total={20000} pagos={[
      { pedido_id: "a", metodo: "efectivo", monto: 12000 }, { pedido_id: "a", metodo: "tarjeta", monto: 8000 },
    ]} />);
    expect(screen.getByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByText("$12.000")).toBeInTheDocument();
    expect(screen.getByText("$8.000")).toBeInTheDocument();
    expect(screen.queryByText(/Diferencia con/)).not.toBeInTheDocument();
  });
  it("no inventa una distribución cuando no hay registros", () => {
    render(<DesglosePagoPedido pedidoId="a" metodo="mixto" total={20000} pagos={[]} />);
    expect(screen.getByText("Sin desglose registrado")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });
  it("mantiene cero explícito y advierte pagos incompletos", () => {
    render(<DesglosePagoPedido pedidoId="a" metodo="mixto" total={20000} pagos={[
      { pedido_id: "a", metodo: "efectivo", monto: 0 }, { pedido_id: "a", metodo: "transferencia", monto: 8000 },
    ]} />);
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.getByText(/Diferencia con el pedido: \$12.000/)).toBeInTheDocument();
  });
});
