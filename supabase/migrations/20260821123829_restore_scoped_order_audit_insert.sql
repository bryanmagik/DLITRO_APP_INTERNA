-- Preserve the existing active-order admin audit writer. History remains
-- append-only because authenticated users receive INSERT only (no UPDATE or
-- DELETE), and RLS requires both order scope and auth.uid ownership.

grant insert on public.log_cambios_pedido to authenticated;

drop policy if exists log_cambios_pedido_write_v2 on public.log_cambios_pedido;
create policy log_cambios_pedido_write_v2
on public.log_cambios_pedido
for insert
to authenticated
with check (
  private.pedido_in_scope(pedido_id)
  and usuario_id = (select auth.uid())
);
