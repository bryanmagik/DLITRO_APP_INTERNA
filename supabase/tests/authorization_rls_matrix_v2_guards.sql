-- Guard-trigger coverage for authorization_rls_matrix_v2:
--   private.guard_pedido_update_v2()  (trigger guard_pedido_update_v2 on public.pedidos)
--   private.guard_turno_update_v2()   (trigger guard_turno_update_v2 on public.turnos)
--
-- These triggers exist BECAUSE row policies alone cannot express "this role may
-- change column X but not column Y on a row it is otherwise allowed to update".
-- Self-contained, fully transactional: BEGIN ... ROLLBACK. Safe to re-run on STAGING.
--
-- ISOLATION NOTE (2026-08-17): every guard_pedido_update_v2 case below now uses its
-- OWN pedido fixture. The original version of this file ran four sequential UPDATEs
-- against a single shared pedido row. That created an accidental test-order
-- dependency: once the `vuelto` GENERATED-column bug in guard_pedido_update_v2() was
-- fixed (migration 20260817144833), the first case started actually persisting its
-- estado change instead of always raising and rolling back -- which silently flipped
-- the starting state seen by the fourth case from 'tomado' to 'en_preparacion' and
-- made its old DENY expectation wrong. See the "Caso A/B/C/D" block below for the
-- confirmed-business-rule replacement coverage. guard_turno_update_v2's cases were
-- checked and do NOT have this problem (their exclusion set never includes a column
-- whose value depends on a prior case in the same run), so that section is unchanged.

begin;

create temp table rls_v2_guard_results (
  seq bigserial,
  actor text not null,
  case_name text not null,
  actual text not null,
  expected text not null,
  result text not null,
  detail text not null
) on commit drop;
grant all on rls_v2_guard_results to authenticated;
grant usage on rls_v2_guard_results_seq_seq to authenticated;

insert into public.sucursales (id, nombre, direccion, activo) values
  ('daaaaaaa-0000-4000-8000-00000000000a', 'Guard V2 Sucursal A', 'Direccion sintetica', true),
  ('daaaaaaa-0000-4000-8000-00000000000b', 'Guard V2 Sucursal B', 'Direccion sintetica B', true);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, email_change,
  email_change_token_new, recovery_token
)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated',
       email, crypt(gen_random_uuid()::text, gen_salt('bf')),
       now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb,
       now(), now(), '', '', '', ''
from (values
  ('dbbbbbbb-0000-4000-8000-000000000001'::uuid, 'guard-v2-admin@test.local'),
  ('dbbbbbbb-0000-4000-8000-000000000002'::uuid, 'guard-v2-encargado@test.local'),
  ('dbbbbbbb-0000-4000-8000-000000000003'::uuid, 'guard-v2-preparador@test.local'),
  ('dbbbbbbb-0000-4000-8000-000000000004'::uuid, 'guard-v2-tomador@test.local')
) as x(id, email);

insert into public.usuarios (id, nombre, rol, sucursal_id, activo) values
  ('dbbbbbbb-0000-4000-8000-000000000001', 'Guard Admin',      'admin',           'daaaaaaa-0000-4000-8000-00000000000a', true),
  ('dbbbbbbb-0000-4000-8000-000000000002', 'Guard Encargado',  'encargado',       'daaaaaaa-0000-4000-8000-00000000000a', true),
  ('dbbbbbbb-0000-4000-8000-000000000003', 'Guard Preparador', 'preparador',      'daaaaaaa-0000-4000-8000-00000000000a', true),
  ('dbbbbbbb-0000-4000-8000-000000000004', 'Guard Tomador',    'tomador_pedidos', 'daaaaaaa-0000-4000-8000-00000000000a', true);

insert into public.categorias (id, nombre) values ('dccccccc-0000-4000-8000-000000000001', 'Guard V2 Cat');
insert into public.productos (id, nombre, precio, categoria_id) values
  ('dccccccc-0000-4000-8000-000000000002', 'Guard V2 Prod', 1000, 'dccccccc-0000-4000-8000-000000000001');

