CREATE TABLE IF NOT EXISTS public.log_cambios_pedido (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id UUID REFERENCES public.pedidos(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES public.usuarios(id),
  campo TEXT NOT NULL,
  valor_anterior TEXT,
  valor_nuevo TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_log_cambios_pedido_pedido_id ON public.log_cambios_pedido(pedido_id);
CREATE INDEX IF NOT EXISTS idx_log_cambios_pedido_created_at ON public.log_cambios_pedido(created_at DESC);

ALTER TABLE public.log_cambios_pedido ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_superadmin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = _user_id AND rol = 'superadmin'
  );
$$;

CREATE POLICY "log_cambios_pedido_superadmin_all"
  ON public.log_cambios_pedido
  FOR ALL
  TO authenticated
  USING (public.is_superadmin(auth.uid()))
  WITH CHECK (public.is_superadmin(auth.uid()));
