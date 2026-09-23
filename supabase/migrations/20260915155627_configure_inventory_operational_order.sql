-- Configuracion operativa del inventario. Esta migracion completa el catalogo
-- faltante, pero no crea stock por sucursal ni modifica cantidades existentes.

alter table public.insumos
  add column if not exists seccion_inventario text not null default 'Inventario general',
  add column if not exists grupo_inventario text,
  add column if not exists presentacion_inventario text,
  add column if not exists orden_visual integer,
  add column if not exists orden_presentacion integer not null default 1,
  add column if not exists tipo_conteo text not null default 'entero',
  add column if not exists paso_conteo numeric not null default 1,
  add column if not exists maximo_conteo numeric;

alter table public.insumos
  drop constraint if exists insumos_seccion_inventario_check,
  add constraint insumos_seccion_inventario_check
    check (btrim(seccion_inventario) <> ''),
  drop constraint if exists insumos_orden_visual_check,
  add constraint insumos_orden_visual_check
    check (orden_visual is null or orden_visual > 0),
  drop constraint if exists insumos_orden_presentacion_check,
  add constraint insumos_orden_presentacion_check
    check (orden_presentacion > 0),
  drop constraint if exists insumos_tipo_conteo_check,
  add constraint insumos_tipo_conteo_check
    check (tipo_conteo in ('entero', 'decimal', 'porcentaje')),
  drop constraint if exists insumos_paso_conteo_check,
  add constraint insumos_paso_conteo_check
    check (paso_conteo > 0),
  drop constraint if exists insumos_maximo_conteo_check,
  add constraint insumos_maximo_conteo_check
    check (maximo_conteo is null or maximo_conteo >= 0),
  drop constraint if exists insumos_porcentaje_config_check,
  add constraint insumos_porcentaje_config_check
    check (tipo_conteo <> 'porcentaje' or maximo_conteo = 100);

create index if not exists idx_insumos_orden_inventario
  on public.insumos (seccion_inventario, orden_visual, orden_presentacion, nombre)
  where activo is true;

comment on column public.insumos.seccion_inventario is
  'Seccion visual del formulario de inventario; no cambia el tipo logistico.';
comment on column public.insumos.grupo_inventario is
  'Nombre operativo del producto usado para agrupar sus presentaciones.';
comment on column public.insumos.presentacion_inventario is
  'Etiqueta de la presentacion contada por esta fila de stock.';
comment on column public.insumos.orden_visual is
  'Orden operativo del grupo. NULL deja el insumo al final como no configurado.';
comment on column public.insumos.tipo_conteo is
  'Control de captura: entero, decimal o porcentaje.';