-- turno_open (Branch A): used by every guard_pedido_update_v2 case below.
insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'abierto', 0);

-- turno_open (Branch B): only used by Caso D (cross-branch pedido for a Branch A actor).
insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura) values
  ('dddddddd-0000-4000-8000-00000000b001', 'daaaaaaa-0000-4000-8000-00000000000b', 'dbbbbbbb-0000-4000-8000-000000000004', 'abierto', 0);

-- turno_closed: used for guard_turno_update_v2 (encargado annotating vs correcting a closed shift).
insert into public.turnos (id, sucursal_id, tomador_id, estado, caja_chica_apertura, efectivo_declarado) values
  ('dddddddd-0000-4000-8000-000000000003', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'cerrado', 0, 1000);

-- Independent pedido fixtures, one per guard_pedido_update_v2 case, so no case can
-- change the starting state another case relies on.
insert into public.pedidos (id, turno_id, sucursal_id, tomador_id, cliente_nombre, tipo, estado, subtotal, descuento, costo_despacho, total) values
  -- P1: state-transition case (tomado -> en_preparacion, no other column touched).
  ('dddddddd-0000-4000-8000-00000000a101', 'dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P1', 'retiro', 'tomado', 1000, 0, 0, 1000),
  -- P2: state-transition to a disallowed value (cancelado).
  ('dddddddd-0000-4000-8000-00000000a102', 'dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P2', 'retiro', 'tomado', 1000, 0, 0, 1000),
  -- P3: allowed estado value combined with a disallowed financial-field change.
  ('dddddddd-0000-4000-8000-00000000a103', 'dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P3', 'retiro', 'tomado', 1000, 0, 0, 1000),
  -- P4 / Caso A: comanda_impresa only, starting estado = tomado (kitchen has not started).
  ('dddddddd-0000-4000-8000-00000000a104', 'dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P4 CasoA', 'retiro', 'tomado', 1000, 0, 0, 1000),
  -- P5 / Caso B: comanda_impresa only, starting estado = en_preparacion (confirmed business rule).
  ('dddddddd-0000-4000-8000-00000000a105', 'dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P5 CasoB', 'retiro', 'en_preparacion', 1000, 0, 0, 1000),
  -- P6 / Caso C: comanda_impresa only, starting estado = listo (business rule not explicitly confirmed here).
  ('dddddddd-0000-4000-8000-00000000a106', 'dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P6 CasoC', 'retiro', 'listo', 1000, 0, 0, 1000),
  -- P7 / Caso D: comanda_impresa only, pedido belongs to Branch B; a Branch A preparador attempts it.
  ('dddddddd-0000-4000-8000-00000000b107', 'dddddddd-0000-4000-8000-00000000b001', 'daaaaaaa-0000-4000-8000-00000000000b', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P7 CasoD', 'retiro', 'en_preparacion', 1000, 0, 0, 1000),
  -- P8: financial-field change by a role OTHER than preparador (guard must not restrict it at all).
  ('dddddddd-0000-4000-8000-00000000a108', 'dddddddd-0000-4000-8000-000000000001', 'daaaaaaa-0000-4000-8000-00000000000a', 'dbbbbbbb-0000-4000-8000-000000000004', 'Guard V2 P8', 'retiro', 'tomado', 1000, 0, 0, 1000);

create function pg_temp.as_actor(p_user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims', jsonb_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
$$;

create procedure pg_temp.record(p_actor text, p_case text, p_actual text, p_expected text, p_detail text)
language sql as $$
  insert into rls_v2_guard_results (actor, case_name, actual, expected, result, detail)
  values (p_actor, p_case, p_actual, p_expected,
    case when p_actual = p_expected then 'PASS' else 'FAIL' end, p_detail);
$$;

-- Everything from here on runs AS 'authenticated', not as the superuser/owner
-- connection used for fixture setup above (which would bypass RLS entirely).
set local role authenticated;

-- ---------------------------------------------------------------------------
-- guard_pedido_update_v2: preparador may only move estado into
-- ('en_preparacion','listo') and may not touch any other column (comanda_impresa,
-- tiempo_estimado_minutos and estado itself are the allowed columns).
-- Each case below uses its own pedido fixture (P1..P8) -- see ISOLATION NOTE above.
-- ---------------------------------------------------------------------------

-- Every case below uses GET DIAGNOSTICS ROW_COUNT after the UPDATE, not just
-- exception-catching. This matters because a denial can come from two different
-- mechanisms that behave differently: guard_pedido_update_v2 DENIES by raising an
-- exception (errcode 42501, caught by `insufficient_privilege`), while the
-- pedidos_update_v2 RLS policy's USING clause (e.g. can_access_sucursal for a
-- cross-branch row) denies SILENTLY -- the UPDATE simply matches 0 rows and
-- returns without error. Checking only for a thrown exception cannot distinguish
-- a real ALLOW from a silent RLS no-op, which produced a false "ALLOW" for the
-- cross-branch Caso D below on the first isolated run of this file.
select pg_temp.as_actor('dbbbbbbb-0000-4000-8000-000000000003'); -- preparador

do $$
declare v_count int;
begin
  begin
    update public.pedidos set estado = 'en_preparacion' where id = 'dddddddd-0000-4000-8000-00000000a101'; -- P1
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador', 'P1: estado_only tomado -> en_preparacion (allowed transition)',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
      case when v_count = 1 then 'estado-only change to en_preparacion succeeded' else 'blocked silently by RLS (0 rows updated) -- check kitchen.update / can_access_sucursal / turno_is_open' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador', 'P1: estado_only tomado -> en_preparacion (allowed transition)', 'DENY', 'ALLOW', 'unexpectedly blocked by exception -- check guard_pedido_update_v2 exclusion list (vuelto fix from 20260817144833)');
  when others then
    call pg_temp.record('preparador', 'P1: estado_only tomado -> en_preparacion (allowed transition)', 'ERROR', 'ALLOW', 'unexpected error: ' || sqlerrm);
  end;
end $$;

do $$
declare v_count int;
begin
  begin
    update public.pedidos set estado = 'cancelado' where id = 'dddddddd-0000-4000-8000-00000000a102'; -- P2
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador', 'P2: estado_only tomado -> cancelado (disallowed value)',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'preparador cancelled an order directly' else 'blocked (0 rows updated)' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador', 'P2: estado_only tomado -> cancelado (disallowed value)', 'DENY', 'DENY', 'blocked: cancelado not in {en_preparacion,listo} for preparador');
  end;
