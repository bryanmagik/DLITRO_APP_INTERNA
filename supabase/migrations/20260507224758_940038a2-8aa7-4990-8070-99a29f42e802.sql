ALTER TABLE public.turnos ADD COLUMN IF NOT EXISTS fecha_dlitro DATE;

CREATE OR REPLACE FUNCTION public.get_dlitro_day(ts TIMESTAMPTZ)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'America/Santiago') < 6
    THEN ((ts AT TIME ZONE 'America/Santiago')::DATE - INTERVAL '1 day')::DATE
    ELSE (ts AT TIME ZONE 'America/Santiago')::DATE
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_fecha_dlitro()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.fecha_dlitro IS NULL THEN
    NEW.fecha_dlitro := public.get_dlitro_day(COALESCE(NEW.created_at, NOW()));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_fecha_dlitro ON public.turnos;
CREATE TRIGGER trg_set_fecha_dlitro
BEFORE INSERT ON public.turnos
FOR EACH ROW EXECUTE FUNCTION public.set_fecha_dlitro();

-- Backfill existing rows
UPDATE public.turnos SET fecha_dlitro = public.get_dlitro_day(created_at) WHERE fecha_dlitro IS NULL;