export interface ResumenEfectivoTurno {
  cajaChicaApertura: number;
  ventasEfectivo: number;
  gastosEfectivo: number;
  pagosDespachadores: number;
}
export function calcularEfectivoEsperadoTurno(resumen: ResumenEfectivoTurno): number {
  return resumen.cajaChicaApertura
    + resumen.ventasEfectivo
    - resumen.gastosEfectivo
    - resumen.pagosDespachadores;
}

export function parsearEfectivoDeclarado(valor: string): number | null {
  const normalizado = valor.trim();
  if (!/^\d+$/.test(normalizado)) return null;

  const monto = Number(normalizado);
  if (!Number.isSafeInteger(monto) || monto > 2_147_483_647) return null;
  return monto;
}
