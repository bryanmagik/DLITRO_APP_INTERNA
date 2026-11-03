import { describe, expect, it } from "vitest";
import {
  buildDeliveryLocationFields,
  calculateConfiguredDeliveryCost,
  hasValidDeliveryCoordinates,
  haversineDistanceKm,
  parseDeliveryCost,
} from "@/lib/deliveryQuote";

describe("cotización de despacho", () => {
  it("reconoce únicamente pares de coordenadas válidos", () => {
    expect(hasValidDeliveryCoordinates(-33.45, -70.66)).toBe(true);
    expect(hasValidDeliveryCoordinates(null, -70.66)).toBe(false);
    expect(hasValidDeliveryCoordinates(-33.45, null)).toBe(false);
    expect(hasValidDeliveryCoordinates(91, -70.66)).toBe(false);
  });

  it("calcula una distancia geográfica de respaldo", () => {
    expect(haversineDistanceKm(-33.45, -70.66, -33.46, -70.67)).toBeCloseTo(1.45, 1);
  });

  it("aplica la tarifa configurada y no inventa un precio si faltan tarifas", () => {
    const tarifas = [
      { tramo: 1, distancia_desde: 0, distancia_hasta: 3.5, precio: 2500 },
      { tramo: 2, distancia_desde: 3.5, distancia_hasta: 7, precio: 3500 },
    ];
    expect(calculateConfiguredDeliveryCost(2, tarifas)).toBe(2500);
    expect(calculateConfiguredDeliveryCost(3.5, tarifas)).toBe(3500);
    expect(calculateConfiguredDeliveryCost(3.51, tarifas)).toBe(3500);
    expect(calculateConfiguredDeliveryCost(5, tarifas)).toBe(3500);
    expect(calculateConfiguredDeliveryCost(5, [])).toBeNull();
  });

  it("acepta cero kilómetros y tarifas gratuitas configuradas", () => {
    expect(calculateConfiguredDeliveryCost(0, [
      { tramo: 1, distancia_desde: 0, distancia_hasta: 3.5, precio: 0 },
    ])).toBe(0);
  });

  it.each([-1, NaN, Infinity])("rechaza distancias inválidas: %s", (km) => {
    expect(calculateConfiguredDeliveryCost(km, [
      { tramo: 1, distancia_desde: 0, distancia_hasta: 3.5, precio: 2500 },
    ])).toBeNull();
  });

  it("conserva el último tramo para distancias superiores al rango", () => {
    expect(calculateConfiguredDeliveryCost(25, [
      { tramo: 2, distancia_desde: 3.5, distancia_hasta: 7, precio: 3500 },
      { tramo: 1, distancia_desde: 0, distancia_hasta: 3.5, precio: 2500 },
    ])).toBe(3500);
  });

  it.each([-1, NaN, Infinity, 2.5])("rechaza tarifas inválidas: %s", (precio) => {
    expect(calculateConfiguredDeliveryCost(2, [
      { tramo: 1, distancia_desde: 0, distancia_hasta: 3.5, precio },
    ])).toBeNull();
  });

  it("distingue un costo sin ingresar de un envío gratuito explícito", () => {
    expect(parseDeliveryCost("")).toBeNull();
    expect(parseDeliveryCost("  ")).toBeNull();
    expect(parseDeliveryCost("0")).toBe(0);
    expect(parseDeliveryCost("2500")).toBe(2500);
  });

  it.each(["-1", "2500.5", "2500abc", "Infinity", "NaN"])("rechaza costos manuales inválidos: %s", (value) => {
    expect(parseDeliveryCost(value)).toBeNull();
  });

  it("persiste la ubicación seleccionada al convertir un pedido a despacho", () => {
    expect(buildDeliveryLocationFields({
      tipo: "despacho",
      direccion: "  Av. Apoquindo 1234  ",
      referencia: "  Portón azul  ",
      latitud: -33.45,
      longitud: -70.66,
      distanciaKm: 4.567,
    })).toEqual({
      direccion_entrega: "Av. Apoquindo 1234",
      referencia_entrega: "Portón azul",
      latitud_entrega: -33.45,
      longitud_entrega: -70.66,
      distancia_km: 4.57,
    });
  });

  it("elimina la ubicación anterior cuando el pedido cambia a retiro", () => {
    expect(buildDeliveryLocationFields({
      tipo: "retiro",
      direccion: "Av. Apoquindo 1234",
      referencia: "Portón azul",
      latitud: -33.45,
      longitud: -70.66,
      distanciaKm: 4.57,
    })).toEqual({
      direccion_entrega: null,
      referencia_entrega: null,
      latitud_entrega: null,
      longitud_entrega: null,
      distancia_km: null,
    });
  });
});
