-- El catalogo de insumos es necesario para capturar inventarios. Los usuarios
-- con inventory.read pueden consultarlo, sin recibir permiso para modificarlo.
drop policy if exists insumos_read_v2 on public.insumos;

create policy insumos_read_v2
on public.insumos
for select
to authenticated
using (
  private.has_permission('supplies.read')
  or private.has_permission('inventory.read')
);
