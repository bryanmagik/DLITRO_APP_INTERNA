begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select is(
  (select count(*)::integer from public.insumos where activo),
  45,
  'el catalogo activo replica los 45 insumos de produccion'
);

select is(
  (select count(*)::integer from public.insumos where activo and unidades_por_formato > 0),
  25,
  'los 25 insumos configurados en produccion mantienen formato mayor y unidades'
);

select results_eq(
  $$select grupo_inventario from public.insumos where orden_visual = 1 order by orden_presentacion limit 1$$,
  array['Ron'::text],
  'Ron es el primer producto'
);

select results_eq(
  $$select grupo_inventario from public.insumos where orden_visual = 45 order by orden_presentacion limit 1$$,
  array['Confort'::text],
  'Confort es el ultimo producto'
);

select is(
  (select count(distinct grupo_inventario)::integer from public.insumos where seccion_inventario = 'Útiles de aseo'),
  11,
  'utiles de aseo conserva los grupos activos disponibles en produccion'
);

select is(
  (select unidades_por_formato from public.insumos where nombre = 'Ron blanco Mitjans'),
  12,
  'el ron conserva 12 unidades por caja'
);

select is(
  (select ml_por_unidad from public.insumos where nombre = 'Ron de coco'),
  5000::numeric,
  'los insumos sin caja conservan su conversion individual'
);

select throws_ok(
  $$insert into public.insumos (nombre, tipo, tipo_conteo, maximo_conteo) values ('Prueba porcentaje invalido', 'Preparación', 'porcentaje', 101)$$,
  '23514',
  null,
  'la base rechaza una configuracion porcentual distinta de 100'
);

select * from finish();
rollback;
