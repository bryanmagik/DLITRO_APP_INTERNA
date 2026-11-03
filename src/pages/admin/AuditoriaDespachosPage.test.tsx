import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AuditoriaDespachosPage from "./AuditoriaDespachosPage";
const { rpc, identity } = vi.hoisted(() => ({ rpc: vi.fn(), identity: { rol: "dueno_dlitro" } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
vi.mock("@/stores/authStore", () => ({ useAuthStore: (selector: (state: { perfil: { rol: string } }) => unknown) => selector({ perfil: identity }) }));
vi.mock("./AuditoriaResumen", () => ({ default: () => <p>Resumen de superadmin</p> }));
vi.mock("./AuditoriaDespachosLegacy", () => ({ default: () => null }));
const result = { total: 251, total_pedidos: 251, creados: 1, modificados: 1, cancelados: 0, pedidos: [], cobertura_desde: null };

describe("consulta de auditoría", () => {
  beforeEach(() => {
    identity.rol = "dueno_dlitro";
    rpc.mockReset();
    rpc.mockImplementation((name: string) => Promise.resolve({ error:null, data: name === "opciones_auditoria_pedidos"
      ? { personas:[{id:"actor-a",nombre:"Persona A"}], sucursales:[{id:"branch-a",nombre:"Sucursal A"}] } : result }));
  });
  afterEach(cleanup);
  it("abre el resumen como entrada del superadmin y conserva el historial para dueño", async () => {
    identity.rol = "superadmin";
    const view = render(<AuditoriaDespachosPage />);
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Resumen de superadmin")).toBeInTheDocument();
    view.unmount();
    identity.rol = "dueno_dlitro";
    render(<AuditoriaDespachosPage />);
    await screen.findByText("Persona A");
    expect(screen.queryByRole("tab", { name: "Resumen" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Historial de pedidos" })).toHaveAttribute("aria-selected", "true");
  });
  it("abre resumen e historial de consulta para contabilidad", async () => {
    identity.rol = "contador_rrhh";
    render(<AuditoriaDespachosPage />);
    expect(screen.getByRole("tab", { name: "Resumen" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText("Resumen de superadmin")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Registros de despacho" })).not.toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Historial de pedidos" }), { button: 0, ctrlKey: false });
    await screen.findByText("Persona A");
    expect(rpc).toHaveBeenCalledWith("listar_pedidos_auditoria", expect.any(Object));
  });
  it("envía filtros al servidor y mantiene los filtros al paginar", async () => {
    render(<AuditoriaDespachosPage />);
    await screen.findByText("Persona A");
    fireEvent.change(screen.getByLabelText("Realizado por"), { target:{value:"actor-a"} });
    fireEvent.change(screen.getByLabelText("Sucursal"), { target:{value:"branch-a"} });
    fireEvent.change(screen.getByLabelText("Desde jornada"), { target:{value:"2026-10-04"} });
    fireEvent.click(screen.getByRole("button",{name:"Aplicar filtros"}));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("listar_pedidos_auditoria", expect.objectContaining({
      p_actor:"actor-a", p_sucursal:"branch-a", p_pagina:0, p_desde:"2026-10-04",
    })));
    await screen.findByText("1–50 de 251 pedidos");
    fireEvent.click(screen.getByRole("button",{name:"Siguiente"}));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("listar_pedidos_auditoria",expect.objectContaining({p_actor:"actor-a",p_sucursal:"branch-a",p_pagina:1})));
  });
  it("muestra un fallo como error y permite reintentar", async () => {
    rpc.mockImplementation((name: string) => Promise.resolve(name === "listar_pedidos_auditoria"
      ? { data:null,error:{message:"No se pudo consultar"} } : { data:{personas:[],sucursales:[]},error:null }));
    render(<AuditoriaDespachosPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo consultar");
    expect(screen.queryByText("No hay pedidos para estas jornadas y filtros.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Reintentar"}));
    await waitFor(() => expect(rpc.mock.calls.filter(([name])=>name==="listar_pedidos_auditoria")).toHaveLength(2));
  });
});
