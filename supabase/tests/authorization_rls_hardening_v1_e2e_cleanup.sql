delete from public.pedidos
where cliente_nombre = 'RLS V1 E2E';

delete from public.turnos t
using public.usuarios u
where t.tomador_id = u.id
  and u.id = t.tomador_id
  and u.nombre = 'Prueba RLS'
  and u.apellido = 'A'
  and not exists (
    select 1 from public.pedidos p where p.turno_id = t.id
  );