-- El catalogo real puede contener nombres compuestos (por ejemplo, "Ron - Cajas").
-- Se elige la coincidencia de prefijo mas larga para que "Ron Coco" no sea
-- clasificado como "Ron". Las filas sin coincidencia permanecen intactas y al final.
with catalogo(grupo, orden, seccion) as (
  values
    ('Ron', 1, 'Inventario general'),
    ('Ron Coco', 2, 'Inventario general'),
    ('Blue', 3, 'Inventario general'),
    ('Black', 4, 'Inventario general'),
    ('Granadina', 5, 'Inventario general'),
    ('Pipeño', 6, 'Inventario general'),
    ('Coronas', 7, 'Inventario general'),
    ('Bebida', 8, 'Inventario general'),
    ('Agua', 9, 'Inventario general'),
    ('Limón', 10, 'Inventario general'),
    ('Azúcar', 11, 'Inventario general'),
    ('Leche', 12, 'Inventario general'),
    ('Gin', 13, 'Inventario general'),
    ('Sprite', 14, 'Inventario general'),
    ('Redbull', 15, 'Inventario general'),
    ('Piña', 16, 'Inventario general'),
    ('Maracuyá', 17, 'Inventario general'),
    ('Mango', 18, 'Inventario general'),
    ('Frutilla', 19, 'Inventario general'),
    ('Chirimoya', 20, 'Inventario general'),
    ('Frambuesa', 21, 'Inventario general'),
    ('Berries', 22, 'Inventario general'),
    ('Coco', 23, 'Inventario general'),
    ('Helado Piña', 24, 'Inventario general'),
    ('Menta', 25, 'Inventario general'),
    ('Hielo', 26, 'Inventario general'),
    ('Bombillas', 27, 'Inventario general'),
    ('Colorantes', 28, 'Inventario general'),
    ('Alusa', 29, 'Inventario general'),
    ('Talonarios', 30, 'Inventario general'),
    ('Uber', 31, 'Inventario general'),
    ('Stickers', 32, 'Inventario general'),
    ('Nova General', 33, 'Útiles de aseo'),
    ('Bolsas de basura', 34, 'Útiles de aseo'),
    ('Esponja', 35, 'Útiles de aseo'),
    ('Paños', 36, 'Útiles de aseo'),
    ('Lavaloza 1L', 37, 'Útiles de aseo'),
    ('CIF', 38, 'Útiles de aseo'),
    ('Traperos', 39, 'Útiles de aseo'),
    ('Jabón', 40, 'Útiles de aseo'),
    ('Desodorante ambiental', 41, 'Útiles de aseo'),
    ('RAID', 42, 'Útiles de aseo'),
    ('Cloro gel', 43, 'Útiles de aseo'),
    ('Poett', 44, 'Útiles de aseo'),
    ('Confort', 45, 'Útiles de aseo')
), candidatos as (
  select distinct on (i.id)
    i.id,
    c.grupo,
    c.orden,
    c.seccion
  from public.insumos i
  join catalogo c
    on translate(lower(btrim(i.nombre)), 'áéíóúñ', 'aeioun') = translate(lower(c.grupo), 'áéíóúñ', 'aeioun')
    or translate(lower(btrim(i.nombre)), 'áéíóúñ', 'aeioun') like translate(lower(c.grupo), 'áéíóúñ', 'aeioun') || ' %'
    or translate(lower(btrim(i.nombre)), 'áéíóúñ', 'aeioun') like translate(lower(c.grupo), 'áéíóúñ', 'aeioun') || ' - %'
    or translate(lower(btrim(i.nombre)), 'áéíóúñ', 'aeioun') like translate(lower(c.grupo), 'áéíóúñ', 'aeioun') || ' · %'
    or translate(lower(btrim(i.nombre)), 'áéíóúñ', 'aeioun') like translate(lower(c.grupo), 'áéíóúñ', 'aeioun') || ': %'
  order by i.id, length(c.grupo) desc
)
update public.insumos i
set grupo_inventario = c.grupo,
    orden_visual = c.orden,
    seccion_inventario = c.seccion
from candidatos c
where i.id = c.id;

-- Orden de presentaciones cuando la presentacion forma parte del nombre actual.
with presentaciones(nombre, orden) as (
  values
    ('cajas', 1), ('cajas totales', 1), ('bidones', 1),
    ('botellas', 1), ('six pack', 1), ('pack', 1),
    ('latas', 1), ('kilos totales', 1), ('máquina chica', 1),
    ('enteros', 1), ('unidades verdes', 1), ('100x120', 1),
    ('paquetes', 1),
    ('sueltas', 2), ('botellas de 1l', 2), ('máquina grande', 2),
    ('unidades', 2), ('cortados', 2), ('sin alcohol', 2),
    ('70x90', 2), ('packs', 2),
    ('bidón 20l', 3), ('sueltas congeladas', 3), ('congeladas', 3),
    ('frappé', 3), ('cumpleaños', 3), ('90x120', 3), ('palillos', 4),
    ('jarro dorado', 4), ('80x110', 4), ('halloween', 5),
    ('navidad', 6), ('18 de septiembre', 7)
), candidatos as (
  select distinct on (i.id)
    i.id,
    p.nombre,
    p.orden
  from public.insumos i
  join presentaciones p
    on lower(i.nombre) like '% ' || lower(p.nombre)
    or lower(i.nombre) like '% - ' || lower(p.nombre)
    or lower(i.nombre) like '% · ' || lower(p.nombre)
  where i.grupo_inventario is not null
  order by i.id, length(p.nombre) desc
)
update public.insumos i
set presentacion_inventario = initcap(c.nombre),
    orden_presentacion = c.orden,
    tipo_conteo = case
      when lower(c.nombre) in ('máquina chica', 'máquina grande', 'frappé') then 'porcentaje'
      when lower(c.nombre) like '%bidón%' then 'decimal'
      else i.tipo_conteo
    end,
    paso_conteo = case when lower(c.nombre) like '%bidón%' then 0.5 else i.paso_conteo end,
    maximo_conteo = case
      when lower(c.nombre) in ('máquina chica', 'máquina grande', 'frappé') then 100
      else i.maximo_conteo
    end
