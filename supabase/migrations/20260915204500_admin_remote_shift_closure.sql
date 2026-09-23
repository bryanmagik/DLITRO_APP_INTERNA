-- Administrative emergency closure for forgotten shifts.
-- Remote closures are explicitly marked and their declared cash can only be
-- corrected later by the same administrator through the audited RPC.

alter table public.turnos
  add column if not exists cierre_remoto boolean not null default false,
  add column if not exists cerrado_remotamente_por uuid references public.usuarios(id),
  add column if not exists cierre_remoto_motivo text,
  add column if not exists cierre_remoto_actualizado_at timestamptz;

alter table public.turnos
  drop constraint if exists turnos_cierre_remoto_consistente;

alter table public.turnos
  add constraint turnos_cierre_remoto_consistente check (
    not cierre_remoto
    or (
      estado = 'cerrado'
      and cerrado_remotamente_por is not null
      and nullif(btrim(cierre_remoto_motivo), '') is not null
      and cierre_remoto_actualizado_at is not null
    )
  );

create index if not exists idx_turnos_cierre_remoto_admin
  on public.turnos (cerrado_remotamente_por, cierre_remoto_actualizado_at desc)
  where cierre_remoto is true;

create table if not exists public.turnos_cierres_admin_auditoria (
  id uuid primary key default gen_random_uuid(),
  turno_id uuid not null references public.turnos(id),
  sucursal_id uuid not null references public.sucursales(id),
  usuario_id uuid not null references public.usuarios(id),
  accion text not null check (accion in ('cierre_remoto', 'correccion_efectivo')),
  efectivo_anterior integer,
  efectivo_nuevo integer not null check (efectivo_nuevo >= 0),
  efectivo_sistema integer not null,
  motivo text not null check (nullif(btrim(motivo), '') is not null),
  created_at timestamptz not null default now()
);

create index if not exists idx_turnos_cierres_admin_auditoria_turno
  on public.turnos_cierres_admin_auditoria (turno_id, created_at desc);

alter table public.turnos_cierres_admin_auditoria enable row level security;

drop policy if exists turnos_cierres_admin_auditoria_read on public.turnos_cierres_admin_auditoria;
create policy turnos_cierres_admin_auditoria_read
on public.turnos_cierres_admin_auditoria
for select to authenticated
using (
  private.has_permission('closures.read')
  and private.can_access_sucursal(sucursal_id)
);

revoke all on table public.turnos_cierres_admin_auditoria from public, anon, authenticated;
grant select on table public.turnos_cierres_admin_auditoria to authenticated;

create or replace function private.guard_turno_update_v2()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text := private.current_app_role();
  remote_close_enabled boolean :=
    coalesce(current_setting('app.admin_remote_shift_close', true), '') = 'on';
  remote_correction_enabled boolean :=
    coalesce(current_setting('app.admin_remote_shift_correction', true), '') = 'on';
begin
  if caller_role = 'encargado' and old.estado = 'cerrado' then
    if (to_jsonb(new) - array['observacion_descuadre'])
       is distinct from (to_jsonb(old) - array['observacion_descuadre']) then
      raise exception 'El encargado puede anotar un cierre, pero no corregirlo ni reabrirlo'
        using errcode = '42501';
    end if;
  end if;

  if (
    new.cierre_remoto is distinct from old.cierre_remoto
    or new.cerrado_remotamente_por is distinct from old.cerrado_remotamente_por
    or new.cierre_remoto_motivo is distinct from old.cierre_remoto_motivo
    or new.cierre_remoto_actualizado_at is distinct from old.cierre_remoto_actualizado_at
  ) and not (remote_close_enabled or remote_correction_enabled) then
    raise exception 'Use el cierre administrativo para modificar un cierre remoto'
      using errcode = '42501';
  end if;

  if old.cierre_remoto is true and (
    new.efectivo_declarado is distinct from old.efectivo_declarado
    or new.efectivo_declarado_caja_chica is distinct from old.efectivo_declarado_caja_chica
    or new.efectivo_declarado_sobre is distinct from old.efectivo_declarado_sobre
    or new.efectivo_sistema is distinct from old.efectivo_sistema
    or new.observacion_descuadre is distinct from old.observacion_descuadre
  ) and not remote_correction_enabled then
    raise exception 'Use la correccion auditada para modificar el efectivo del cierre remoto'
      using errcode = '42501';
  end if;

  return new;
