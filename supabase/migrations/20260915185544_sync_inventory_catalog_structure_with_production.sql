-- Corrige el catalogo artificial de 91 presentaciones creado para STAGING.
-- La fuente de verdad es la estructura activa de public.insumos en produccion:
-- una fila por insumo y, cuando corresponde, formato mayor + unidades sueltas.
-- No copia costos, stock, conteos, movimientos ni identificadores de produccion.

create temporary table inventory_catalog_sync (
  nombre text primary key,
  tipo text not null,
  unidad text,
  unidad_logistica text,
  formato_mayor text,
  unidades_por_formato integer,
  ml_por_unidad numeric,
  seccion_inventario text not null,
  grupo_inventario text not null,
  presentacion_inventario text not null,
  orden_visual integer not null,
  orden_presentacion integer not null
) on commit drop;

insert into inventory_catalog_sync values
  ('Agua mineral', 'Preparación', 'ml', '6 unid/caja · 2L/unid', 'Pack', 6, 1000, 'Inventario general', 'Agua', 'Agua mineral', 9, 1),
  ('Alusa', 'Toma de pedidos', 'unidad', 'Unidad', null, null, null, 'Inventario general', 'Alusa', 'Alusa', 29, 1),
  ('Azúcar', 'Preparación', 'gr', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Azúcar', 'Azúcar', 11, 1),
  ('Bolsa basura 50x70', 'Aseo', 'unidad', 'Unidad', null, null, null, 'Útiles de aseo', 'Bolsas de basura', '50x70', 34, 1),
  ('Bolsa basura 70x90', 'Aseo', 'unidad', 'Pack 10 unid', 'Pack', 10, null, 'Útiles de aseo', 'Bolsas de basura', '70x90', 34, 2),
  ('Bolsa basura 80x110', 'Aseo', 'unidad', 'Pack 10 unid', 'Pack', 10, null, 'Útiles de aseo', 'Bolsas de basura', '80x110', 34, 3),
  ('Bombillas', 'Preparación', 'unidad', 'Unidad', 'Caja', 100, null, 'Inventario general', 'Bombillas', 'Bombillas', 27, 1),
  ('Cajas de uber', 'Toma de pedidos', 'unidad', 'Pack 25 unid', 'Pack', 25, null, 'Inventario general', 'Uber', 'Cajas de Uber', 31, 1),
  ('Cerveza corona', 'Preparación', 'unidad', 'Unidad', 'Caja', 24, 750, 'Inventario general', 'Coronas', 'Cerveza corona', 7, 1),
  ('Cloro gel', 'Aseo', 'ml', '900ml/unid', null, null, null, 'Útiles de aseo', 'Cloro gel', 'Cloro gel', 43, 1),
  ('Colorantes', 'Preparación', 'unidad', 'Unidad', null, null, null, 'Inventario general', 'Colorantes', 'Colorantes', 28, 1),
  ('Confort', 'Aseo', 'unidad', 'Pack 6 unid', 'Pack', 4, null, 'Útiles de aseo', 'Confort', 'Confort', 45, 1),
  ('Desodorante ambiental', 'Aseo', 'ml', '350ml/unid', null, null, null, 'Útiles de aseo', 'Desodorante ambiental', 'Desodorante ambiental', 41, 1),
  ('Esponjas', 'Aseo', 'unidad', 'Unidad', null, null, null, 'Útiles de aseo', 'Esponja', 'Esponjas', 35, 1),
  ('Gaseosa ginger ale', 'Preparación', 'ml', '6 unid/caja · 2L/unid', 'Pack', 6, 1000, 'Inventario general', 'Bebida', 'Gaseosa ginger ale', 8, 1),
  ('Hielo cubo', 'Preparación', 'cubo', 'Bolsa', null, null, null, 'Inventario general', 'Hielo', 'Hielo cubo', 26, 1),
  ('Hielo frappe', 'Preparación', 'gr', 'Bolsa', null, null, null, 'Inventario general', 'Hielo', 'Hielo frappé', 26, 2),
  ('Jabón líquido', 'Aseo', 'ml', '750ml/unid', null, null, null, 'Útiles de aseo', 'Jabón', 'Jabón líquido', 40, 1),
  ('Jarro de vidrio', 'Preparación', 'unidad', 'Unidad', 'Caja', 12, null, 'Inventario general', 'Jarro de vidrio', 'Jarro de vidrio', 33, 1),
  ('Lavaloza / Quix', 'Aseo', 'ml', '1L/unid', null, null, null, 'Útiles de aseo', 'Lavaloza 1L', 'Lavaloza / Quix', 37, 1),
  ('Leche', 'Preparación', 'ml', 'Unidad', 'Caja', 12, 1000, 'Inventario general', 'Leche', 'Leche', 12, 1),
  ('Limón (jugo)', 'Preparación', 'ml', '4 unid/caja · 5L/unid', 'Caja', 4, 20000, 'Inventario general', 'Limón', 'Limón (jugo)', 10, 1),
  ('Menta', 'Preparación', 'gr', 'Unidad', null, null, null, 'Inventario general', 'Menta', 'Menta', 25, 1),
  ('Nova', 'Aseo', 'unidad', 'Unidad', 'Pack', 2, null, 'Útiles de aseo', 'Nova General', 'Nova', 33, 1),
  ('Palillos revolvedores', 'Toma de pedidos', 'unidad', 'Unidad', 'Pack', 100, null, 'Inventario general', 'Uber', 'Palillos', 31, 2),
  ('Paños', 'Aseo', 'unidad', 'Unidad', null, null, null, 'Útiles de aseo', 'Paños', 'Paños', 36, 1),
  ('Poett', 'Aseo', 'ml', '900ml/unid', null, null, null, 'Útiles de aseo', 'Poett', 'Poett', 44, 1),
  ('Pulpa de berries', 'Preparación', 'ml', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Berries', 'Pulpa de berries', 22, 1),
  ('Pulpa de chirimoya', 'Preparación', 'ml', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Chirimoya', 'Pulpa de chirimoya', 20, 1),
  ('Pulpa de coco', 'Preparación', 'ml', '425g/unid', 'Caja', 24, 425, 'Inventario general', 'Coco', 'Pulpa de coco', 23, 1),
  ('Pulpa de frambuesa', 'Preparación', 'ml', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Frambuesa', 'Pulpa de frambuesa', 21, 1),
  ('Pulpa de frutilla', 'Preparación', 'ml', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Frutilla', 'Pulpa de frutilla', 19, 1),
  ('Pulpa de mango', 'Preparación', 'ml', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Mango', 'Pulpa de mango', 18, 1),
  ('Pulpa de maracuya', 'Preparación', 'ml', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Maracuyá', 'Pulpa de maracuyá', 17, 1),
  ('Pulpa de piña', 'Preparación', 'ml', '10 unid/caja · 1kg/unid', 'Caja', 10, 1000, 'Inventario general', 'Piña', 'Pulpa de piña', 16, 1),
  ('Ron blanco Mitjans', 'Preparación', 'ml', '12 unid/caja · 750ml/unid', 'Caja', 12, 750, 'Inventario general', 'Ron', 'Ron blanco Mitjans', 1, 1),
  ('Ron de coco', 'Preparación', 'ml', '5L/unid', null, null, 5000, 'Inventario general', 'Ron Coco', 'Ron de coco', 2, 1),
  ('Ron de curacao Mitjans', 'Preparación', 'ml', '6 unid/caja · 750ml/unid', 'Caja', 6, 750, 'Inventario general', 'Blue', 'Ron de curacao Mitjans', 3, 1),
  ('Sticker jarra dorada', 'Preparación', 'unidad', 'Unidad', null, null, null, 'Inventario general', 'Stickers', 'Jarro dorado', 32, 4),
  ('Stickers c/alcohol', 'Preparación', 'unidad', 'Pack 25 unid', null, null, null, 'Inventario general', 'Stickers', 'Con alcohol', 32, 1),
  ('Stickers cumpleaños', 'Preparación', 'unidad', 'Unidad', null, null, null, 'Inventario general', 'Stickers', 'Cumpleaños', 32, 3),
  ('Stickers s/alcohol', 'Preparación', 'unidad', 'Pack 25 unid', null, null, null, 'Inventario general', 'Stickers', 'Sin alcohol', 32, 2),
  ('Talonarios / Comandas', 'Toma de pedidos', 'unidad', '100 hojas/unid', null, null, null, 'Inventario general', 'Talonarios', 'Talonarios / Comandas', 30, 1),
  ('Traperos', 'Aseo', 'unidad', 'Unidad', null, null, null, 'Útiles de aseo', 'Traperos', 'Traperos', 39, 1),
  ('Vodka black Eristoff', 'Preparación', 'ml', '6 unid/caja · 1L/unid', 'Caja', 6, 1000, 'Inventario general', 'Black', 'Vodka black Eristoff', 4, 1);

-- Elimina solo las filas sinteticas generadas por la migracion anterior y solo
-- cuando no tienen ninguna referencia operativa. En produccion se conservan las
-- filas reales, sus UUID, costos y relaciones.
delete from public.insumos i
where i.nombre = concat(i.grupo_inventario, ' · ', i.presentacion_inventario)
  and not exists (select 1 from public.inventario_cierre x where x.insumo_id = i.id)
  and not exists (select 1 from public.pedidos_logistica_items x where x.insumo_id = i.id)
  and not exists (select 1 from public.recetas x where x.insumo_id = i.id)
  and not exists (select 1 from public.stock_bodega_central x where x.insumo_id = i.id)
  and not exists (select 1 from public.stock_movimientos x where x.insumo_id = i.id)
  and not exists (select 1 from public.stock_sucursal x where x.insumo_id = i.id)
  and not exists (select 1 from public.transferencia_items x where x.insumo_id = i.id)
  and not exists (select 1 from public.inventarios_parciales_items x where x.insumo_id = i.id);

update public.insumos i
set tipo = c.tipo,
    unidad = c.unidad,
    unidad_logistica = c.unidad_logistica,
    activo = true,
    formato_mayor = c.formato_mayor,
    unidades_por_formato = c.unidades_por_formato,
    ml_por_unidad = c.ml_por_unidad,
    seccion_inventario = c.seccion_inventario,
    grupo_inventario = c.grupo_inventario,
    presentacion_inventario = c.presentacion_inventario,
    orden_visual = c.orden_visual,
    orden_presentacion = c.orden_presentacion,
    tipo_conteo = 'entero',
    paso_conteo = 1,
    maximo_conteo = null
from inventory_catalog_sync c
where lower(btrim(i.nombre)) = lower(btrim(c.nombre));

insert into public.insumos (
  nombre, tipo, unidad, unidad_logistica, activo,
  formato_mayor, unidades_por_formato, ml_por_unidad,
  seccion_inventario, grupo_inventario, presentacion_inventario,
  orden_visual, orden_presentacion, tipo_conteo, paso_conteo, maximo_conteo
)
select
  c.nombre, c.tipo, c.unidad, c.unidad_logistica, true,
  c.formato_mayor, c.unidades_por_formato, c.ml_por_unidad,
  c.seccion_inventario, c.grupo_inventario, c.presentacion_inventario,
  c.orden_visual, c.orden_presentacion, 'entero', 1, null
from inventory_catalog_sync c
where not exists (
  select 1 from public.insumos i
  where lower(btrim(i.nombre)) = lower(btrim(c.nombre))
);

comment on table public.insumos is
  'Catalogo de insumos. Formatos y conversiones funcionales alineados con produccion; costos y stock permanecen propios de cada ambiente.';
