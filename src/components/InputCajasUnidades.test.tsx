import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import InputCajasUnidades from "./InputCajasUnidades";

describe("InputCajasUnidades", () => {
  it("mantiene vacío separado de cero confirmado", () => {
    const onChange = vi.fn();
    render(<InputCajasUnidades insumo={{ unidad: "unidades" }} valorMl={null} onChange={onChange} />);
    const input = screen.getByRole("spinbutton");
    expect(input).toHaveValue(null);
    fireEvent.change(input, { target: { value: "0" } });
    expect(onChange).toHaveBeenLastCalledWith(0);
    fireEvent.change(input, { target: { value: "" } });
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("acepta medio bidón cuando el catálogo permite decimales", () => {
    const onChange = vi.fn();
    render(
      <InputCajasUnidades
        insumo={{ unidad: "bidón", tipo_conteo: "decimal", paso_conteo: 0.5 }}
        valorMl={null}
        onChange={onChange}
      />,
    );
    fireEvent.change(screen.getByRole("spinbutton"), { target: { value: "0.5" } });
    expect(onChange).toHaveBeenLastCalledWith(0.5);
  });

  it("mantiene cajas y unidades para un insumo configurado como en producción", () => {
    const onChange = vi.fn();
    render(
      <InputCajasUnidades
        insumo={{
          unidad: "ml",
          formato_mayor: "Caja",
          unidades_por_formato: 12,
          ml_por_unidad: 750,
        }}
        valorMl={null}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("Caja:")).toBeInTheDocument();
    expect(screen.getByText("Unidades:")).toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
  });

  it("rechaza negativos y porcentajes superiores a cien", () => {
    const onChange = vi.fn();
    render(
      <InputCajasUnidades
        insumo={{ unidad: "%", tipo_conteo: "porcentaje", paso_conteo: 1, maximo_conteo: 100 }}
        valorMl={null}
        onChange={onChange}
      />,
    );
    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "-1" } });
    expect(screen.getByRole("alert")).toHaveTextContent("negativa");
    expect(onChange).toHaveBeenLastCalledWith(null);
    fireEvent.change(input, { target: { value: "101" } });
    expect(screen.getByRole("alert")).toHaveTextContent("100");
    fireEvent.change(input, { target: { value: "100" } });
    expect(onChange).toHaveBeenLastCalledWith(100);
  });
});
