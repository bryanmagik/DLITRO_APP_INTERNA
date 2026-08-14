ALTER TABLE public.turnos
ADD COLUMN IF NOT EXISTS comentario_contador TEXT,
ADD COLUMN IF NOT EXISTS comentario_contador_usuario_id UUID REFERENCES public.usuarios(id),
ADD COLUMN IF NOT EXISTS comentario_contador_fecha TIMESTAMPTZ;
