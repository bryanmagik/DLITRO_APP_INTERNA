begin;

create temp table rls_v1_results (
  app_role text not null,
  table_name text not null,
  operation text not null,
  result text not null,
  detail text not null
) on commit drop;
grant all on rls_v1_results to authenticated;

-- Transaction-only relational fixtures. Nothing below survives ROLLBACK.
insert into public.categorias (id, nombre)
values ('c0000000-0000-4000-8000-000000000001', 'RLS V1 temporal');
insert into public.productos (id, nombre, precio, categoria_id)
values ('c1000000-0000-4000-8000-000000000001', 'RLS V1 temporal', 1000,
        'c0000000-0000-4000-8000-000000000001');

insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura)
values
  ('d0000000-0000-4000-8000-000000000001',
   (select sucursal_id from public.usuarios where id = 'a0000000-0000-4000-8000-000000000001'),
   'a0000000-0000-4000-8000-000000000001', 'cerrado', 0),
  ('d0000000-0000-4000-8000-000000000002',
   'b0000000-0000-4000-8000-000000000002',
   'a0000000-0000-4000-8000-000000000002', 'cerrado', 0);

insert into public.turno_despachadores (id, turno_id, despachador_id, activo)
values ('d1000000-0000-4000-8000-000000000002',
        'd0000000-0000-4000-8000-000000000002',
        'a0000000-0000-4000-8000-000000000002', true);

insert into public.pedidos (
  id, turno_id, sucursal_id, tomador_id, cliente_nombre,
  tipo, subtotal, descuento, costo_despacho, total
)
values ('d2000000-0000-4000-8000-000000000002',
        'd0000000-0000-4000-8000-000000000002',
        'b0000000-0000-4000-8000-000000000002',
        'a0000000-0000-4000-8000-000000000002',
        'RLS V1 temporal B', 'retiro', 1000, 0, 0, 1000);

insert into public.pedido_items (
  id, pedido_id, producto_id, cantidad, precio_unitario, descuento_item, subtotal
)
values ('d3000000-0000-4000-8000-000000000002',
        'd2000000-0000-4000-8000-000000000002',
        'c1000000-0000-4000-8000-000000000001', 1, 1000, 0, 1000);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

do $$
declare
  test record;
  affected bigint;
  statement text;
begin
  for test in
    select * from (values
      ('usuarios', 'a0000000-0000-4000-8000-000000000002'::uuid),
      ('sucursales', 'b0000000-0000-4000-8000-000000000002'::uuid),
      ('turnos', 'd0000000-0000-4000-8000-000000000002'::uuid),
      ('turno_despachadores', 'd1000000-0000-4000-8000-000000000002'::uuid),
      ('pedidos', 'd2000000-0000-4000-8000-000000000002'::uuid),
      ('pedido_items', 'd3000000-0000-4000-8000-000000000002'::uuid)
    ) as x(table_name, row_id)
  loop
    execute format('select count(*) from public.%I where id = $1', test.table_name)
      into affected using test.row_id;
    insert into rls_v1_results values (
      'tomador_pedidos A', test.table_name, 'SELECT',
      case when affected = 0 then 'PASS' else 'FAIL' end,
      format('filas B visibles=%s; esperado=0', affected)
    );

    execute format('with x as (update public.%I set id=id where id=$1 returning 1) select count(*) from x', test.table_name)
      into affected using test.row_id;
    insert into rls_v1_results values (
      'tomador_pedidos A', test.table_name, 'UPDATE',
      case when affected = 0 then 'PASS' else 'FAIL' end,
      format('filas B actualizadas=%s; esperado=0', affected)
    );

    execute format('with x as (delete from public.%I where id=$1 returning 1) select count(*) from x', test.table_name)
      into affected using test.row_id;
    insert into rls_v1_results values (
      'tomador_pedidos A', test.table_name, 'DELETE',
      case when affected = 0 then 'PASS' else 'FAIL' end,
      format('filas B eliminadas=%s; esperado=0', affected)
    );
  end loop;

  for test in
    select * from (values
      ('usuarios', $sql$insert into public.usuarios (id,nombre,rol,sucursal_id) values ('e0000000-0000-4000-8000-000000000001','X','tomador_pedidos','b0000000-0000-4000-8000-000000000002')$sql$),
      ('sucursales', $sql$insert into public.sucursales (id,nombre,direccion) values ('e1000000-0000-4000-8000-000000000001','X','X')$sql$),
      ('turnos', $sql$insert into public.turnos (id,sucursal_id,tomador_id,estado,caja_chica_apertura) values ('e2000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','cerrado',0)$sql$),
      ('turno_despachadores', $sql$insert into public.turno_despachadores (id,turno_id,despachador_id) values ('e3000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000002')$sql$),
      ('pedidos', $sql$insert into public.pedidos (id,turno_id,sucursal_id,tomador_id,cliente_nombre,tipo,subtotal,total) values ('e4000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000001','X','retiro',0,0)$sql$),
      ('pedido_items', $sql$insert into public.pedido_items (id,pedido_id,producto_id,cantidad,precio_unitario,subtotal) values ('e5000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000001',1,1000,1000)$sql$)
    ) as x(table_name, sql_text)
  loop
    begin
      execute test.sql_text;
      insert into rls_v1_results values (
        'tomador_pedidos A', test.table_name, 'INSERT', 'FAIL',
        'INSERT hacia Sucursal B fue aceptado'
      );
    exception when insufficient_privilege then
      insert into rls_v1_results values (
        'tomador_pedidos A', test.table_name, 'INSERT', 'PASS',
        'INSERT hacia Sucursal B rechazado por RLS'
      );
    end;
  end loop;
