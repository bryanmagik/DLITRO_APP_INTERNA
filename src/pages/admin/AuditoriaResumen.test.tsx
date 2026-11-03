import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuditoriaResumen, { type AuditSummary } from "./AuditoriaResumen";
const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
const summary: AuditSummary = {
  cambios: 205, pedidos_modificados: 1, historicos: 0, sin_autor: 0, entregados: 2,
  jarros: 4, jarros_promos: 1, jarros_sueltos: 0, jarros_sin_dato: 1, promociones: 1, cobertura_desde: null,
  personas: [{ id: "actor-a", nombre: "Persona A", cambios: 205, pedidos: 1 }],
  sucursales: [{ id: "branch-a", nombre: "Sucursal A", cambios: 205, pedidos: 1 }],
  despachadores: [{ id: "dispatcher-a", nombre: "Repartidor A", jarros: 4, promos: 1, sueltos: 0, pedidos: 2, sin_dato: 1 }],
  promos_sucursales: [{ id: "branch-a", nombre: "Sucursal A", entregados: 2, promociones: 1, canjes: 1, cumpleanos: 0, trabajador: 0, doradas: 0, descuentos: 1000 }],
  dias: [{ dia: "2026-10-03", cambios: 205 }],
};
describe("resumen de auditoría", () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation((name: string) => Promise.resolve({ error: null, data: name === "opciones_auditoria_pedidos" ? { sucursales: [{ id: "branch-a", nombre: "Sucursal A" }] } : summary }));
  });
  afterEach(cleanup);
  it("muestra rankings y abre el historial con fechas y autor", async () => {
    const inspect = vi.fn();
    render(<AuditoriaResumen onInspect={inspect} />);
    expect(await screen.findByText("Repartidor A")).toBeInTheDocument();
    expect(screen.getAllByText("1 promo + 0 jarros sueltos")).toHaveLength(2);
    expect(screen.getByText(/Total: 4 jarros · 2 pedidos/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("Hasta (incluido)"), { target: { value: "2026-10-03" } });
    fireEvent.change(screen.getByLabelText("Sucursal"), { target: { value: "branch-a" } });
    fireEvent.click(screen.getByRole("button", { name: "Ver resumen" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("resumen_auditoria_pedidos", { p_desde: "2026-10-03T03:00:00.000Z", p_hasta: "2026-10-04T03:00:00.000Z", p_sucursal: "branch-a" }));
    fireEvent.click(await screen.findByRole("button", { name: "Ver historial de Persona A" }));
    expect(inspect).toHaveBeenCalledWith({ desde: "2026-10-03", hasta: "2026-10-03", sucursal: "branch-a", actor: "actor-a" });
  });
  it("conserva cantidades desconocidas y errores como tales", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({ error: null, data: name === "opciones_auditoria_pedidos" ? { sucursales: [] } : { ...summary, jarros: null, jarros_promos: null, jarros_sueltos: null, despachadores: [] } }));
    render(<AuditoriaResumen onInspect={vi.fn()} />);
    expect(await screen.findByText("Sin datos")).toBeInTheDocument();
    rpc.mockResolvedValue({ data: null, error: { message: "Consulta fallida" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Consulta fallida");
    expect(screen.queryByText("4 jarros")).not.toBeInTheDocument();
  });
  it("muestra promos y sueltos informados sin recalcular desde el total", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({ error: null, data: name === "opciones_auditoria_pedidos" ? { sucursales: [] } : {
      ...summary, jarros: 112, jarros_promos: 25, jarros_sueltos: 12,
      despachadores: [{ ...summary.despachadores[0], jarros: 112, promos: 25, sueltos: 12 }],
    } }));
    render(<AuditoriaResumen onInspect={vi.fn()} />);
    expect(await screen.findAllByText("25 promos + 12 jarros sueltos")).toHaveLength(2);
    expect(screen.getByText(/Total: 112 jarros · 2 pedidos/)).toBeInTheDocument();
    expect(screen.queryByText("28 promos + 0 jarros sueltos")).not.toBeInTheDocument();
  });
  it("explica las sucursales recuperadas y separa los cambios sin identificar del ranking", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve({ error: null, data: name === "opciones_auditoria_pedidos" ? { sucursales: [] } : {
      ...summary, sucursales_recuperadas: 205, sin_sucursal: 7,
      sucursales: [
        { id: null, nombre: "Sucursal no registrada", cambios: 7, pedidos: 2 },
        { ...summary.sucursales[0], recuperados: 205 },
      ],
    } }));
    render(<AuditoriaResumen onInspect={vi.fn()} />);
    expect(await screen.findByText(/205 cambios históricos asociados a la sucursal actual/)).toBeInTheDocument();
    expect(screen.getByText(/7 cambios sin sucursal identificable/)).toBeInTheDocument();
    expect(screen.getByText(/205 cambios con sucursal recuperada del pedido actual/)).toBeInTheDocument();
    expect(screen.queryByText("Sucursal no registrada")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Ver historial de Sucursal A" })).toBeInTheDocument();
  });
});
