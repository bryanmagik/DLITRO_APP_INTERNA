import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportarContadorExcel } from "./exportContadorExcel";

const mock = vi.hoisted(() => ({
  tables: {} as Record<string, Record<string, unknown>[]>,
  errorTable: "",
  sheets: [] as { sheet: string; data: { value: string | number }[][] }[],
  save: vi.fn(),
}));

vi.mock("write-excel-file/browser", () => ({ default: (sheets: typeof mock.sheets) => {
  mock.sheets = sheets;
  return { toFile: mock.save };
} }));

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  let rows = [...(mock.tables[table] ?? [])];
  const query = {
    select: () => query,
    gte: () => query,
    lte: () => query,
    order: () => query,
    eq: (field: string, value: unknown) => { rows = rows.filter((row) => row[field] === value); return query; },
    in: (field: string, values: unknown[]) => { rows = rows.filter((row) => values.includes(row[field])); return query; },
    range: (from: number, to: number) => Promise.resolve({ data: rows.slice(from, to + 1), error: mock.errorTable === table ? { message: "Falló la consulta" } : null }),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
  };
  return query;
} } }));

const params = { fechaInicio: "2026-10-04", fechaFin: "2026-10-04", sucursalId: null, sucursalNombreArchivo: "TODAS" };
const turno = (id: string) => ({ id, fecha_dlitro: "2026-10-04", sucursal_id: "s1", tomador_id: "u1", sucursales: { nombre: "Sucursal QA" } });
const pedido = (id: string, estado: string, tipo = "retiro", turno_id = "t1") => ({ id, turno_id, estado, tipo, descuento: 0 });
function resumen() {
  const sheet = mock.sheets.find((s) => s.sheet === "Resumen Diario")!;
  return Object.fromEntries(sheet.data[0].map((cell, index) => [cell.value, sheet.data[1][index].value]));
}

beforeEach(() => {
  mock.tables = { turnos: [turno("t1")], pedidos: [] };
  mock.errorTable = "";
  mock.sheets = [];
  mock.save.mockReset();
});

