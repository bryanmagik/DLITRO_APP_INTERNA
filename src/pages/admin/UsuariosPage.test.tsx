import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsuariosPage from "./UsuariosPage";
import { useAuthStore } from "@/stores/authStore";

const usuarios = [
  {
    id: "1",
    nombre: "jperez",
    apellido: "Pérez",
    nombre_completo: "José Pérez",
    rol: "tomador_pedidos",
    sucursal_id: "centro",
    activo: true,
    telefono: "+56 9 1111 1111",
    rut: "11.111.111-1",
  },
  {
    id: "2",
    nombre: "maria",
    apellido: "Soto",
    nombre_completo: "María Soto",
    rol: "admin",
    sucursal_id: null,
    activo: true,
    telefono: null,
    rut: null,
  },
];

const sucursales = [{ id: "centro", nombre: "Sucursal Centro" }];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabla: string) => ({
      select: () => ({
        order: () => Promise.resolve({ data: tabla === "usuarios" ? usuarios : sucursales }),
      }),
    }),
    functions: { invoke: vi.fn() },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function renderPage() {
  return render(
    <BrowserRouter>
      <UsuariosPage />
    </BrowserRouter>,
  );
}

describe("UsuariosPage - búsqueda", () => {
  beforeEach(() => {
    useAuthStore.setState({
      perfil: {
        id: "admin",
        nombre: "Admin",
        apellido: null,
        nombre_completo: "Admin QA",
        rol: "admin",
        sucursal_id: null,
        activo: true,
        telefono: null,
        rut: null,
      },
    });
  });

  it("filtra mientras se escribe, informa cero coincidencias y restaura al limpiar", async () => {
    renderPage();

    const buscador = await screen.findByRole("searchbox", { name: "Buscar usuarios" });
    expect(screen.getByText("José Pérez")).toBeInTheDocument();
    expect(screen.getByText("María Soto")).toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "  SUCURSAL   CENTRO " } });
    expect(screen.getByText("José Pérez")).toBeInTheDocument();
    expect(screen.queryByText("María Soto")).not.toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "sin coincidencias" } });
    expect(screen.getByRole("status")).toHaveTextContent("No encontramos usuarios");

    fireEvent.click(screen.getByRole("button", { name: "Limpiar búsqueda de usuarios" }));
    expect(buscador).toHaveValue("");
    expect(screen.getByText("José Pérez")).toBeInTheDocument();
    expect(screen.getByText("María Soto")).toBeInTheDocument();
  });

  it("conserva el término al abrir y cerrar el modal de edición", async () => {
    renderPage();

    const buscador = await screen.findByRole("searchbox", { name: "Buscar usuarios" });
    fireEvent.change(buscador, { target: { value: "jperez" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar José Pérez" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(buscador).toHaveValue("jperez");
    expect(screen.getByText("José Pérez")).toBeInTheDocument();
  });
});
