CREATE TABLE public.tarifas_despacho (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tramo INT NOT NULL UNIQUE,
  distancia_desde NUMERIC NOT NULL,
  distancia_hasta NUMERIC NOT NULL,
  descripcion TEXT NOT NULL,
  precio INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas_despacho TO authenticated;
GRANT ALL ON public.tarifas_despacho TO service_role;

ALTER TABLE public.tarifas_despacho ENABLE ROW LEVEL SECURITY;

CREATE POLICY tarifas_despacho_read_all
  ON public.tarifas_despacho FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY tarifas_despacho_admin_modify
  ON public.tarifas_despacho FOR ALL
  TO authenticated
  USING (is_admin(auth.uid()))
  WITH CHECK (is_admin(auth.uid()));

INSERT INTO public.tarifas_despacho (tramo, distancia_desde, distancia_hasta, descripcion, precio) VALUES
  (1, 0,    3.5,  'Hasta 3.5 km',      2000),
  (2, 3.5,  7.0,  '3.5 km a 7 km',     3000),
  (3, 7.0,  10.5, '7 km a 10.5 km',    4000),
  (4, 10.5, 14.0, '10.5 km a 14 km',   5000),
  (5, 14.0, 17.5, '14 km a 17.5 km',   6000),
  (6, 17.5, 21.0, '17.5 km a 21 km',   7000)
ON CONFLICT (tramo) DO NOTHING;