end
$$;

revoke all on function private.guard_turno_update_v2() from public, anon, authenticated;

create or replace function public.cerrar_turno_remotamente_admin(
  p_turno_id uuid,
  p_efectivo_declarado integer,
  p_motivo text
)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text := private.current_app_role();
  target public.turnos;
  result public.turnos;
  efectivo_ventas bigint;
  gastos_efectivo bigint;
  pagos_despachadores bigint;
  efectivo_esperado bigint;
  motivo_normalizado text := nullif(btrim(p_motivo), '');
begin
  if actor_id is null then
    raise exception 'Autenticacion requerida' using errcode = '28000';
  end if;
  if actor_role not in ('admin', 'superadmin') then
    raise exception 'Solo un administrador puede cerrar turnos remotamente'
      using errcode = '42501';
  end if;
  if p_efectivo_declarado is null or p_efectivo_declarado < 0 then
    raise exception 'El efectivo real debe ser cero o un monto mayor'
      using errcode = '22023';
  end if;
  if motivo_normalizado is null then
    raise exception 'El motivo del cierre administrativo es obligatorio'
      using errcode = '22023';
  end if;

  select t.* into target
  from public.turnos t
  where t.id = p_turno_id
  for update;

  if not found then
    raise exception 'Turno no encontrado' using errcode = 'P0002';
  end if;
  if target.estado <> 'abierto' then
    raise exception 'El turno ya se encuentra cerrado' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.pedidos p
    where p.turno_id = target.id
      and p.estado in ('en_preparacion', 'listo', 'en_despacho')
  ) then
    raise exception 'No se puede cerrar: el turno tiene pedidos sin completar'
      using errcode = '22023';
  end if;

  select coalesce(sum(pt.monto), 0) into efectivo_ventas
  from public.pagos_turno pt
  where pt.turno_id = target.id and pt.metodo = 'efectivo';

  select coalesce(sum(gt.monto), 0) into gastos_efectivo
  from public.gastos_turno gt
  where gt.turno_id = target.id
    and gt.metodo = 'efectivo'
    and gt.concepto <> 'Ingreso caja chica';

  select coalesce(sum(pd.total_a_pagar), 0) into pagos_despachadores
  from public.pago_despachadores pd
  where pd.turno_id = target.id
    and pd.pagado is true
    and pd.total_a_pagar > 0;

  efectivo_esperado := target.caja_chica_apertura::bigint
    + efectivo_ventas - gastos_efectivo - pagos_despachadores;

  if efectivo_esperado < -2147483648 or efectivo_esperado > 2147483647 then
    raise exception 'El efectivo calculado excede el rango permitido'
      using errcode = '22003';
  end if;

  perform set_config('app.admin_remote_shift_close', 'on', true);

  update public.turnos
  set estado = 'cerrado',
      closed_at = now(),
      efectivo_declarado_caja_chica = p_efectivo_declarado,
      efectivo_declarado_sobre = 0,
      efectivo_declarado = p_efectivo_declarado,
      efectivo_sistema = efectivo_esperado::integer,
      observacion_descuadre = case
        when abs(p_efectivo_declarado::bigint - efectivo_esperado) > 500
          then motivo_normalizado
        else null
      end,
      cierre_remoto = true,
      cerrado_remotamente_por = actor_id,
      cierre_remoto_motivo = motivo_normalizado,
      cierre_remoto_actualizado_at = now()
  where id = target.id
  returning * into result;

  update public.turno_despachadores
  set activo = false
  where turno_id = target.id and activo is true;

  insert into public.turnos_cierres_admin_auditoria
    (turno_id, sucursal_id, usuario_id, accion, efectivo_anterior,
     efectivo_nuevo, efectivo_sistema, motivo)
  values
    (target.id, target.sucursal_id, actor_id, 'cierre_remoto', null,
     p_efectivo_declarado, efectivo_esperado::integer, motivo_normalizado);

  perform set_config('app.admin_remote_shift_close', 'off', true);
  return result;
