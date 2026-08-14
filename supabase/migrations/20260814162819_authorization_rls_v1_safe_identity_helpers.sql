create or replace function public.get_user_rol(_user_id uuid)
returns text
language sql
stable
security definer
set search_path to ''
as $$
  select u.rol::text
  from public.usuarios u
  where _user_id = (select auth.uid())
    and u.id = (select auth.uid())
  limit 1;
$$;

create or replace function public.get_user_sucursal(_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path to ''
as $$
  select u.sucursal_id
  from public.usuarios u
  where _user_id = (select auth.uid())
    and u.id = (select auth.uid())
  limit 1;
$$;

revoke all on function public.get_user_rol(uuid) from public, anon, authenticated;
revoke all on function public.get_user_sucursal(uuid) from public, anon, authenticated;
grant execute on function public.get_user_rol(uuid) to authenticated;
grant execute on function public.get_user_sucursal(uuid) to authenticated;
