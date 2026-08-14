do $$
declare
  branch_a uuid;
  user_a uuid;
  user_b uuid;
begin
  insert into public.sucursales (id, nombre, direccion, activo)
  values (
    'b0000000-0000-4000-8000-000000000002',
    'RLS V1 Sucursal B',
    'Dirección sintética de pruebas',
    true
  )
  on conflict (id) do update
  set nombre = excluded.nombre,
      direccion = excluded.direccion,
      activo = excluded.activo;

  select id into branch_a
  from public.sucursales
  where id <> 'b0000000-0000-4000-8000-000000000002'
  order by created_at, id
  limit 1;

  if branch_a is null then
    raise exception 'RLS v1 setup requires the existing Sucursal A';
  end if;

  user_a := 'a0000000-0000-4000-8000-000000000001';
  user_b := 'a0000000-0000-4000-8000-000000000002';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change,
    email_change_token_new, recovery_token
  )
  values
    (
      '00000000-0000-0000-0000-000000000000', user_a,
      'authenticated', 'authenticated',
      'rls-v1-a@suscxwjloggmbsqdlgpj.test', crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    ),
    (
      '00000000-0000-0000-0000-000000000000', user_b,
      'authenticated', 'authenticated',
      'rls-v1-b@suscxwjloggmbsqdlgpj.test', crypt(gen_random_uuid()::text, gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    )
  on conflict (id) do update
  set email = excluded.email,
      email_confirmed_at = excluded.email_confirmed_at,
      raw_app_meta_data = excluded.raw_app_meta_data,
      raw_user_meta_data = excluded.raw_user_meta_data,
      updated_at = now();

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider, created_at, updated_at
  )
  values
    (
      'a1000000-0000-4000-8000-000000000001', user_a,
      'rls-v1-a@suscxwjloggmbsqdlgpj.test',
      jsonb_build_object('sub', user_a::text, 'email', 'rls-v1-a@suscxwjloggmbsqdlgpj.test'),
      'email', now(), now()
    ),
    (
      'a1000000-0000-4000-8000-000000000002', user_b,
      'rls-v1-b@suscxwjloggmbsqdlgpj.test',
      jsonb_build_object('sub', user_b::text, 'email', 'rls-v1-b@suscxwjloggmbsqdlgpj.test'),
      'email', now(), now()
    )
  on conflict (provider_id, provider) do update
  set user_id = excluded.user_id,
      identity_data = excluded.identity_data,
      updated_at = now();

  insert into public.usuarios (id, nombre, apellido, rol, sucursal_id, activo)
  values
    (user_a, 'Prueba RLS', 'A', 'tomador_pedidos', branch_a, true),
    (user_b, 'Prueba RLS', 'B', 'tomador_pedidos',
      'b0000000-0000-4000-8000-000000000002', true)
  on conflict (id) do update
  set nombre = excluded.nombre,
      apellido = excluded.apellido,
      rol = excluded.rol,
      sucursal_id = excluded.sucursal_id,
      activo = excluded.activo;
end;
$$;