from candidatos c
where i.id = c.id;

-- Completa exclusivamente el catalogo faltante. No se crean filas de stock ni
-- conteos. Una presentacion es un insumo independiente para evitar sumar
-- magnitudes incompatibles (por ejemplo, cajas y palillos de Uber, o tres
-- porcentajes de maquinas de hielo).
with detalle(grupo, orden_grupo, seccion, presentacion, orden_presentacion) as (
  values
    ('Ron', 1, 'Inventario general', 'Cajas', 1),
    ('Ron', 1, 'Inventario general', 'Sueltas', 2),
    ('Ron', 1, 'Inventario general', 'Bidón 20L', 3),
    ('Ron Coco', 2, 'Inventario general', 'Bidones', 1),
    ('Ron Coco', 2, 'Inventario general', 'Botellas de 1L', 2),
    ('Blue', 3, 'Inventario general', 'Cajas', 1),
    ('Blue', 3, 'Inventario general', 'Sueltas', 2),
    ('Black', 4, 'Inventario general', 'Cajas', 1),
    ('Black', 4, 'Inventario general', 'Sueltas', 2),
    ('Granadina', 5, 'Inventario general', 'Botellas', 1),
    ('Pipeño', 6, 'Inventario general', 'Bidones', 1),
    ('Coronas', 7, 'Inventario general', 'Six pack', 1),
    ('Coronas', 7, 'Inventario general', 'Sueltas', 2),
    ('Bebida', 8, 'Inventario general', 'Six pack', 1),
    ('Bebida', 8, 'Inventario general', 'Sueltas', 2),
    ('Agua', 9, 'Inventario general', 'Six pack', 1),
    ('Agua', 9, 'Inventario general', 'Sueltas', 2),
    ('Limón', 10, 'Inventario general', 'Pack', 1),
    ('Limón', 10, 'Inventario general', 'Sueltos', 2),
    ('Limón', 10, 'Inventario general', 'Bidón 20L', 3),
    ('Azúcar', 11, 'Inventario general', 'Cajas', 1),
    ('Azúcar', 11, 'Inventario general', 'Sueltas', 2),
    ('Leche', 12, 'Inventario general', 'Cajas', 1),
    ('Leche', 12, 'Inventario general', 'Sueltas', 2),
    ('Gin', 13, 'Inventario general', 'Cajas', 1),
    ('Gin', 13, 'Inventario general', 'Sueltas', 2),
    ('Sprite', 14, 'Inventario general', 'Pack', 1),
    ('Sprite', 14, 'Inventario general', 'Sueltos', 2),
    ('Redbull', 15, 'Inventario general', 'Unidades', 1),
    ('Piña', 16, 'Inventario general', 'Cajas', 1),
    ('Piña', 16, 'Inventario general', 'Sueltas', 2),
    ('Piña', 16, 'Inventario general', 'Sueltas congeladas', 3),
    ('Maracuyá', 17, 'Inventario general', 'Cajas', 1),
    ('Maracuyá', 17, 'Inventario general', 'Sueltas', 2),
    ('Maracuyá', 17, 'Inventario general', 'Congeladas', 3),
    ('Mango', 18, 'Inventario general', 'Cajas', 1),
    ('Mango', 18, 'Inventario general', 'Sueltas', 2),
    ('Mango', 18, 'Inventario general', 'Congeladas', 3),
    ('Frutilla', 19, 'Inventario general', 'Cajas', 1),
    ('Frutilla', 19, 'Inventario general', 'Sueltas', 2),
    ('Frutilla', 19, 'Inventario general', 'Congeladas', 3),
    ('Chirimoya', 20, 'Inventario general', 'Cajas', 1),
    ('Chirimoya', 20, 'Inventario general', 'Sueltas', 2),
    ('Chirimoya', 20, 'Inventario general', 'Congeladas', 3),
    ('Frambuesa', 21, 'Inventario general', 'Cajas', 1),
    ('Frambuesa', 21, 'Inventario general', 'Sueltas', 2),
    ('Frambuesa', 21, 'Inventario general', 'Congeladas', 3),
    ('Berries', 22, 'Inventario general', 'Cajas', 1),
    ('Berries', 22, 'Inventario general', 'Sueltas', 2),
    ('Berries', 22, 'Inventario general', 'Congeladas', 3),
    ('Coco', 23, 'Inventario general', 'Latas', 1),
    ('Coco', 23, 'Inventario general', 'Cajas', 2),
    ('Helado Piña', 24, 'Inventario general', 'Cajas', 1),
    ('Menta', 25, 'Inventario general', 'Kilos totales', 1),
    ('Hielo', 26, 'Inventario general', 'Máquina chica', 1),
    ('Hielo', 26, 'Inventario general', 'Máquina grande', 2),
    ('Hielo', 26, 'Inventario general', 'Frappé', 3),
    ('Bombillas', 27, 'Inventario general', 'Cajas', 1),
    ('Bombillas', 27, 'Inventario general', 'Unidades', 2),
    ('Colorantes', 28, 'Inventario general', 'Unidades', 1),
    ('Alusa', 29, 'Inventario general', 'Enteros', 1),
    ('Alusa', 29, 'Inventario general', 'Cortados', 2),
    ('Talonarios', 30, 'Inventario general', 'Unidades', 1),
    ('Uber', 31, 'Inventario general', 'Cajas totales', 1),
    ('Uber', 31, 'Inventario general', 'Packs', 2),
    ('Uber', 31, 'Inventario general', 'Sueltas', 3),
    ('Uber', 31, 'Inventario general', 'Palillos', 4),
    ('Stickers', 32, 'Inventario general', 'Unidades verdes', 1),
    ('Stickers', 32, 'Inventario general', 'Sin alcohol', 2),
    ('Stickers', 32, 'Inventario general', 'Cumpleaños', 3),
    ('Stickers', 32, 'Inventario general', 'Jarro dorado', 4),
    ('Stickers', 32, 'Inventario general', 'Halloween', 5),
    ('Stickers', 32, 'Inventario general', 'Navidad', 6),
    ('Stickers', 32, 'Inventario general', '18 de septiembre', 7),
    ('Nova General', 33, 'Útiles de aseo', 'Sueltas', 1),
    ('Bolsas de basura', 34, 'Útiles de aseo', '100x120', 1),
    ('Bolsas de basura', 34, 'Útiles de aseo', '70x90', 2),
    ('Bolsas de basura', 34, 'Útiles de aseo', '90x120', 3),
    ('Bolsas de basura', 34, 'Útiles de aseo', '80x110', 4),
    ('Esponja', 35, 'Útiles de aseo', 'Unidades', 1),
    ('Paños', 36, 'Útiles de aseo', 'Unidades', 1),
    ('Lavaloza 1L', 37, 'Útiles de aseo', 'Unidades', 1),
    ('CIF', 38, 'Útiles de aseo', 'Unidades', 1),
    ('Traperos', 39, 'Útiles de aseo', 'Unidades', 1),
    ('Jabón', 40, 'Útiles de aseo', 'Unidades', 1),
    ('Desodorante ambiental', 41, 'Útiles de aseo', 'Unidades', 1),
    ('RAID', 42, 'Útiles de aseo', 'Unidades', 1),
    ('Cloro gel', 43, 'Útiles de aseo', 'Unidades', 1),
    ('Poett', 44, 'Útiles de aseo', 'Unidades', 1),
    ('Confort', 45, 'Útiles de aseo', 'Paquetes', 1),
    ('Confort', 45, 'Útiles de aseo', 'Sueltos', 2)
)
insert into public.insumos (
  nombre, tipo, unidad, activo, costo_unitario,
  seccion_inventario, grupo_inventario, presentacion_inventario,
  orden_visual, orden_presentacion, tipo_conteo, paso_conteo, maximo_conteo
)
select
  d.grupo || ' · ' || d.presentacion,
  case when d.seccion = 'Útiles de aseo' then 'Aseo' else 'Preparación' end,
  case when d.presentacion in ('Máquina chica', 'Máquina grande', 'Frappé') then '%' else lower(d.presentacion) end,
  true,
  0,
  d.seccion,
  d.grupo,
  d.presentacion,
  d.orden_grupo,
  d.orden_presentacion,
  case
    when d.presentacion in ('Máquina chica', 'Máquina grande', 'Frappé') then 'porcentaje'
    when lower(d.presentacion) like '%bidón%' or d.presentacion = 'Kilos totales' then 'decimal'
    else 'entero'
  end,
  case when lower(d.presentacion) like '%bidón%' or d.presentacion = 'Kilos totales' then 0.5 else 1 end,
  case when d.presentacion in ('Máquina chica', 'Máquina grande', 'Frappé') then 100 else null end
