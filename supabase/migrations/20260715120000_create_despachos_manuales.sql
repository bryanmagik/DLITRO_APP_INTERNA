-- Despachos manuales: carreras no asociadas a un pedido del sistema
CREATE TABLE IF NOT EXISTS public.despachos_manuales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turno_id UUID NOT NULL REFERENCES public.turnos(id),
  despachador_id UUID NOT NULL REFERENCES public.usuarios(id),
  concepto TEXT NOT NULL,
  monto INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.despachos_manuales DISABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE public.despachos_manuales TO anon, authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_despachos_manuales_turno_desp
  ON public.despachos_manuales (turno_id, despachador_id);
