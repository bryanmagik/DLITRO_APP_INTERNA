-- Map-only branch directory: preserve sucursales RLS and exclude clave_canje.
create function private.dispatch_map_branches()
returns table(id uuid, nombre text, direccion text, latitud double precision, longitud double precision)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or not (
       (private.has_permission('orders.create') and private.current_sucursal_id() is not null)
       or private.has_permission('branches.read')
     ) then
    raise exception 'Sin acceso al directorio del mapa' using errcode='42501';
  end if;
  return query
    select s.id, s.nombre, s.direccion, s.latitud::double precision, s.longitud::double precision
    from public.sucursales s
    where s.activo is true
      and s.latitud between -90 and 90
      and s.longitud between -180 and 180
    order by s.nombre, s.id;
end $$;
revoke all on function private.dispatch_map_branches() from public, anon;
grant execute on function private.dispatch_map_branches() to authenticated;

create function public.sucursales_mapa_despachos()
returns table(id uuid, nombre text, direccion text, latitud double precision, longitud double precision)
language sql stable security invoker set search_path = '' as $$
  select * from private.dispatch_map_branches();
$$;
revoke all on function public.sucursales_mapa_despachos() from public, anon;
grant execute on function public.sucursales_mapa_despachos() to authenticated;

