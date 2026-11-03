-- Names only for accounting: do not broaden usuarios SELECT or management.
create function private.accounting_dispatcher_names(p_turno uuid)
returns table(id uuid, nombre text, apellido text, nombre_completo text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null
     or private.current_app_role() not in ('contador_rrhh','admin','superadmin')
     or private.current_app_role() is null
     or not private.has_permission('cash.read')
     or not private.has_permission('dispatcher_payments.read') then
    raise exception 'No autorizado' using errcode = '42501';
  end if;
  return query
    select u.id,u.nombre,u.apellido,u.nombre_completo
    from public.usuarios u
    where u.id in (
      select p.despachador_id from public.pedidos p where p.turno_id=p_turno
      union
      select d.despachador_id from public.pago_despachadores d where d.turno_id=p_turno
      union
      select td.despachador_id from public.turno_despachadores td where td.turno_id=p_turno
    );
end $$;
revoke all on function private.accounting_dispatcher_names(uuid) from public,anon;
grant execute on function private.accounting_dispatcher_names(uuid) to authenticated;

create function public.nombres_despachadores_contabilidad(p_turno uuid)
returns table(id uuid, nombre text, apellido text, nombre_completo text)
language sql stable security invoker set search_path = '' as $$
  select * from private.accounting_dispatcher_names(p_turno);
$$;
revoke all on function public.nombres_despachadores_contabilidad(uuid) from public,anon;
grant execute on function public.nombres_despachadores_contabilidad(uuid) to authenticated;