from detalle d
where not exists (
  select 1
  from public.insumos i
  where translate(lower(coalesce(i.grupo_inventario, i.nombre)), 'áéíóúñ', 'aeioun') = translate(lower(d.grupo), 'áéíóúñ', 'aeioun')
    and translate(lower(coalesce(i.presentacion_inventario, '')), 'áéíóúñ', 'aeioun') = translate(lower(d.presentacion), 'áéíóúñ', 'aeioun')
);

alter table public.inventario_cierre
  drop constraint if exists inventario_cierre_cantidad_real_no_negativa,
  add constraint inventario_cierre_cantidad_real_no_negativa
    check (cantidad_real is null or cantidad_real >= 0);

alter table public.inventarios_parciales_items
  drop constraint if exists inventarios_parciales_items_cantidad_no_negativa,
  add constraint inventarios_parciales_items_cantidad_no_negativa
    check (cantidad_real >= 0);

create or replace function private.validar_limite_conteo_inventario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo text;
  v_maximo numeric;
begin
  select i.tipo_conteo, i.maximo_conteo
    into v_tipo, v_maximo
  from public.insumos i
  where i.id = new.insumo_id;

  if new.cantidad_real < 0 then
    raise exception using errcode = '23514', message = 'La cantidad de inventario no puede ser negativa';
  end if;

  if v_tipo = 'porcentaje' and new.cantidad_real > coalesce(v_maximo, 100) then
    raise exception using errcode = '23514', message = 'El porcentaje de inventario debe estar entre 0 y 100';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_limite_inventario_cierre on public.inventario_cierre;
