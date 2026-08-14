CREATE TABLE IF NOT EXISTS public.prestamos_despachador (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID NOT NULL REFERENCES public.turnos(id) ON DELETE CASCADE,
  despachador_id UUID NOT NULL REFERENCES public.usuarios(id),
  monto INT NOT NULL,
  devuelto BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (turno_id, despachador_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prestamos_despachador TO authenticated;
GRANT ALL ON public.prestamos_despachador TO service_role;

ALTER TABLE public.prestamos_despachador ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read prestamos" ON public.prestamos_despachador FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert prestamos" ON public.prestamos_despachador FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update prestamos" ON public.prestamos_despachador FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete prestamos" ON public.prestamos_despachador FOR DELETE TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.touch_prestamos_despachador()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;

CREATE TRIGGER update_prestamos_despachador_updated_at
BEFORE UPDATE ON public.prestamos_despachador
FOR EACH ROW EXECUTE FUNCTION public.touch_prestamos_despachador();