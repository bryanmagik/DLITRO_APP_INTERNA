-- Order takers and branch managers need the customer-facing delivery prices
-- to quote orders. Do not grant delivery_rates.read here: that permission also
-- exposes dispatcher compensation rates via tarifas_despachador.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'tarifas_despacho'
      and policyname = 'tarifas_despacho_order_entry_read_v1'
  ) then
    create policy tarifas_despacho_order_entry_read_v1
    on public.tarifas_despacho
    for select
    to authenticated
    using (
      private.has_permission('orders.create')
      or private.has_permission('orders.update')
    );
  end if;
end $$;
