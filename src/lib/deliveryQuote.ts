export interface TarifaDespacho {
  distancia_desde: number;
  distancia_hasta: number;
  precio: number;
  tramo: number;
}

export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadiusKm = 6371;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
}

function fallbackDeliveryCost(km: number): number {
  const base = 2000;
  const tramoKm = 3.5;
  const extraPorTramo = 1000;
  if (km <= tramoKm) return base;
  return base + Math.ceil((km - tramoKm) / tramoKm) * extraPorTramo;
}

export function calculateDeliveryCost(km: number, tarifas: TarifaDespacho[]): number {
  if (!tarifas.length) return fallbackDeliveryCost(km);
  const sorted = [...tarifas].sort((a, b) => a.tramo - b.tramo);
  const match = sorted.find((tarifa) => (
    km >= Number(tarifa.distancia_desde) && km < Number(tarifa.distancia_hasta)
  ));
  if (match) return Number(match.precio);
  return Number(sorted[sorted.length - 1]?.precio) || fallbackDeliveryCost(km);
}

export function hasValidDeliveryCoordinates(lat: number | null, lng: number | null): boolean {
  return lat !== null
    && lng !== null
    && Number.isFinite(lat)
    && Number.isFinite(lng)
    && lat >= -90
    && lat <= 90
    && lng >= -180
    && lng <= 180;
}

interface DeliveryLocationInput {
  tipo: "despacho" | "retiro";
  direccion: string;
  referencia: string;
  latitud: number | null;
  longitud: number | null;
  distanciaKm: number | null;
}

export function buildDeliveryLocationFields(input: DeliveryLocationInput) {
  if (input.tipo === "retiro") {
    return {
      direccion_entrega: null,
      referencia_entrega: null,
      latitud_entrega: null,
      longitud_entrega: null,
      distancia_km: null,
    };
  }

  return {
    direccion_entrega: input.direccion.trim() || null,
    referencia_entrega: input.referencia.trim() || null,
    latitud_entrega: input.latitud,
    longitud_entrega: input.longitud,
    distancia_km: input.distanciaKm == null ? null : Number(input.distanciaKm.toFixed(2)),
  };
}
