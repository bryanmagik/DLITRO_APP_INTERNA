/** Referencia estándar para transferencias: #12 */
export function referenciaPagoTransferencia(numeroPedido: number | null | undefined): string | null {
  if (numeroPedido == null) return null;
  return `#${numeroPedido}`;
}
