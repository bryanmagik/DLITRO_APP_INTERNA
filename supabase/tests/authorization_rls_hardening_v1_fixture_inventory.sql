select jsonb_build_object(
  'sucursales', (select count(*) from public.sucursales),
  'usuarios_por_rol', (
    select coalesce(jsonb_object_agg(rol::text, cantidad), '{}'::jsonb)
    from (
      select rol, count(*) as cantidad
      from public.usuarios
      group by rol
      order by rol
    ) roles
  ),
  'productos', (select count(*) from public.productos),
  'despachadores_con_sucursal', (
    select count(*) from public.usuarios
    where rol = 'despachador' and sucursal_id is not null and activo is true
  ),
  'admins', (
    select count(*) from public.usuarios
    where rol in ('superadmin', 'admin') and activo is true
  )
) as fixture_inventory;