describe("Excel de caja diaria", () => {
  it("cuenta cada entregado una vez, incluye plataformas y separa pendientes y cancelados", async () => {
    mock.tables.turnos.push(turno("t2"));
    mock.tables.pedidos = [pedido("a", "entregado"), pedido("b", "entregado", "despacho"), pedido("c", "entregado", "uber"), pedido("d", "entregado", "rappi", "t2"), pedido("e", "tomado"), pedido("f", "en_preparacion", "uber"), pedido("g", "cancelado", "rappi")];
    mock.tables.pagos_turno = [{ id: "p1", turno_id: "t1", metodo: "efectivo", monto: 12000 }, { id: "p2", turno_id: "t1", metodo: "transferencia", monto: 8000 }];
    await exportarContadorExcel(params);
    expect(resumen()).toMatchObject({ PEDIDOS: 4, RETIROS: 1, DESPACHOS: 1, UBER: 1, RAPPI: 1, "PEDIDOS PENDIENTES": 2, "PEDIDOS CANCELADOS": 1, EFECTIVO: 12000, TRANSFERENCIA: 8000 });
    expect(mock.sheets.find((s) => s.sheet === "Resumen Diario")!.data).toHaveLength(2);
    expect(mock.sheets.some((s) => s.sheet === "Criterios")).toBe(true);
    expect(mock.save).toHaveBeenCalledOnce();
  });

  it("carga más de mil pedidos sin perder los de la segunda página", async () => {
    mock.tables.pedidos = Array.from({ length: 1001 }, (_, index) => pedido(`p${index}`, "entregado"));
    await exportarContadorExcel(params);
    expect(resumen().PEDIDOS).toBe(1001);
  });

  it("separa efectivo neto y bruto descontando solo egresos efectivos de los turnos incluidos", async () => {
    mock.tables.turnos.push(turno("t2"));
    mock.tables.pagos_turno = [
      { turno_id: "t1", metodo: "efectivo", monto: 100000 },
      { turno_id: "t2", metodo: "efectivo", monto: 20000 },
      { turno_id: "t1", metodo: "transferencia", monto: 8000 },
      { turno_id: "t1", metodo: "tarjeta", monto: 9000 },
      { turno_id: "otro", metodo: "efectivo", monto: 999999 },
    ];
    mock.tables.gastos_turno = [
      { turno_id: "t1", metodo: "efectivo", monto: 5000, concepto: "Once" },
      { turno_id: "t2", metodo: "efectivo", monto: 3000, concepto: "Insumos" },
      { turno_id: "t1", metodo: "transferencia", monto: 7000, concepto: "Compra" },
      { turno_id: "t1", metodo: "tarjeta", monto: 6000, concepto: "Compra" },
      { turno_id: "t1", metodo: "efectivo", monto: 4000, concepto: "Ingreso caja chica adicional" },
      { turno_id: "otro", metodo: "efectivo", monto: 999999, concepto: "Otro turno" },
    ];
    mock.tables.pago_despachadores = [
      { turno_id: "t1", base_por_horas: 10000, total_a_pagar: 15000, pagado: true },
      { turno_id: "t2", base_por_horas: 5000, total_a_pagar: 7000, pagado: true },
      { turno_id: "t1", base_por_horas: 3000, total_a_pagar: 6000, pagado: false },
      { turno_id: "t1", base_por_horas: 0, total_a_pagar: -1000, pagado: true },
      { turno_id: "otro", base_por_horas: 999999, total_a_pagar: 999999, pagado: true },
    ];
    await exportarContadorExcel(params);
    expect(resumen()).toMatchObject({ EFECTIVO: 90000, "EFECTIVO TOTAL CAJA": 120000, TRANSFERENCIA: 8000, TARJETA: 9000, ONCE: 5000, "DESPACHO DLITRO": 18000 });
  });

  it("conserva un efectivo neto negativo cuando los egresos superan las ventas", async () => {
    mock.tables.pagos_turno = [{ turno_id: "t1", metodo: "efectivo", monto: 1000 }];
    mock.tables.gastos_turno = [{ turno_id: "t1", metodo: "efectivo", monto: 3000, concepto: "Compra" }];
    await exportarContadorExcel(params);
    expect(resumen()).toMatchObject({ EFECTIVO: -2000, "EFECTIVO TOTAL CAJA": 1000 });
  });

  it("incluye local y puerta en retiros, reconoce delivery y concilia sin duplicar puerta", async () => {
    mock.tables.pedidos = [
      pedido("a", "entregado", "local"), pedido("b", "entregado", "retiro"),
      pedido("c", "entregado", "delivery"), pedido("d", "entregado", "despacho"),
      pedido("e", "entregado", "uber"), pedido("f", "entregado", "rappi"),
      pedido("g", "entregado", "puerta"), pedido("h", "tomado", "local"),
      pedido("i", "cancelado", "delivery"),
    ];
    await exportarContadorExcel(params);
    const result = resumen();
    expect(result).toMatchObject({ PEDIDOS: 7, RETIROS: 3, DESPACHOS: 2, UBER: 1, RAPPI: 1, PUERTA: 1, "PEDIDOS PENDIENTES": 1, "PEDIDOS CANCELADOS": 1 });
    expect(result.PEDIDOS).toBe(Number(result.RETIROS) + Number(result.DESPACHOS) + Number(result.UBER) + Number(result.RAPPI));
    const criterios = Object.fromEntries(mock.sheets.find((s) => s.sheet === "Criterios")!.data.map((row) => [row[0].value, row[1].value]));
    expect(criterios.PEDIDOS).toContain("PEDIDOS = RETIROS + DESPACHOS + UBER + RAPPI.");
    expect(criterios.PUERTA).toContain("ya incluidos en RETIROS");
  });

  it("incluye solo puerta entregados en retiros y mantiene pendientes y cancelados separados", async () => {
    mock.tables.pedidos = [pedido("a", "entregado", "puerta"), pedido("b", "entregado", "puerta"), pedido("c", "tomado", "puerta"), pedido("d", "cancelado", "puerta")];
    await exportarContadorExcel(params);
    expect(resumen()).toMatchObject({ PEDIDOS: 2, RETIROS: 2, PUERTA: 2, DESPACHOS: 0, "PEDIDOS PENDIENTES": 1, "PEDIDOS CANCELADOS": 1 });
  });

  it("carga más de mil turnos y agrupa todos los de la misma fecha y sucursal", async () => {
    mock.tables.turnos = Array.from({ length: 1001 }, (_, index) => turno(`t${index}`));
    mock.tables.pedidos = [pedido("last", "entregado", "retiro", "t1000")];
    await exportarContadorExcel(params);
    expect(resumen().PEDIDOS).toBe(1);
  });

  it("no descarga un informe parcial si falla la carga de pedidos", async () => {
    mock.errorTable = "pedidos";
    await expect(exportarContadorExcel(params)).rejects.toThrow("Falló la consulta");
    expect(mock.save).not.toHaveBeenCalled();
  });
});
