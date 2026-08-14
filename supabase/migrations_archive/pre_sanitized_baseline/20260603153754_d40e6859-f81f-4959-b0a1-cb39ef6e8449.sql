
CREATE TABLE public.inventarios_parciales (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  turno_id UUID NOT NULL,
  sucursal_id UUID NOT NULL,
  usuario_id UUID,
  motivo TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventarios_parciales TO authenticated;
GRANT ALL ON public.inventarios_parciales TO service_role;
ALTER TABLE public.inventarios_parciales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_inventarios_parciales" ON public.inventarios_parciales
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.inventarios_parciales_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inventario_id UUID NOT NULL REFERENCES public.inventarios_parciales(id) ON DELETE CASCADE,
  insumo_id UUID NOT NULL,
  cantidad_real NUMERIC NOT NULL DEFAULT 0,
  conteo_original TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventarios_parciales_items TO authenticated;
GRANT ALL ON public.inventarios_parciales_items TO service_role;
ALTER TABLE public.inventarios_parciales_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_all_inventarios_parciales_items" ON public.inventarios_parciales_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX idx_inventarios_parciales_turno ON public.inventarios_parciales(turno_id);
CREATE INDEX idx_inventarios_parciales_items_inv ON public.inventarios_parciales_items(inventario_id);
