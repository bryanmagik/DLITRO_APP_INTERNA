-- RLS pedido_items
ALTER TABLE public.pedido_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_insert_pedido_items" ON public.pedido_items
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read_pedido_items" ON public.pedido_items
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

CREATE POLICY "authenticated_update_pedido_items" ON public.pedido_items
  FOR UPDATE TO authenticated
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_delete_pedido_items" ON public.pedido_items
  FOR DELETE TO authenticated
  USING (auth.role() = 'authenticated');

-- Numero pedido global
CREATE SEQUENCE IF NOT EXISTS public.global_pedido_sequence START 1;

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS numero_pedido_global INTEGER;

CREATE OR REPLACE FUNCTION public.set_numero_pedido_global()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.numero_pedido_global IS NULL THEN
    NEW.numero_pedido_global := nextval('public.global_pedido_sequence');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_numero_pedido_global ON public.pedidos;
CREATE TRIGGER trg_set_numero_pedido_global
  BEFORE INSERT ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_numero_pedido_global();