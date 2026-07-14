CREATE OR REPLACE FUNCTION public.descontar_stock_pedido_item()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.stock_sucursal ss
  SET cantidad = ss.cantidad - (r.cantidad * NEW.cantidad),
      updated_at = NOW()
  FROM public.recetas r, public.pedidos p
  WHERE r.producto_id = NEW.producto_id
    AND ss.insumo_id = r.insumo_id
    AND p.id = NEW.pedido_id
    AND ss.sucursal_id = p.sucursal_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_descontar_stock ON public.pedido_items;
CREATE TRIGGER trigger_descontar_stock
AFTER INSERT ON public.pedido_items
FOR EACH ROW EXECUTE FUNCTION public.descontar_stock_pedido_item();