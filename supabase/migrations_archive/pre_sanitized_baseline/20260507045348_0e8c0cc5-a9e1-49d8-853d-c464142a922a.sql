CREATE OR REPLACE FUNCTION public.descontar_stock_pedido()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Solo descontar cuando el pedido pasa a 'entregado'
  IF NEW.estado = 'entregado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'entregado') THEN
    UPDATE stock_sucursal ss
    SET cantidad = ss.cantidad - sub.total_descontar,
        updated_at = NOW()
    FROM (
      SELECT r.insumo_id, SUM(r.cantidad * pi.cantidad) AS total_descontar
      FROM pedido_items pi
      JOIN recetas r ON r.producto_id = pi.producto_id
      WHERE pi.pedido_id = NEW.id
      GROUP BY r.insumo_id
    ) sub
    WHERE ss.insumo_id = sub.insumo_id
      AND ss.sucursal_id = NEW.sucursal_id;
  END IF;
  RETURN NEW;
END;
$function$;