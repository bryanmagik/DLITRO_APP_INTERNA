-- Quote active promotions during order entry without granting promotion management.
create policy promociones_order_entry_read_v1
on public.promociones for select to authenticated
using (activo is true and (
  private.has_permission('orders.create') or private.has_permission('orders.update')
));

create policy promociones_precio_order_entry_read_v1
on public.promociones_precio for select to authenticated
using (activo is true and (
  private.has_permission('orders.create') or private.has_permission('orders.update')
));

-- Existing order-entry clients already subscribe to both tables.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='promociones') then
    alter publication supabase_realtime add table public.promociones;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='promociones_precio') then
    alter publication supabase_realtime add table public.promociones_precio;
  end if;
end $$;