create trigger trg_validar_limite_inventario_cierre
before insert or update of cantidad_real, insumo_id on public.inventario_cierre
for each row when (new.cantidad_real is not null)
execute function private.validar_limite_conteo_inventario();

drop trigger if exists trg_validar_limite_inventario_parcial on public.inventarios_parciales_items;
create trigger trg_validar_limite_inventario_parcial
before insert or update of cantidad_real, insumo_id on public.inventarios_parciales_items
for each row
execute function private.validar_limite_conteo_inventario();

-- El trigger anterior registraba nuevamente la diferencia contra el stock
-- inicial en cada guardado de progreso. Se calcula el delta contra el stock
-- vigente, evitando movimientos duplicados y preservando una auditoria exacta.
create or replace function public.actualizar_stock_desde_cierre()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_sucursal_id uuid;
  v_cantidad_anterior numeric;
  v_delta numeric;
begin
  if new.cantidad_real is null then
    return new;
  end if;

  select t.sucursal_id into v_sucursal_id
  from public.turnos t
  where t.id = new.turno_id;

  if v_sucursal_id is null then
    raise exception using errcode = '23503', message = 'El turno no tiene una sucursal válida';
  end if;

  select ss.cantidad into v_cantidad_anterior
  from public.stock_sucursal ss
  where ss.sucursal_id = v_sucursal_id and ss.insumo_id = new.insumo_id
  for update;

  v_delta := new.cantidad_real - coalesce(v_cantidad_anterior, new.cantidad_ideal);

  insert into public.stock_sucursal (insumo_id, sucursal_id, cantidad)
  values (new.insumo_id, v_sucursal_id, new.cantidad_real)
  on conflict (sucursal_id, insumo_id)
  do update set cantidad = excluded.cantidad, updated_at = now();

  if v_delta <> 0 then
    insert into public.stock_movimientos (
      insumo_id, sucursal_id, tipo, cantidad, es_bodega,
      referencia_tipo, referencia_id, usuario_id, notas
    ) values (
      new.insumo_id, v_sucursal_id, 'inventario_cierre', v_delta, false,
      'inventario_cierre', new.id, (select auth.uid()),
      'Ajuste por inventario de cierre de turno'
    );
  end if;
  return new;
end;
$$;

revoke execute on function private.validar_limite_conteo_inventario() from public;
grant execute on function private.validar_limite_conteo_inventario() to authenticated, service_role;

-- Reversion estructural (ejecutar manualmente solo si la aplicacion ya no usa
-- estos campos): DROP INDEX idx_insumos_orden_inventario; ALTER TABLE
-- public.insumos DROP COLUMN ...; no requiere restaurar datos de stock.
