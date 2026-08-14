ALTER TABLE public.turnos DROP CONSTRAINT IF EXISTS un_turno_abierto;

CREATE UNIQUE INDEX IF NOT EXISTS un_turno_abierto_por_sucursal
  ON public.turnos (sucursal_id)
  WHERE estado = 'abierto';