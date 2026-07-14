CREATE TABLE IF NOT EXISTS public.cambios_turno (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID NOT NULL REFERENCES public.turnos(id) ON DELETE CASCADE,
  tomador_saliente_id UUID NOT NULL,
  tomador_entrante_id UUID NOT NULL,
  efectivo_sistema INT NOT NULL,
  efectivo_declarado INT NOT NULL,
  diferencia INT,
  observacion TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cambios_turno TO authenticated;
GRANT ALL ON public.cambios_turno TO service_role;

ALTER TABLE public.cambios_turno ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_all_cambios_turno" ON public.cambios_turno
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cambios_turno_turno_id ON public.cambios_turno(turno_id);
CREATE INDEX IF NOT EXISTS idx_cambios_turno_created_at ON public.cambios_turno(created_at);