end $$;

do $$
declare v_count int;
begin
  begin
    update public.pedidos set estado = 'en_preparacion', total = 999999 where id = 'dddddddd-0000-4000-8000-00000000a103'; -- P3
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador', 'P3: estado(allowed) + total(financial, disallowed)',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'preparador changed total alongside an allowed estado change' else 'blocked (0 rows updated)' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador', 'P3: estado(allowed) + total(financial, disallowed)', 'DENY', 'DENY', 'blocked: total is outside the allowed column set');
  end;
end $$;

-- Caso A (confirmed business rule scope): the business rule only confirms comanda
-- edits during en_preparacion. It says nothing about 'tomado' (kitchen has not
-- received the order yet). Expectation is DERIVED from the current implementation,
-- not invented: guard_pedido_update_v2's second check requires the RESULTING estado
-- to be in {en_preparacion,listo}; here estado is untouched and stays 'tomado', so
-- it is rejected. This also matches the real kitchen UI (src/pages/preparador/
-- CocinaPage.tsx), which only ever queries/operates on pedidos already in
-- en_preparacion -- a 'tomado' order is not yet visible to a preparador in practice.
do $$
declare v_count int;
begin
  begin
    update public.pedidos set comanda_impresa = true where id = 'dddddddd-0000-4000-8000-00000000a104'; -- P4
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador', 'Caso A: comanda_impresa only, estado=tomado',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'preparador edited comanda_impresa on an order the kitchen has not started (estado=tomado)' else 'blocked (0 rows updated)' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador', 'Caso A: comanda_impresa only, estado=tomado', 'DENY', 'DENY', 'blocked: resulting estado (tomado) is not in {en_preparacion,listo}; matches current CocinaPage.tsx scope (kitchen only sees en_preparacion orders)');
  end;
