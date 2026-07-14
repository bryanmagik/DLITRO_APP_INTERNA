
-- 1) Add 'logistica' role
ALTER TYPE public.rol_usuario ADD VALUE IF NOT EXISTS 'logistica';

-- 2) Enable RLS + policies on logistica tables
ALTER TABLE public.pedidos_logistica ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pedidos_logistica_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_bodega_central ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS authenticated_all_pedidos_logistica ON public.pedidos_logistica;
CREATE POLICY authenticated_all_pedidos_logistica ON public.pedidos_logistica
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_all_pedidos_logistica_items ON public.pedidos_logistica_items;
CREATE POLICY authenticated_all_pedidos_logistica_items ON public.pedidos_logistica_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS authenticated_all_stock_bodega_central ON public.stock_bodega_central;
CREATE POLICY authenticated_all_stock_bodega_central ON public.stock_bodega_central
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 3) Trigger: when pedido_logistica becomes 'entregado', sum items into stock_sucursal & subtract from bodega central
CREATE OR REPLACE FUNCTION public.aplicar_entrega_logistica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'entregado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'entregado') THEN
    -- sumar a sucursal
    INSERT INTO public.stock_sucursal (sucursal_id, insumo_id, cantidad)
    SELECT NEW.sucursal_id, pli.insumo_id, COALESCE(pli.cantidad_enviada, pli.cantidad_solicitada)
    FROM public.pedidos_logistica_items pli
    WHERE pli.pedido_id = NEW.id
    ON CONFLICT (sucursal_id, insumo_id) DO UPDATE
      SET cantidad = public.stock_sucursal.cantidad + EXCLUDED.cantidad,
          updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

-- unique constraint required for ON CONFLICT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'stock_sucursal_sucursal_insumo_unique'
  ) THEN
    ALTER TABLE public.stock_sucursal
      ADD CONSTRAINT stock_sucursal_sucursal_insumo_unique UNIQUE (sucursal_id, insumo_id);
  END IF;
END$$;

DROP TRIGGER IF EXISTS trg_aplicar_entrega_logistica ON public.pedidos_logistica;
CREATE TRIGGER trg_aplicar_entrega_logistica
AFTER INSERT OR UPDATE OF estado ON public.pedidos_logistica
FOR EACH ROW EXECUTE FUNCTION public.aplicar_entrega_logistica();

-- 4) Trigger to subtract from stock_bodega_central on 'en_camino'
CREATE OR REPLACE FUNCTION public.descontar_bodega_central_logistica()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.estado = 'en_camino' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'en_camino') THEN
    INSERT INTO public.stock_bodega_central (insumo_id, cantidad)
    SELECT pli.insumo_id, -COALESCE(pli.cantidad_enviada, pli.cantidad_solicitada)
    FROM public.pedidos_logistica_items pli
    WHERE pli.pedido_id = NEW.id
    ON CONFLICT (insumo_id) DO UPDATE
      SET cantidad = public.stock_bodega_central.cantidad - (
        SELECT COALESCE(SUM(COALESCE(cantidad_enviada, cantidad_solicitada)), 0)
        FROM public.pedidos_logistica_items WHERE pedido_id = NEW.id AND insumo_id = EXCLUDED.insumo_id
      ),
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'stock_bodega_central_insumo_unique'
  ) THEN
    ALTER TABLE public.stock_bodega_central
      ADD CONSTRAINT stock_bodega_central_insumo_unique UNIQUE (insumo_id);
  END IF;
END$$;

DROP TRIGGER IF EXISTS trg_descontar_bodega_central_logistica ON public.pedidos_logistica;
CREATE TRIGGER trg_descontar_bodega_central_logistica
AFTER UPDATE OF estado ON public.pedidos_logistica
FOR EACH ROW EXECUTE FUNCTION public.descontar_bodega_central_logistica();
