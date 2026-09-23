-- Las vistas historicas se crearon con los privilegios del propietario.
-- Mantener sus consultas, pero aplicar los GRANT y RLS de las tablas base
-- al usuario que realmente las consulta.
alter view public.v_stock_bajo_minimo set (security_invoker = true);
alter view public.v_ventas_dia set (security_invoker = true);
