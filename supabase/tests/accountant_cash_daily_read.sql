-- STAGING only. Synthetic fixtures and assertions are rolled back.
begin;

do $$
declare accountant uuid; driver uuid; worker uuid;
begin
  select id into accountant from public.usuarios where rol='contador_rrhh' and activo limit 1;
  select id into driver from public.usuarios where rol='despachador' and activo limit 1;
  select id into worker from public.usuarios where rol='tomador_pedidos' and activo limit 1;
  if accountant is null or driver is null or worker is null then
    raise exception 'Staging requires active accountant, dispatcher and order taker test actors';
  end if;
  perform set_config('app.test.accountant', accountant::text, true);
  perform set_config('app.test.worker', worker::text, true);
  insert into public.sucursales(id,nombre,direccion,activo) values
    ('fcac0000-0000-4000-8000-000000000001','Accounting test A','Synthetic',true),
    ('fcac0000-0000-4000-8000-000000000002','Accounting test B','Synthetic',true);
  insert into public.turnos(id,sucursal_id,tomador_id,estado,fecha_dlitro) values
    ('fcac0000-0000-4000-8000-000000000011','fcac0000-0000-4000-8000-000000000001',accountant,'cerrado','2026-10-02'),
    ('fcac0000-0000-4000-8000-000000000012','fcac0000-0000-4000-8000-000000000002',accountant,'cerrado','2026-10-02');
  insert into public.pago_despachadores(id,turno_id,despachador_id,total_a_pagar) values
    ('fcac0000-0000-4000-8000-000000000021','fcac0000-0000-4000-8000-000000000011',driver,1200),
    ('fcac0000-0000-4000-8000-000000000022','fcac0000-0000-4000-8000-000000000012',driver,2300);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',accountant,'role','authenticated')::text,true);
end $$;

set local role authenticated;
do $$
declare affected integer;
begin
  if (select count(*) from public.turnos t join public.sucursales s on s.id=t.sucursal_id
      where t.id in ('fcac0000-0000-4000-8000-000000000011','fcac0000-0000-4000-8000-000000000012')) <> 2 then
    raise exception 'Accounting must read branch names for both closed shifts';
  end if;
  if (select coalesce(sum(total_a_pagar),0) from public.pago_despachadores
      where id in ('fcac0000-0000-4000-8000-000000000021','fcac0000-0000-4000-8000-000000000022')) <> 3500 then
    raise exception 'Accounting cash summary must include both dispatcher settlements';
  end if;
  if private.has_permission('branches.manage') or private.has_permission('dispatcher_payments.manage') then
    raise exception 'Read fix must not grant management';
  end if;
  update public.sucursales set nombre='Forbidden' where id='fcac0000-0000-4000-8000-000000000001';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Accounting must not edit branches'; end if;
  update public.pago_despachadores set total_a_pagar=1 where id='fcac0000-0000-4000-8000-000000000021';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Accounting must not edit settlements'; end if;
end $$;

reset role;
do $$ begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('app.test.worker'),'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$ begin
  if exists(select 1 from public.sucursales where id in ('fcac0000-0000-4000-8000-000000000001','fcac0000-0000-4000-8000-000000000002')) then
    raise exception 'Worker must not read unrelated branches';
  end if;
  if exists(select 1 from public.pago_despachadores where id in ('fcac0000-0000-4000-8000-000000000021','fcac0000-0000-4000-8000-000000000022')) then
    raise exception 'Worker must not read unrelated settlements';
  end if;
end $$;
reset role;
select 'PASS: accounting branch joins and settlement totals; management denied; worker scope preserved' as result;
rollback;
