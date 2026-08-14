ALTER TABLE public.stock_sucursal
  ADD COLUMN IF NOT EXISTS stock_minimo_observacion NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS stock_minimo_critico NUMERIC NOT NULL DEFAULT 0;

UPDATE public.stock_sucursal
SET stock_minimo_observacion = COALESCE(stock_minimo, 0)
WHERE stock_minimo_observacion = 0 AND COALESCE(stock_minimo, 0) > 0;