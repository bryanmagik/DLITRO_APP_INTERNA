import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AddressAutocomplete, {
  ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS,
  PLACES_AUTOCOMPLETE_REQUEST_EVENT,
} from "./AddressAutocomplete";

const fetchAutocompleteSuggestions = vi.fn();
const fetchFields = vi.fn();
const onChange = vi.fn();
const onSelect = vi.fn();

vi.mock("@/lib/googleMaps", () => ({
  isGoogleMapsConfigured: () => true,
  loadGoogleMaps: () => Promise.resolve({
    maps: {
      importLibrary: () => Promise.resolve({
        AutocompleteSessionToken: class {},
        AutocompleteSuggestion: { fetchAutocompleteSuggestions },
      }),
    },
  }),
}));

function suggestion(address: string, lat = -33.45, lng = -70.66) {
  const place = { formattedAddress: address, location: { lat, lng }, fetchFields };
  return {
    placePrediction: {
      text: { text: address },
      mainText: { text: address },
      toPlace: () => place,
    },
  };
}

function Harness({ initialValue = "" }: { initialValue?: string }) {
  const [value, setValue] = React.useState(initialValue);
  return (
    <AddressAutocomplete
      value={value}
      onChange={(next) => { setValue(next); onChange(next); }}
      onSelect={onSelect}
      placeholder="Dirección"
    />
  );
}

async function readyInput(initialValue = "") {
  render(<Harness initialValue={initialValue} />);
  await act(async () => { await Promise.resolve(); });
  return screen.getByPlaceholderText("Dirección");
}

describe("AddressAutocomplete", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchAutocompleteSuggestions.mockReset();
    fetchFields.mockReset().mockResolvedValue(undefined);
    onChange.mockReset();
    onSelect.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("no consulta con menos de tres caracteres ni al cargar una dirección guardada", async () => {
    const input = await readyInput("Av. Guardada 123");
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "ab" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();
  });

  it("al pegar una dirección completa genera una sola solicitud", async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] });
    const input = await readyInput();

    fireEvent.paste(input, { clipboardData: { getData: () => "Av. Apoquindo 1234" } });
    fireEvent.change(input, { target: { value: "Av. Apoquindo 1234" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(fetchAutocompleteSuggestions.mock.calls[0][0].input).toBe("Av. Apoquindo 1234");
  });

  it("agrupa pulsaciones con pausas inferiores a 800 ms y no repite el mismo texto normalizado", async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] });
    const input = await readyInput();

    fireEvent.change(input, { target: { value: "Apo" } });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Apoq" } });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "Apoquindo" } });
    await act(async () => { vi.advanceTimersByTime(500); });
    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "  Apoquindo  " } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "Apoquindo" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
  });

  it("ignora una respuesta atrasada frente a resultados más recientes", async () => {
    let resolveOld!: (value: unknown) => void;
    fetchAutocompleteSuggestions
      .mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }))
      .mockResolvedValueOnce({ suggestions: [suggestion("Nueva 456")] });
    const input = await readyInput();

    fireEvent.change(input, { target: { value: "Antigua" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    fireEvent.change(input, { target: { value: "Nueva" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(screen.getByText("Nueva 456")).toBeInTheDocument();

    await act(async () => { resolveOld({ suggestions: [suggestion("Antigua 123")] }); });
    expect(screen.queryByText("Antigua 123")).not.toBeInTheDocument();
  });

  it("vuelve a consultar A cuando la solicitud A anterior fue invalidada por A-B-A", async () => {
    let resolveFirstA!: (value: unknown) => void;
    fetchAutocompleteSuggestions
      .mockReturnValueOnce(new Promise((resolve) => { resolveFirstA = resolve; }))
      .mockResolvedValueOnce({ suggestions: [suggestion("Resultado A vigente")] });
    const input = await readyInput();

    fireEvent.change(input, { target: { value: "Consulta A" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);

    fireEvent.change(input, { target: { value: "Consulta B" } });
    fireEvent.change(input, { target: { value: "Consulta A" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(2);
    expect(fetchAutocompleteSuggestions.mock.calls[1][0].input).toBe("Consulta A");
    expect(screen.getByText("Resultado A vigente")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();

    await act(async () => { resolveFirstA({ suggestions: [suggestion("Resultado A obsoleto")] }); });
    expect(screen.queryByText("Resultado A obsoleto")).not.toBeInTheDocument();
    expect(screen.getByText("Resultado A vigente")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
  });

  it("permite reintentar exactamente el mismo texto después de un fallo", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchAutocompleteSuggestions
      .mockRejectedValueOnce(new Error("Temporary failure"))
      .mockResolvedValueOnce({ suggestions: [suggestion("Resultado recuperado")] });
    const input = await readyInput();

    fireEvent.change(input, { target: { value: "Consulta reintentable" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "  Consulta reintentable  " } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Resultado recuperado")).toBeInTheDocument();
    expect(document.querySelector(".animate-spin")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("selecciona la dirección, pide sólo los campos requeridos y completa la sesión", async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [suggestion("Apoquindo 123")] });
    const input = await readyInput();
    fireEvent.change(input, { target: { value: "Apoquindo" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });

    fireEvent.click(screen.getByRole("button", { name: "Apoquindo 123" }));
    await act(async () => { await Promise.resolve(); });
    expect(onSelect).toHaveBeenCalledWith({
      address: "Apoquindo 123", lat: -33.45, lng: -70.66,
    });
    expect(fetchFields).toHaveBeenCalledWith({ fields: ["formattedAddress", "location"] });

    fireEvent.change(input, { target: { value: "Otra dirección" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });
    const firstToken = fetchAutocompleteSuggestions.mock.calls[0][0].sessionToken;
    const secondToken = fetchAutocompleteSuggestions.mock.calls[1][0].sessionToken;
    expect(secondToken).not.toBe(firstToken);
  });

  it("mantiene el formulario utilizable y consistente si Google falla", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    fetchAutocompleteSuggestions.mockRejectedValue(new Error("Google unavailable"));
    const input = await readyInput();
    fireEvent.change(input, { target: { value: "Dirección manual" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });

    expect(fetchAutocompleteSuggestions).toHaveBeenCalledTimes(1);
    expect(input).toHaveValue("Dirección manual");
    expect(input).not.toBeDisabled();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    vi.restoreAllMocks();
  });

  it("emite observabilidad sin incluir el texto buscado", async () => {
    fetchAutocompleteSuggestions.mockResolvedValue({ suggestions: [] });
    const observer = vi.fn();
    window.addEventListener(PLACES_AUTOCOMPLETE_REQUEST_EVENT, observer);
    const input = await readyInput();
    fireEvent.change(input, { target: { value: "Dirección sensible 123" } });
    await act(async () => { vi.advanceTimersByTime(ADDRESS_AUTOCOMPLETE_DEBOUNCE_MS); });

    expect(observer).toHaveBeenCalledTimes(1);
    expect((observer.mock.calls[0][0] as CustomEvent).detail).toEqual({ regionCode: "cl" });
    window.removeEventListener(PLACES_AUTOCOMPLETE_REQUEST_EVENT, observer);
  });
});
