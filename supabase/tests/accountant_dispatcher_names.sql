-- Read-only assertions against existing data. No fixture/data mutations.
begin transaction read only;
do $$
declare actor uuid; worker uuid; shift uuid; expected integer;
begin
  select id into actor from public.usuarios where rol='contador_rrhh' and activo limit 1;
  select id into worker from public.usuarios where rol='tomador_pedidos' and activo limit 1;
  select t.id into shift from public.turnos t where exists (
    select 1 from public.pago_despachadores d where d.turno_id=t.id
  ) order by t.fecha_dlitro desc limit 1;
  if actor is null or worker is null or shift is null then raise exception 'Missing accounting/worker/settlement test actors'; end if;
  select count(*) into expected from public.usuarios u where u.id in (
    select despachador_id from public.pedidos where turno_id=shift
    union select despachador_id from public.pago_despachadores where turno_id=shift
    union select despachador_id from public.turno_despachadores where turno_id=shift
  );
  perform set_config('app.test.shift',shift::text,true);
  perform set_config('app.test.expected',expected::text,true);
  perform set_config('app.test.worker',worker::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true);
end $$;
set local role authenticated;
do $$
declare found integer;
begin
  select count(*) into found from public.nombres_despachadores_contabilidad(current_setting('app.test.shift')::uuid);
  if found=0 or found<>current_setting('app.test.expected')::integer then raise exception 'Incomplete dispatcher names'; end if;
  if exists(select 1 from public.nombres_despachadores_contabilidad(current_setting('app.test.shift')::uuid) where coalesce(nullif(nombre_completo,''),nullif(nombre,'')) is null) then raise exception 'Empty dispatcher name'; end if;
  if exists(select 1 from public.nombres_despachadores_contabilidad(null)) then raise exception 'Null shift must return no names'; end if;
  if private.has_permission('users.manage') or private.has_permission('users.read') then raise exception 'Must not grant broad user permissions'; end if;
end $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('app.test.worker'),'role','authenticated')::text,true);
set local role authenticated;
do $$ begin
  begin
    perform * from public.nombres_despachadores_contabilidad(current_setting('app.test.shift')::uuid);
    raise exception 'Worker must be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select set_config('request.jwt.claims','{"role":"anon"}',true);
set local role anon;
do $$ begin
  begin
    perform * from public.nombres_despachadores_contabilidad(current_setting('app.test.shift')::uuid);
    raise exception 'Anon must be denied';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
select 'PASS: complete names; no broad user permissions; worker and anon denied' as result;
rollback;
