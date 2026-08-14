select jsonb_pretty(jsonb_build_object(
  'server_version', current_setting('server_version'),
  'tables', (
    select jsonb_agg(
      jsonb_build_object(
        'table', c.relname,
        'rls', c.relrowsecurity,
        'force_rls', c.relforcerowsecurity
      ) order by c.relname
    )
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any(array[
        'usuarios', 'sucursales', 'turnos', 'turno_despachadores',
        'pedidos', 'pedido_items'
      ])
  ),
  'policies', (
    select coalesce(
      jsonb_agg(to_jsonb(p) order by p.tablename, p.policyname),
      '[]'::jsonb
    )
    from pg_policies p
    where p.schemaname = 'public'
      and p.tablename = any(array[
        'usuarios', 'sucursales', 'turnos', 'turno_despachadores',
        'pedidos', 'pedido_items'
      ])
  ),
  'triggers', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table', event_object_table,
          'name', trigger_name,
          'timing', action_timing,
          'event', event_manipulation,
          'statement', action_statement
        ) order by event_object_table, trigger_name, event_manipulation
      ),
      '[]'::jsonb
    )
    from information_schema.triggers
    where trigger_schema = 'public'
      and event_object_table = any(array[
        'usuarios', 'sucursales', 'turnos', 'turno_despachadores',
        'pedidos', 'pedido_items'
      ])
  ),
  'grants', (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table', table_name,
          'grantee', grantee,
          'privilege', privilege_type
        ) order by table_name, grantee, privilege_type
      ),
      '[]'::jsonb
    )
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = any(array[
        'usuarios', 'sucursales', 'turnos', 'turno_despachadores',
        'pedidos', 'pedido_items'
      ])
      and grantee = any(array['anon', 'authenticated', 'service_role'])
  )
)) as inventory;
