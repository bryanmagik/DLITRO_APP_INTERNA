ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'local',
  ADD COLUMN IF NOT EXISTS tiempo_estimado_minutos INT,
  ADD COLUMN IF NOT EXISTS estado_confirmacion TEXT NOT NULL DEFAULT 'confirmado',
  ADD COLUMN IF NOT EXISTS motivo_rechazo TEXT;

CREATE INDEX IF NOT EXISTS idx_pedidos_pendientes_online
  ON public.pedidos (sucursal_id, estado_confirmacion)
  WHERE estado_confirmacion = 'pendiente_confirmacion';

ALTER TABLE public.pedidos REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'pedidos'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.pedidos';
  END IF;
END $$;