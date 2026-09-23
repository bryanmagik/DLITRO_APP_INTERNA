import { useState } from "react";
import { Printer, ChefHat, Copy, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type ComandaItem, normalizarTipoComanda } from "@/lib/printComanda";
import { buildComandaCocinaItems, comandaItemFromPedidoItem } from "@/lib/pedidoImpresion";
import { reimprimirCocina, reimprimirToma } from "@/services/printer";
import { pagoEsperadoDetalleFromPedido } from "@/lib/pagoEsperado";

interface Pedido {
  id: string;
  numero_pedido: number;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo: string;
  total: number;
  subtotal: number;
  descuento: number | null;
  costo_despacho: number | null;
  metodo_pago: string | null;
  pago_registrado: boolean | null;
  pago_esperado_efectivo?: number | null;
  pago_esperado_transferencia?: number | null;
  pago_esperado_tarjeta?: number | null;
  monto_recibido: number | null;
  direccion_entrega: string | null;
  referencia_entrega: string | null;
  despachador_id: string | null;
  notas: string | null;
  jarros_prometidos?: number | null;
  promo_tipo?: string | null;
}

interface Despachador {
  id: string;
  nombre: string;
  nombre_completo: string | null;
}

export default function SeleccionImpresionModal({
  pedido,
  despachadores,
  sucursalNombre,
  open,
  onClose,
  itemsOverride,
  removedItems,
  editado,
}: {
  pedido: Pedido | null;
  despachadores: Despachador[];
  sucursalNombre: string;
  open: boolean;
  onClose: () => void;
  itemsOverride?: ComandaItem[];
  removedItems?: ComandaItem[];
  editado?: boolean;
}) {
  const [imprimiendo, setImprimiendo] = useState(false);

  const ejecutar = async (tipo: "toma" | "cocina" | "ambas") => {
    if (!pedido) return;
    setImprimiendo(true);

    let items: ComandaItem[];
    if (itemsOverride) {
      items = itemsOverride;
    } else {
      const { data, error } = await supabase
        .from("pedido_items")
        .select("cantidad, precio_unitario, descuento_item, notas, producto:producto_id(nombre)")
        .eq("pedido_id", pedido.id);

      if (error) {
        toast.error("No se pudieron cargar los items");
        setImprimiendo(false);
        return;
      }

      const rows = (data as unknown as Array<{
        cantidad: number;
        precio_unitario: number;
        descuento_item: number | null;
        notas: string | null;
        producto: { nombre: string } | null;
      }>) ?? [];

      items = rows.map((r) =>
        comandaItemFromPedidoItem({
          cantidad: r.cantidad,
          precio_unitario: r.precio_unitario,
          descuento_item: r.descuento_item,
          notas: r.notas,
          nombre: r.producto?.nombre ?? "—",
        }),
      );
    }

    const itemsConCancelados: ComandaItem[] = [
      ...items,
      ...((removedItems ?? []).map((r) => ({ ...r, marker: "cancelado" as const }))),
    ];

    const desp = despachadores.find((d) => d.id === pedido.despachador_id);
    const tipoComanda = normalizarTipoComanda(pedido.tipo);

    try {
      if (tipo === "toma" || tipo === "ambas") {
        await reimprimirToma({
          numero: pedido.numero_pedido,
          sucursalNombre,
          tipo: tipoComanda,
          cliente: pedido.cliente_nombre,
          telefono: pedido.cliente_telefono,
          direccion: pedido.direccion_entrega,
          referencia: pedido.referencia_entrega,
          despachador: desp ? (desp.nombre_completo || desp.nombre) : null,
          items: itemsConCancelados,
          subtotal: pedido.subtotal,
          descuento: pedido.descuento ?? 0,
          costoDespacho: pedido.costo_despacho ?? 0,
          total: pedido.total,
          notas: pedido.notas,
          metodoPago: pedido.metodo_pago,
          pagoRegistrado: pedido.pago_registrado ?? false,
          pagoEsperadoDetalle: pagoEsperadoDetalleFromPedido(pedido),
          montoRecibido: pedido.monto_recibido,
          promoLabel: pedido.promo_tipo === "trabajador" ? "PRECIO TRABAJADOR" : null,
          editado,
        });
      }

      if (tipo === "cocina" || tipo === "ambas") {
        await reimprimirCocina({
          numero: pedido.numero_pedido,
          sucursalNombre,
          tipo: tipoComanda,
          cliente: pedido.cliente_nombre,
          telefono: pedido.cliente_telefono,
          direccion: pedido.direccion_entrega,
          referencia: pedido.referencia_entrega,
          items: buildComandaCocinaItems(itemsConCancelados),
          notas: pedido.notas,
          editado,
          total: pedido.total,
          subtotal: pedido.subtotal,
          descuentoJarros: (pedido.jarros_prometidos ?? 0) > 0 ? (pedido.descuento ?? 0) : 0,
          metodoPago: pedido.metodo_pago,
          pagoRegistrado: pedido.pago_registrado ?? false,
          pagoEsperadoDetalle: pagoEsperadoDetalleFromPedido(pedido),
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo imprimir");
      setImprimiendo(false);
      return;
    }

    setImprimiendo(false);
    onClose();
  };

  if (!pedido) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => !imprimiendo && !o && onClose()}>
      <DialogContent className="max-w-lg p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            {editado ? "Pedido editado — ¿qué deseas reimprimir?" : "¿Qué deseas imprimir?"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <Button
            disabled={imprimiendo}
            onClick={() => ejecutar("toma")}
            className="w-full h-auto py-4 justify-start gap-4 text-left border-2 hover:border-primary hover:bg-primary/5"
            variant="outline"
          >
            <Printer className="h-6 w-6 shrink-0 text-primary" />
            <div>
              <div className="font-semibold text-base">Toma de Pedidos</div>
              <div className="text-xs text-muted-foreground leading-tight">Comanda completa con datos del cliente, dirección, pago y total</div>
            </div>
          </Button>

          <Button
            disabled={imprimiendo}
            onClick={() => ejecutar("cocina")}
            className="w-full h-auto py-4 justify-start gap-4 text-left border-2 hover:border-orange-500 hover:bg-orange-500/5"
            variant="outline"
          >
            <ChefHat className="h-6 w-6 shrink-0 text-orange-500" />
            <div>
              <div className="font-semibold text-base">Cocina</div>
              <div className="text-xs text-muted-foreground leading-tight">Comanda simplificada con productos grandes y notas</div>
            </div>
          </Button>

          <Button
            disabled={imprimiendo}
            onClick={() => ejecutar("ambas")}
            className="w-full h-auto py-4 justify-start gap-4 text-left"
            variant="default"
          >
            {imprimiendo ? <Loader2 className="h-6 w-6 shrink-0 animate-spin" /> : <Copy className="h-6 w-6 shrink-0" />}
            <div>
              <div className="font-semibold text-base">Ambas</div>
              <div className="text-xs text-primary-foreground/80 leading-tight">Imprime las dos comandas seguidas</div>
            </div>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
