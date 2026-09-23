-- Order takers and branch managers need the customer-facing delivery prices
-- to quote orders. Do not grant delivery_rates.read here: that permission also
-- exposes dispatcher compensation rates via tarifas_despachador.
create policy tarifas_despacho_order_entry_read_v1
on public.tarifas_despacho
for select
to authenticated
using (
  private.has_permission('orders.create')
  or private.has_permission('orders.update')
);
