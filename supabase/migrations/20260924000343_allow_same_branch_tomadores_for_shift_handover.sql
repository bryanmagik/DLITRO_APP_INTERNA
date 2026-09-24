-- Existing shift-handover UI reads public.usuarios directly to list a replacement
-- order taker. Keep users.read reserved for manager roles; expose only active
-- order takers from the caller's own branch to order takers who can annotate
-- handovers. This policy is SELECT-only; existing write policies are unchanged.
--
-- Rollback: drop policy if exists usuarios_shift_handover_candidates_read_v1
-- on public.usuarios;
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename = 'usuarios'
      and policyname = 'usuarios_shift_handover_candidates_read_v1'
  ) then
    create policy usuarios_shift_handover_candidates_read_v1
      on public.usuarios for select to authenticated
      using (
        private.current_app_role() = 'tomador_pedidos'
        and private.has_permission('closures.annotate')
        and rol = 'tomador_pedidos'
        and activo is true
        and sucursal_id = private.current_sucursal_id()
      );
  end if;
end $$;