end $$;

-- Caso B (confirmed business rule): "cuando un pedido esta en_preparacion, la
-- comanda debe poder modificarse" -- clientes pueden agregar productos o pedir
-- cambios de ultima hora mientras cocina ya esta preparando el pedido. ALLOW here
-- is a business requirement, not just an implementation detail.
do $$
declare v_count int;
begin
  begin
    update public.pedidos set comanda_impresa = true where id = 'dddddddd-0000-4000-8000-00000000a105'; -- P5
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador', 'Caso B: comanda_impresa only, estado=en_preparacion',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
      case when v_count = 1 then 'confirmed business rule: comanda editable while cocina prepara el pedido' else 'BUSINESS RULE VIOLATION -- 0 rows updated, comanda edits during en_preparacion must be allowed' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador', 'Caso B: comanda_impresa only, estado=en_preparacion', 'DENY', 'ALLOW', 'BUSINESS RULE VIOLATION -- blocked by exception, comanda edits during en_preparacion must be allowed');
  end;
end $$;

-- Caso C: BUSINESS RULE AMBIGUITY. The confirmed rule only covers en_preparacion;
-- it does not say whether comanda edits should still be allowed once the order is
-- 'listo' (kitchen has finished, order is presumably about to be dispatched). The
-- expected value below is set to match the CURRENT, already-shipped implementation
-- (guard_pedido_update_v2's allowed-estado set treats en_preparacion and listo
-- identically) so this test tracks real behavior rather than inventing a rule.
-- Do not change guard_pedido_update_v2 to special-case 'listo' based on this test
-- alone -- get an explicit business decision first.
do $$
declare v_count int;
begin
  begin
    update public.pedidos set comanda_impresa = true where id = 'dddddddd-0000-4000-8000-00000000a106'; -- P6
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador', 'Caso C [BUSINESS RULE AMBIGUITY]: comanda_impresa only, estado=listo',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
      case when v_count = 1 then 'current implementation allows this (listo is in the same allowed-estado set as en_preparacion); NOT yet confirmed as an intended business rule -- flagged for follow-up, no security change made' else 'behavior changed from what the current shipped guard does -- investigate before treating as expected' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador', 'Caso C [BUSINESS RULE AMBIGUITY]: comanda_impresa only, estado=listo', 'DENY', 'ALLOW', 'behavior changed from what the current shipped guard does -- investigate before treating as expected');
  end;
end $$;

-- Caso D: cross-branch. Regardless of estado, a preparador from Branch A must never
-- reach a pedido whose sucursal_id is Branch B. This is enforced by the
-- pedidos_update_v2 RLS policy's can_access_sucursal() check, independent of
-- guard_pedido_update_v2 (which never inspects sucursal_id at all). RLS denial here
-- is SILENT (0 rows), not an exception -- see the row-count note above the P1 case.
do $$
declare v_count int;
begin
  begin
    update public.pedidos set comanda_impresa = true where id = 'dddddddd-0000-4000-8000-00000000b107'; -- P7 (Branch B)
    get diagnostics v_count = row_count;
    call pg_temp.record('preparador', 'Caso D: comanda_impresa only, pedido en otra sucursal',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'DENY',
      case when v_count = 1 then 'SECURITY BUG -- preparador from Branch A modified a Branch B pedido' else 'blocked by pedidos_update_v2 RLS policy (can_access_sucursal): 0 rows matched/updated' end);
  exception when insufficient_privilege then
    call pg_temp.record('preparador', 'Caso D: comanda_impresa only, pedido en otra sucursal', 'DENY', 'DENY', 'blocked by exception (independent confirmation, still DENY)');
  end;
end $$;

