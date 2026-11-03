import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MapaDespachos from "./MapaDespachos";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), markers: [] as google.maps.MarkerOptions[],
  windows: [] as google.maps.InfoWindowOptions[],
  perfil: { rol: "tomador_pedidos", sucursal_id: "own" },
  turno: { id: "shift", sucursal_id: "own" },
}));
vi.mock("@/stores/authStore", () => ({ useAuthStore: () => ({ perfil: mocks.perfil }) }));
vi.mock("./TurnoPage", () => ({ useTurno: () => ({ turno: mocks.turno }) }));
vi.mock("@/lib/googleMaps", () => ({ loadGoogleMaps: () => Promise.resolve() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: mocks.rpc, from: mocks.from,
    channel: () => { const channel = { on: () => channel, subscribe: () => channel }; return channel; },
    removeChannel: vi.fn(),
  },
}));

describe("sucursales del mapa de despachos", () => {
  beforeEach(() => {
    mocks.markers.length = 0; mocks.windows.length = 0;
    mocks.rpc.mockReset(); mocks.from.mockReset();
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query, eq: () => query, not: () => query, order: () => query,
        then: (resolve: (value: { data: never[]; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve),
      };
      return query;
    });
    vi.stubGlobal("google", { maps: {
      Map: class { setCenter = vi.fn(); addListener = vi.fn(); },
      DirectionsService: class {},
      DirectionsRenderer: class { setMap = vi.fn(); },
      InfoWindow: class {
        constructor(options: google.maps.InfoWindowOptions = {}) { mocks.windows.push(options); }
        close = vi.fn(); open = vi.fn();
      },
      Marker: class {
        constructor(options: google.maps.MarkerOptions) { mocks.markers.push(options); }
        setMap = vi.fn(); addListener = vi.fn();
      },
      Size: class {}, Point: class {}, Animation: { DROP: 1 },
    } });
  });
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
  it("dibuja la sucursal propia y las otras sin consultar la tabla completa", async () => {
    mocks.rpc.mockResolvedValue({ data: [
      { id: "own", nombre: "Propia", direccion: "Calle 1", latitud: -33.4, longitud: -70.6 },
      { id: "other", nombre: "Otra <sucursal>", direccion: '<img src=x onerror="alert(1)">', latitud: -33.5, longitud: -70.7 },
    ], error: null });
    render(<MapaDespachos />);
    await waitFor(() => expect(mocks.markers).toHaveLength(2));
    expect(mocks.rpc).toHaveBeenCalledWith("sucursales_mapa_despachos");
    expect(mocks.from).not.toHaveBeenCalledWith("sucursales");
    expect(mocks.markers).toEqual(expect.arrayContaining([
      expect.objectContaining({ title: "Propia", position: { lat: -33.4, lng: -70.6 }, zIndex: 12 }),
      expect.objectContaining({ title: "Otra <sucursal>", position: { lat: -33.5, lng: -70.7 }, zIndex: 8 }),
    ]));
    const content = mocks.windows.map((item) => String(item.content ?? "")).join("");
    expect(content).toContain("Otra &lt;sucursal&gt;");
    expect(content).not.toContain("<img");
  });
  it("muestra el fallo de la consulta sin fingir que no existen otras sucursales", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "permission denied" } });
    render(<MapaDespachos />);
    expect(await screen.findByText(/No se pudieron cargar las ubicaciones/)).toBeInTheDocument();
    expect(mocks.markers).toHaveLength(0);
  });
  it("acepta un directorio vacío sin crear marcadores", async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    render(<MapaDespachos />);
    await screen.findByText("Otras sucursales");
    expect(mocks.markers).toHaveLength(0);
  });
});

