-- Order entry needs the configured worker prices to quote a worker order.
-- Managing those prices remains restricted by worker_prices.manage.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'precios_trabajador'
      and policyname = 'precios_trabajador_order_entry_read_v1'
  ) then
    create policy precios_trabajador_order_entry_read_v1
    on public.precios_trabajador
    for select
    to authenticated
    using (
      private.has_permission('orders.create')
      or private.has_permission('orders.update')
    );
  end if;
end $$;