end
$$;

revoke all on function public.cerrar_turno_remotamente_admin(uuid, integer, text)
  from public, anon;
grant execute on function public.cerrar_turno_remotamente_admin(uuid, integer, text)
  to authenticated;

create or replace function public.corregir_efectivo_cierre_remoto_admin(
  p_turno_id uuid,
  p_efectivo_anterior integer,
  p_efectivo_declarado integer,
  p_motivo text
)
returns public.turnos
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  actor_role text := private.current_app_role();
  target public.turnos;
  result public.turnos;
  motivo_normalizado text := nullif(btrim(p_motivo), '');
begin
  if actor_id is null then
    raise exception 'Autenticacion requerida' using errcode = '28000';
  end if;
  if actor_role not in ('admin', 'superadmin') then
    raise exception 'Solo un administrador puede corregir este cierre'
      using errcode = '42501';
  end if;
  if p_efectivo_declarado is null or p_efectivo_declarado < 0 then
    raise exception 'El efectivo real debe ser cero o un monto mayor'
      using errcode = '22023';
  end if;
  if motivo_normalizado is null then
    raise exception 'El motivo de la correccion es obligatorio'
      using errcode = '22023';
  end if;

  select t.* into target
  from public.turnos t
  where t.id = p_turno_id
  for update;

  if not found then
    raise exception 'Turno no encontrado' using errcode = 'P0002';
  end if;
  if target.estado <> 'cerrado' or target.cierre_remoto is not true then
    raise exception 'Solo se corrigen cierres administrativos desde este modulo'
      using errcode = '22023';
  end if;
  if target.cerrado_remotamente_por is distinct from actor_id then
    raise exception 'Solo quien realizo el cierre administrativo puede corregirlo'
      using errcode = '42501';
  end if;
  if target.efectivo_declarado is distinct from p_efectivo_anterior then
    raise exception 'El cierre fue modificado por otra sesion; actualice la pagina'
      using errcode = '40001';
  end if;
  if target.efectivo_declarado = p_efectivo_declarado then
    raise exception 'El nuevo efectivo debe ser distinto al registrado'
      using errcode = '22023';
  end if;

  perform set_config('app.admin_remote_shift_correction', 'on', true);

  update public.turnos
  set efectivo_declarado_caja_chica = p_efectivo_declarado,
      efectivo_declarado_sobre = 0,
      efectivo_declarado = p_efectivo_declarado,
      observacion_descuadre = case
        when abs(p_efectivo_declarado::bigint - efectivo_sistema::bigint) > 500
          then motivo_normalizado
        else null
      end,
      cierre_remoto_actualizado_at = now()
  where id = target.id
  returning * into result;

  insert into public.turnos_cierres_admin_auditoria
    (turno_id, sucursal_id, usuario_id, accion, efectivo_anterior,
     efectivo_nuevo, efectivo_sistema, motivo)
  values
    (target.id, target.sucursal_id, actor_id, 'correccion_efectivo',
     target.efectivo_declarado, p_efectivo_declarado,
     target.efectivo_sistema, motivo_normalizado);

  perform set_config('app.admin_remote_shift_correction', 'off', true);
  return result;
end
$$;

revoke all on function public.corregir_efectivo_cierre_remoto_admin(uuid, integer, integer, text)
  from public, anon;
grant execute on function public.corregir_efectivo_cierre_remoto_admin(uuid, integer, integer, text)
  to authenticated;

comment on function public.cerrar_turno_remotamente_admin(uuid, integer, text) is
  'Closes a forgotten open shift atomically, calculates expected cash, marks the administrative closure and writes immutable audit data.';

comment on function public.corregir_efectivo_cierre_remoto_admin(uuid, integer, integer, text) is
  'Allows only the same administrator who remotely closed a shift to correct its declared cash, preserving an append-only audit trail.';
