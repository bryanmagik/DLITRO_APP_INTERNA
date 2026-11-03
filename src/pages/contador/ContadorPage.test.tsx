import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ContadorPage from "./ContadorPage";

const nombresMock = vi.hoisted(() => ({ error: null as { message: string } | null }));

vi.mock("@/stores/authStore", () => ({ useAuthStore: (selector: (state: { perfil: { rol: string } }) => unknown) => selector({ perfil: { rol: "contador_rrhh" } }) }));
vi.mock("@/lib/exportContadorExcel", () => ({ exportarContadorExcel: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  rpc: () => Promise.resolve({ data: [{ id: "d1", nombre: "Ana", apellido: "QA", nombre_completo: "Ana Despachadora QA" }], error: nombresMock.error }),
  from: (table: string) => {
  const result = { error: null, data: table === "turnos" ? [
    { id: "t1", sucursal_id: "s1", sucursales: { nombre: "Sucursal Centro" }, fecha_dlitro: "2026-10-04", estado_cuadratura: "por_revisar", diferencia_caja: 0 },
    { id: "t2", sucursal_id: "s2", sucursales: { nombre: "Sucursal Norte" }, fecha_dlitro: "2026-10-04", estado_cuadratura: "revisado", diferencia_caja: 0 },
  ] : table === "pagos_turno" ? [{ id: "p1", turno_id: "t1", metodo: "efectivo", monto: 12000 }, { id: "p2", turno_id: "t1", metodo: "transferencia", monto: 8000 }]
    : table === "pago_despachadores" ? [{ id: "pd1", despachador_id: "d1", pedidos_entregados: 2, horas_trabajadas: 1, base_por_horas: 1000, bono: 0, total_a_pagar: 1000, usuarios: null }]
    : [] };
  const query = {
    select: () => query, eq: () => query, gte: () => query, lte: () => query, in: () => query, order: () => query,
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
} } }));

beforeEach(() => { nombresMock.error = null; vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-04T12:00:00-03:00")); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("resumen diario para contabilidad", () => {
  it("muestra sucursales e ingresos al seleccionar un día, incluso sucursales sin pagos", async () => {
    render(<ContadorPage />);
    const day = await screen.findByRole("button", { name: "4" });
    expect(day).toBeEnabled();
    fireEvent.click(day);
    expect(await screen.findByRole("button", { name: /Sucursal Centro.*\$20.000/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sucursal Norte.*\$0/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sucursal Centro.*Por revisar/ })).toBeInTheDocument();
  });

  it("recupera nombres de despachadores cuando el perfil relacionado queda oculto", async () => {
    render(<ContadorPage />);
    fireEvent.click(await screen.findByRole("button", { name: "4" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sucursal Centro.*\$20.000/ }));
    const tab = await screen.findByRole("tab", { name: /Despachadores/ });
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    expect(await screen.findByText("Ana Despachadora QA")).toBeInTheDocument();
  });

  it("informa un error de lectura de nombres en vez de mostrar un detalle incompleto", async () => {
    nombresMock.error = { message: "Nombres no disponibles" };
    render(<ContadorPage />);
    fireEvent.click(await screen.findByRole("button", { name: "4" }));
    fireEvent.click(await screen.findByRole("button", { name: /Sucursal Centro.*\$20.000/ }));
    expect(await screen.findByText(/Nombres no disponibles/)).toBeInTheDocument();
  });
});
