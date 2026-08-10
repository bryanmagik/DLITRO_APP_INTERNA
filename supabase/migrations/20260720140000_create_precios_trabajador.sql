ALTER TYPE public.tipo_promo ADD VALUE IF NOT EXISTS 'trabajador';

CREATE TABLE IF NOT EXISTS public.precios_trabajador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id UUID REFERENCES public.productos(id) NOT NULL,
  precio_trabajador INT NOT NULL,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(producto_id)
);

CREATE INDEX IF NOT EXISTS idx_precios_trabajador_producto ON public.precios_trabajador(producto_id);

INSERT INTO public.precios_trabajador (producto_id, precio_trabajador)
SELECT id, 7000 FROM public.productos
WHERE nombre NOT ILIKE '%Corona%' AND COALESCE(activo, true) = true
ON CONFLICT (producto_id) DO NOTHING;

INSERT INTO public.precios_trabajador (producto_id, precio_trabajador)
SELECT id, 8000 FROM public.productos
WHERE nombre ILIKE '%Corona%' AND COALESCE(activo, true) = true
ON CONFLICT (producto_id) DO NOTHING;
