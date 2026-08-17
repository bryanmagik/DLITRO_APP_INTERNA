create policy "Public read productos images"
on storage.objects for select
to public
using (bucket_id = 'productos');

create policy "Authenticated upload productos images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'productos');

create policy "Authenticated update productos images"
on storage.objects for update
to authenticated
using (bucket_id = 'productos');

create policy "Authenticated delete productos images"
on storage.objects for delete
to authenticated
using (bucket_id = 'productos');;
