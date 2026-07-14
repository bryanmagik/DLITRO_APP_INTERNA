-- Adjuntar trigger para auto-generar numero_pedido
DROP TRIGGER IF EXISTS trg_set_numero_pedido ON public.pedidos;
CREATE TRIGGER trg_set_numero_pedido
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_numero_pedido();

-- Adjuntar trigger para descontar stock al marcar entregado
DROP TRIGGER IF EXISTS trg_descontar_stock ON public.pedidos;
CREATE TRIGGER trg_descontar_stock
  AFTER UPDATE OF estado ON public.pedidos
  FOR EACH ROW
  WHEN (NEW.estado = 'entregado' AND OLD.estado IS DISTINCT FROM 'entregado')
  EXECUTE FUNCTION public.descontar_stock_pedido();

-- Permitir que numero_pedido se omita en el INSERT (el trigger lo asigna)
ALTER TABLE public.pedidos ALTER COLUMN numero_pedido DROP NOT NULL;