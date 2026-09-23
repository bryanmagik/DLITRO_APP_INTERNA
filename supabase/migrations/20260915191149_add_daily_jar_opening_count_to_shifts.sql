-- El conteo diario de jarros pertenece a la apertura del turno. Se guarda en
-- el mismo registro para heredar fecha operativa, sucursal, autor y RLS.
alter table public.turnos
  add column if not exists jarros_cajas_con_sticker_apertura integer,
  add column if not exists jarros_cajas_sin_sticker_apertura integer,
  add column if not exists jarros_sueltos_apertura integer,
  add column if not exists jarros_rotos_apertura integer,
  add column if not exists conteo_jarros_apertura_at timestamptz;

alter table public.turnos
  drop constraint if exists turnos_conteo_jarros_apertura_completo_check,
  add constraint turnos_conteo_jarros_apertura_completo_check check (
    (
      jarros_cajas_con_sticker_apertura is null
      and jarros_cajas_sin_sticker_apertura is null
      and jarros_sueltos_apertura is null
      and jarros_rotos_apertura is null
      and conteo_jarros_apertura_at is null
    )
    or
    (
      jarros_cajas_con_sticker_apertura >= 0
      and jarros_cajas_sin_sticker_apertura >= 0
      and jarros_sueltos_apertura >= 0
      and jarros_rotos_apertura >= 0
      and conteo_jarros_apertura_at is not null
    )
  );

comment on column public.turnos.jarros_cajas_con_sticker_apertura is
  'Cajas de jarros con sticker contadas al abrir el turno.';
comment on column public.turnos.jarros_cajas_sin_sticker_apertura is
  'Cajas de jarros sin sticker contadas al abrir el turno.';
comment on column public.turnos.jarros_sueltos_apertura is
  'Jarros sueltos contados al abrir el turno.';
comment on column public.turnos.jarros_rotos_apertura is
  'Jarros rotos informados al abrir el turno; no se suman automaticamente al stock.';
comment on column public.turnos.conteo_jarros_apertura_at is
  'Momento en que se registro el conteo diario de jarros de apertura.';
