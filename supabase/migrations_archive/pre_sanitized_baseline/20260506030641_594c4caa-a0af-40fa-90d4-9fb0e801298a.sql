-- Security definer functions to avoid recursion in RLS
CREATE OR REPLACE FUNCTION public.get_user_rol(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT rol::text FROM public.usuarios WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_user_sucursal(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sucursal_id FROM public.usuarios WHERE id = _user_id LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = _user_id AND rol IN ('superadmin', 'admin')
  );
$$;

-- usuarios
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "usuarios_self_select" ON public.usuarios
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "usuarios_admin_all" ON public.usuarios
  FOR ALL USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "usuarios_encargado_sucursal_select" ON public.usuarios
  FOR SELECT USING (
    public.get_user_rol(auth.uid()) = 'encargado'
    AND sucursal_id = public.get_user_sucursal(auth.uid())
  );

-- sucursales
ALTER TABLE public.sucursales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sucursales_authenticated_select" ON public.sucursales
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "sucursales_admin_modify" ON public.sucursales
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "sucursales_admin_update" ON public.sucursales
  FOR UPDATE TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "sucursales_admin_delete" ON public.sucursales
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- categorias
ALTER TABLE public.categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categorias_authenticated_select" ON public.categorias
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "categorias_admin_modify" ON public.categorias
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- productos
ALTER TABLE public.productos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "productos_authenticated_select" ON public.productos
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "productos_admin_modify" ON public.productos
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- historial_precios
ALTER TABLE public.historial_precios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "historial_admin_select" ON public.historial_precios
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

CREATE POLICY "historial_authenticated_insert" ON public.historial_precios
  FOR INSERT TO authenticated WITH CHECK (true);