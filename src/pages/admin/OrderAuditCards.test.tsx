import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrderAuditCards from "./OrderAuditCards";
import type { OrderAuditCard, OrderAuditEvent } from "@/lib/orderAudit";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const card: OrderAuditCard = { tarjeta_id: "order-a", pedido_ref: "order-a", numero_pedido: 46,
  jornada: "2026-10-04", sucursal_nombre: "Sucursal A", eventos_coincidentes: 1,
  ultimo_movimiento: "2026-10-05T04:00:00Z", jornada_recuperada: false, jornada_estimada: false };
const event = (index: number): OrderAuditEvent => ({ id: `event-${index}`, pedido_ref: "order-a", pedido_id: "order-a",
  turno_id: "shift-a", numero_pedido: 46, tomador_id: "actor-a", usuario_id: "actor-b", actor_nombre: "Persona B",
  sucursal_id: "branch-a", sucursal_nombre: "Sucursal A", estado_pedido: "entregado", campo: "cantidad",
  campos: ["cantidad"], tipo_evento: "producto_modificado", valor_anterior: "1", valor_nuevo: "2",
  motivo: null, origen_evento: "servidor", created_at: "2026-10-05T04:00:00Z" });
describe("tarjetas de pedidos por jornada", () => {
  beforeEach(() => { rpc.mockReset(); });
  afterEach(cleanup);
  it("agrupa por jornada y abre todos los movimientos, incluso más de una página y otro autor", async () => {
    rpc.mockResolvedValue({ error: null, data: { total: 51, eventos: Array.from({ length: 51 }, (_, i) => event(i)) } });
    render(<OrderAuditCards cards={[card, { ...card, tarjeta_id: "order-b", pedido_ref: "order-b", jornada: "2026-10-03" }]} />);
    expect(screen.getByRole("region", { name: "Jornada DLITRO 2026-10-04" })).toHaveTextContent("04-10-2026");
    expect(rpc).not.toHaveBeenCalled();
    const journey = screen.getByRole("region", { name: "Jornada DLITRO 2026-10-04" });
    fireEvent.click(within(journey).getByRole("button", { name: /Pedido 46/ }));
    expect(await screen.findByText(/Historial completo: 51 movimientos/)).toBeInTheDocument();
    expect(screen.getAllByText("Persona B")).toHaveLength(51);
    expect(rpc.mock.calls).toEqual([
      ["historial_completo_pedido_auditoria", { p_pedido: "order-a" }],
    ]);
    expect(within(journey).getByRole("button", { name: /Pedido 46/ })).toHaveAttribute("aria-expanded", "true");
  });
  it("no presenta un historial parcial como completo y permite reintentar", async () => {
    rpc.mockResolvedValue({ data: { total: 51, eventos: [event(0)] }, error: null });
    render(<OrderAuditCards cards={[card]} />);
    fireEvent.click(screen.getByRole("button", { name: /Pedido 46/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo cargar el historial completo");
    expect(screen.queryByText("Persona B")).not.toBeInTheDocument();
    rpc.mockResolvedValue({ data: { total: 1, eventos: [event(0)] }, error: null });
    fireEvent.click(screen.getByRole("button", { name: "Reintentar historial" }));
    expect(await screen.findByText(/Historial completo: 1 movimiento\./)).toBeInTheDocument();
  });
  it("explica las jornadas estimadas y conserva tarjetas sin referencia sin consultar todos los pedidos", () => {
    render(<OrderAuditCards cards={[{ ...card, pedido_ref: null, numero_pedido: null, jornada_estimada: true }]} />);
    fireEvent.click(screen.getByRole("button", { name: /Pedido sin número/ }));
    expect(screen.getByText(/estimada por la hora del registro/)).toBeInTheDocument();
    expect(screen.getByText(/no conserva una referencia/)).toBeInTheDocument();
    expect(rpc).not.toHaveBeenCalled();
  });
});
