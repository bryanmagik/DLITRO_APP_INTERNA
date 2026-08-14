-- Seguimiento público de pedidos online sin abrir RLS en toda la tabla pedidos
CREATE OR REPLACE FUNCTION public.get_seguimiento_pedido(p_pedido_id uuid)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT to_json(p)
  FROM (
    SELECT
      id,
      numero_pedido,
      cliente_nombre,
      tipo,
      estado,
      estado_confirmacion,
      tiempo_estimado_minutos,
      motivo_rechazo,
      created_at
    FROM public.pedidos
    WHERE id = p_pedido_id
      AND origen = 'online'
  ) p;
$$;

GRANT EXECUTE ON FUNCTION public.get_seguimiento_pedido(uuid) TO anon, authenticated;
