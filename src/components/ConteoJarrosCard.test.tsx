import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ConteoJarrosCard from "./ConteoJarrosCard";
import { CONTEO_JARROS_VACIO } from "@/lib/conteoJarros";

describe("ConteoJarrosCard", () => {
  it("completa el encabezado y expone los cuatro conteos", () => {
    const onChange = vi.fn();
    render(
      <ConteoJarrosCard
        sucursalNombre="San Bernardo"
        fecha={new Date("2026-09-10T15:00:00.000Z")}
        value={CONTEO_JARROS_VACIO}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("San Bernardo")).toBeInTheDocument();
    expect(screen.getByText("10 de septiembre de 2026")).toBeInTheDocument();
    expect(screen.getByText("Inventario")).toBeInTheDocument();
    expect(screen.getAllByRole("spinbutton")).toHaveLength(4);

    fireEvent.change(screen.getByLabelText("Jarros rotos"), { target: { value: "0" } });
    expect(onChange).toHaveBeenCalledWith({ ...CONTEO_JARROS_VACIO, jarrosRotos: "0" });
  });
});
