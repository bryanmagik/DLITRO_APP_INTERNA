CREATE TABLE IF NOT EXISTS public.tarifas_despachador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  horas INT NOT NULL UNIQUE,
  descripcion TEXT NOT NULL,
  monto INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT ON public.tarifas_despachador TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tarifas_despachador TO authenticated;
GRANT ALL ON public.tarifas_despachador TO service_role;

ALTER TABLE public.tarifas_despachador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarifas_despachador_read_all"
ON public.tarifas_despachador
FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "tarifas_despachador_admin_modify"
ON public.tarifas_despachador
FOR ALL
TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

INSERT INTO public.tarifas_despachador (horas, descripcion, monto) VALUES
  (0,  'Menos de 8 horas', 0),
  (8,  '8 horas',  17000),
  (9,  '9 horas',  19000),
  (10, '10 horas', 21000),
  (11, '11 horas', 23000),
  (12, '12 horas', 25000),
  (13, '13 horas', 27000),
  (14, '14 horas', 29000),
  (15, '15 horas', 31000)
ON CONFLICT (horas) DO NOTHING;