-- Roles other than preparador are NOT restricted by this guard at all.
select pg_temp.as_actor('dbbbbbbb-0000-4000-8000-000000000002'); -- encargado (has orders.update)
do $$
declare v_count int;
begin
  begin
    update public.pedidos set total = 12345, descuento = 100 where id = 'dddddddd-0000-4000-8000-00000000a108'; -- P8
    get diagnostics v_count = row_count;
    call pg_temp.record('encargado', 'P8: financial fields, role != preparador',
      case when v_count = 1 then 'ALLOW' else 'DENY' end, 'ALLOW',
      case when v_count = 1 then 'guard only restricts caller_role = preparador' else 'unexpectedly blocked (0 rows updated) -- check orders.update / can_access_sucursal / turno_is_open' end);
  exception when insufficient_privilege then
    call pg_temp.record('encargado', 'P8: financial fields, role != preparador', 'DENY', 'ALLOW', 'unexpectedly blocked by exception -- check orders.update / can_access_sucursal / turno_is_open');
  end;
end $$;

-- ---------------------------------------------------------------------------
-- guard_turno_update_v2: once a turno is 'cerrado', an encargado may only
-- touch observacion_descuadre. admin/superadmin are not restricted by this
-- guard (closures.correct is their tool, this trigger targets encargado only).
-- Unchanged from the original file: each case's PASS/FAIL does not depend on
-- what a previous case did (efectivo_declarado is never in the excluded set,
-- and the admin case is unrestricted by role regardless of the row's values).
-- ---------------------------------------------------------------------------

select pg_temp.as_actor('dbbbbbbb-0000-4000-8000-000000000002'); -- encargado

do $$
begin
  begin
    update public.turnos set observacion_descuadre = 'anotacion del encargado' where id = 'dddddddd-0000-4000-8000-000000000003';
    call pg_temp.record('encargado', 'closed turno: observacion_descuadre only', 'ALLOW', 'ALLOW', 'annotation-only change on a closed shift succeeded');
  exception when insufficient_privilege then
    call pg_temp.record('encargado', 'closed turno: observacion_descuadre only', 'DENY', 'ALLOW', 'unexpectedly blocked -- check closures.annotate / can_access_sucursal');
  end;
end $$;

do $$
begin
  begin
    update public.turnos set efectivo_declarado = 5000 where id = 'dddddddd-0000-4000-8000-000000000003';
    call pg_temp.record('encargado', 'closed turno: efectivo_declarado (correction, disallowed for encargado)', 'ALLOW', 'DENY', 'encargado corrected a closed shift -- should require closures.correct');
  exception when insufficient_privilege then
    call pg_temp.record('encargado', 'closed turno: efectivo_declarado (correction, disallowed for encargado)', 'DENY', 'DENY', 'blocked: encargado may annotate a closed turno but not correct it');
  end;
end $$;

select pg_temp.as_actor('dbbbbbbb-0000-4000-8000-000000000001'); -- admin (has closures.correct)
do $$
begin
  begin
    update public.turnos set efectivo_declarado = 5000 where id = 'dddddddd-0000-4000-8000-000000000003';
    call pg_temp.record('admin', 'closed turno: efectivo_declarado (correction, role != encargado)', 'ALLOW', 'ALLOW', 'guard only restricts caller_role = encargado; admin holds closures.correct');
  exception when insufficient_privilege then
    call pg_temp.record('admin', 'closed turno: efectivo_declarado (correction, role != encargado)', 'DENY', 'ALLOW', 'unexpectedly blocked -- check closures.correct in role_permissions');
  end;
end $$;

select jsonb_build_object(
  'total', (select count(*) from rls_v2_guard_results),
  'pass', (select count(*) from rls_v2_guard_results where result = 'PASS'),
  'fail', (select count(*) from rls_v2_guard_results where result = 'FAIL'),
  'failures', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_guard_results r where result = 'FAIL'),
  'all_results', (select coalesce(jsonb_agg(to_jsonb(r) order by r.seq), '[]'::jsonb) from rls_v2_guard_results r)
) as report;

rollback;
