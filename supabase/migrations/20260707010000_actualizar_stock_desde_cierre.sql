CREATE OR REPLACE FUNCTION public.actualizar_stock_desde_cierre()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_sucursal_id UUID;
BEGIN
  IF NEW.cantidad_real IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sucursal_id INTO v_sucursal_id
  FROM turnos
  WHERE id = NEW.turno_id;

  IF v_sucursal_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO stock_sucursal (insumo_id, sucursal_id, cantidad)
  VALUES (NEW.insumo_id, v_sucursal_id, NEW.cantidad_real)
  ON CONFLICT (sucursal_id, insumo_id)
  DO UPDATE SET
    cantidad = EXCLUDED.cantidad,
    updated_at = now();

  INSERT INTO stock_movimientos (
    insumo_id,
    sucursal_id,
    tipo,
    cantidad,
    es_bodega,
    referencia_tipo,
    referencia_id,
    notas
  ) VALUES (
    NEW.insumo_id,
    v_sucursal_id,
    'inventario_cierre',
    NEW.cantidad_real - NEW.cantidad_ideal,
    false,
    'inventario_cierre',
    NEW.id,
    'Ajuste por inventario de cierre de turno'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_actualizar_stock_cierre ON public.inventario_cierre;

CREATE TRIGGER trg_actualizar_stock_cierre
AFTER INSERT OR UPDATE OF cantidad_real ON public.inventario_cierre
FOR EACH ROW
WHEN (NEW.cantidad_real IS NOT NULL)
EXECUTE FUNCTION public.actualizar_stock_desde_cierre();
