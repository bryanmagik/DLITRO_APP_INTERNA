create policy "productos_authenticated_select"
on public.productos
for select
to authenticated
using (true);

create policy "categorias_authenticated_select"
on public.categorias
for select
to authenticated
using (true);;
