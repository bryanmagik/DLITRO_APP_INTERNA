-- El conteo de jarros es un modulo opcional del inventario, no un requisito
-- para abrir el turno. Se mueve al encabezado del inventario parcial, que ya
-- conserva sucursal, turno, usuario y fecha.
alter table public.inventarios_parciales
  add column if not exists jarros_cajas_con_sticker integer,
  add column if not exists jarros_cajas_sin_sticker integer,
  add column if not exists jarros_sueltos integer,
  add column if not exists jarros_rotos integer,
  add column if not exists conteo_jarros_at timestamptz;

alter table public.inventarios_parciales
  drop constraint if exists inventarios_parciales_conteo_jarros_completo_check,
  add constraint inventarios_parciales_conteo_jarros_completo_check check (
    (
      jarros_cajas_con_sticker is null
      and jarros_cajas_sin_sticker is null
      and jarros_sueltos is null
      and jarros_rotos is null
      and conteo_jarros_at is null
    )
    or
    (
      jarros_cajas_con_sticker >= 0
      and jarros_cajas_sin_sticker >= 0
      and jarros_sueltos >= 0
      and jarros_rotos >= 0
      and conteo_jarros_at is not null
    )
  );

comment on column public.inventarios_parciales.jarros_cajas_con_sticker is
  'Cajas de jarros con sticker informadas en el modulo de conteo de jarros.';
comment on column public.inventarios_parciales.jarros_cajas_sin_sticker is
  'Cajas de jarros sin sticker informadas en el modulo de conteo de jarros.';
comment on column public.inventarios_parciales.jarros_sueltos is
  'Jarros sueltos informados en el modulo de conteo de jarros.';
comment on column public.inventarios_parciales.jarros_rotos is
  'Jarros rotos informados; este dato no modifica automaticamente el stock.';
comment on column public.inventarios_parciales.conteo_jarros_at is
  'Momento en que se guardo el modulo de conteo de jarros.';

alter table public.turnos
  drop constraint if exists turnos_conteo_jarros_apertura_completo_check,
  drop column if exists jarros_cajas_con_sticker_apertura,
  drop column if exists jarros_cajas_sin_sticker_apertura,
  drop column if exists jarros_sueltos_apertura,
  drop column if exists jarros_rotos_apertura,
  drop column if exists conteo_jarros_apertura_at;