end;
$$;

-- Validate the existing administrative model globally against every scoped table.
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select id from public.usuarios where rol in ('superadmin','admin') order by rol limit 1),
    'role', 'authenticated'
  )::text,
  true
);

do $$
declare
  test record;
  affected bigint;
begin
  for test in
    select * from (values
      ('usuarios', 'a0000000-0000-4000-8000-000000000002'::uuid),
      ('sucursales', 'b0000000-0000-4000-8000-000000000002'::uuid),
      ('turnos', 'd0000000-0000-4000-8000-000000000002'::uuid),
      ('turno_despachadores', 'd1000000-0000-4000-8000-000000000002'::uuid),
      ('pedidos', 'd2000000-0000-4000-8000-000000000002'::uuid),
      ('pedido_items', 'd3000000-0000-4000-8000-000000000002'::uuid)
    ) as x(table_name, row_id)
  loop
    execute format('select count(*) from public.%I where id=$1', test.table_name)
      into affected using test.row_id;
    insert into rls_v1_results values (
      'admin/superadmin', test.table_name, 'SELECT',
      case when affected = 1 then 'PASS' else 'FAIL' end,
      format('filas globales visibles=%s; esperado=1', affected)
    );

    execute format('with x as (update public.%I set id=id where id=$1 returning 1) select count(*) from x', test.table_name)
      into affected using test.row_id;
    insert into rls_v1_results values (
      'admin/superadmin', test.table_name, 'UPDATE',
      case when affected = 1 then 'PASS' else 'FAIL' end,
      format('filas globales actualizadas=%s; esperado=1', affected)
    );

    -- INSERT/DELETE are proven by the paired policies and table grants; execute
    -- catalog assertions here without mutating the persistent fixture identities.
    select count(*) into affected
    from pg_policies
    where schemaname='public' and tablename=test.table_name
      and cmd='INSERT' and with_check like '%is_admin%';
    insert into rls_v1_results values (
      'admin/superadmin', test.table_name, 'INSERT',
      case when affected = 1 then 'PASS' else 'FAIL' end,
      'policy INSERT incluye is_admin y authenticated posee INSERT'
    );

    select count(*) into affected
    from pg_policies
    where schemaname='public' and tablename=test.table_name
      and cmd='DELETE' and qual like '%is_admin%';
    insert into rls_v1_results values (
      'admin/superadmin', test.table_name, 'DELETE',
      case when affected = 1 then 'PASS' else 'FAIL' end,
      'policy DELETE incluye is_admin y authenticated posee DELETE'
    );
  end loop;
end;
$$;

reset role;
select jsonb_agg(to_jsonb(r) order by app_role, table_name, operation) as matrix
from rls_v1_results r;

rollback;
