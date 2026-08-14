-- Authorization + RLS Hardening v1
-- Scope: usuarios, sucursales, turnos, turno_despachadores, pedidos, pedido_items.
-- Application roles remain rows in public.usuarios; the Postgres API role is authenticated.

alter table public.usuarios enable row level security;
alter table public.sucursales enable row level security;
alter table public.turnos enable row level security;
alter table public.turno_despachadores enable row level security;
alter table public.pedidos enable row level security;
alter table public.pedido_items enable row level security;

revoke all on table
  public.usuarios,
  public.sucursales,
  public.turnos,
  public.turno_despachadores,
  public.pedidos,
  public.pedido_items
from anon;

revoke all on table
  public.usuarios,
  public.sucursales,
  public.turnos,
  public.turno_despachadores,
  public.pedidos,
  public.pedido_items
from authenticated;

-- Table privileges are the outer API boundary. RLS below narrows every operation
-- to the application role and sucursal of the current authenticated identity.
grant select, insert, update, delete on table
  public.usuarios,
  public.sucursales,
  public.turnos,
  public.turno_despachadores,
  public.pedidos,
  public.pedido_items
to authenticated;

drop policy if exists usuarios_self_select on public.usuarios;
drop policy if exists usuarios_admin_all on public.usuarios;
drop policy if exists sucursales_admin_all on public.sucursales;

drop policy if exists usuarios_select_v1 on public.usuarios;
drop policy if exists usuarios_insert_v1 on public.usuarios;
drop policy if exists usuarios_update_v1 on public.usuarios;
drop policy if exists usuarios_delete_v1 on public.usuarios;
drop policy if exists sucursales_select_v1 on public.sucursales;
drop policy if exists sucursales_insert_v1 on public.sucursales;
drop policy if exists sucursales_update_v1 on public.sucursales;
drop policy if exists sucursales_delete_v1 on public.sucursales;
drop policy if exists turnos_select_v1 on public.turnos;
drop policy if exists turnos_insert_v1 on public.turnos;
drop policy if exists turnos_update_v1 on public.turnos;
drop policy if exists turnos_delete_v1 on public.turnos;
drop policy if exists turno_despachadores_select_v1 on public.turno_despachadores;
drop policy if exists turno_despachadores_insert_v1 on public.turno_despachadores;
drop policy if exists turno_despachadores_update_v1 on public.turno_despachadores;
drop policy if exists turno_despachadores_delete_v1 on public.turno_despachadores;
drop policy if exists pedidos_select_v1 on public.pedidos;
drop policy if exists pedidos_insert_v1 on public.pedidos;
drop policy if exists pedidos_update_v1 on public.pedidos;
drop policy if exists pedidos_delete_v1 on public.pedidos;
drop policy if exists pedido_items_select_v1 on public.pedido_items;
drop policy if exists pedido_items_insert_v1 on public.pedido_items;
drop policy if exists pedido_items_update_v1 on public.pedido_items;
drop policy if exists pedido_items_delete_v1 on public.pedido_items;

create policy usuarios_select_v1 on public.usuarios
for select to authenticated
using (
  id = (select auth.uid())
  or public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and public.get_user_rol((select auth.uid())) in (
      'encargado', 'tomador_pedidos', 'preparador', 'despachador'
    )
  )
);

create policy usuarios_insert_v1 on public.usuarios
for insert to authenticated
with check (public.is_admin((select auth.uid())));

create policy usuarios_update_v1 on public.usuarios
for update to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

create policy usuarios_delete_v1 on public.usuarios
for delete to authenticated
using (public.is_admin((select auth.uid())));

create policy sucursales_select_v1 on public.sucursales
for select to authenticated
using (
  public.is_admin((select auth.uid()))
  or id = public.get_user_sucursal((select auth.uid()))
);

create policy sucursales_insert_v1 on public.sucursales
for insert to authenticated
with check (public.is_admin((select auth.uid())));

create policy sucursales_update_v1 on public.sucursales
for update to authenticated
using (public.is_admin((select auth.uid())))
with check (public.is_admin((select auth.uid())));

create policy sucursales_delete_v1 on public.sucursales
for delete to authenticated
using (public.is_admin((select auth.uid())));

create policy turnos_select_v1 on public.turnos
for select to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and public.get_user_rol((select auth.uid())) in (
      'encargado', 'tomador_pedidos', 'preparador', 'despachador'
    )
  )
);

create policy turnos_insert_v1 on public.turnos
for insert to authenticated
with check (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and tomador_id = (select auth.uid())
    and public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
  )
);

create policy turnos_update_v1 on public.turnos
for update to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
  )
)
with check (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
  )
);

create policy turnos_delete_v1 on public.turnos
for delete to authenticated
using (public.is_admin((select auth.uid())));

create policy turno_despachadores_select_v1 on public.turno_despachadores
for select to authenticated
using (
  exists (
    select 1 from public.turnos t
    where t.id = turno_despachadores.turno_id
  )
);

create policy turno_despachadores_insert_v1 on public.turno_despachadores
for insert to authenticated
with check (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.turnos t
      where t.id = turno_despachadores.turno_id
        and t.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
    and exists (
      select 1 from public.usuarios d
      where d.id = turno_despachadores.despachador_id
        and d.rol = 'despachador'
        and d.activo is true
        and d.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
);

create policy turno_despachadores_update_v1 on public.turno_despachadores
for update to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.turnos t
      where t.id = turno_despachadores.turno_id
        and t.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
)
with check (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.turnos t
      where t.id = turno_despachadores.turno_id
        and t.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
    and exists (
      select 1 from public.usuarios d
      where d.id = turno_despachadores.despachador_id
        and d.rol = 'despachador'
        and d.activo is true
        and d.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
);

create policy turno_despachadores_delete_v1 on public.turno_despachadores
for delete to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.turnos t
      where t.id = turno_despachadores.turno_id
        and t.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
);

create policy pedidos_select_v1 on public.pedidos
for select to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and public.get_user_rol((select auth.uid())) in (
      'encargado', 'tomador_pedidos', 'preparador', 'despachador'
    )
  )
);

create policy pedidos_insert_v1 on public.pedidos
for insert to authenticated
with check (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and tomador_id = (select auth.uid())
    and public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.turnos t
      where t.id = pedidos.turno_id
        and t.sucursal_id = pedidos.sucursal_id
        and t.estado = 'abierto'
    )
  )
);

create policy pedidos_update_v1 on public.pedidos
for update to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and public.get_user_rol((select auth.uid())) in (
      'encargado', 'tomador_pedidos', 'preparador'
    )
  )
)
with check (
  public.is_admin((select auth.uid()))
  or (
    sucursal_id = public.get_user_sucursal((select auth.uid()))
    and public.get_user_rol((select auth.uid())) in (
      'encargado', 'tomador_pedidos', 'preparador'
    )
    and exists (
      select 1 from public.turnos t
      where t.id = pedidos.turno_id
        and t.sucursal_id = pedidos.sucursal_id
    )
  )
);

create policy pedidos_delete_v1 on public.pedidos
for delete to authenticated
using (public.is_admin((select auth.uid())));

create policy pedido_items_select_v1 on public.pedido_items
for select to authenticated
using (
  exists (
    select 1 from public.pedidos p
    where p.id = pedido_items.pedido_id
  )
);

create policy pedido_items_insert_v1 on public.pedido_items
for insert to authenticated
with check (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
);

create policy pedido_items_update_v1 on public.pedido_items
for update to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
)
with check (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
);

create policy pedido_items_delete_v1 on public.pedido_items
for delete to authenticated
using (
  public.is_admin((select auth.uid()))
  or (
    public.get_user_rol((select auth.uid())) in ('encargado', 'tomador_pedidos')
    and exists (
      select 1 from public.pedidos p
      where p.id = pedido_items.pedido_id
        and p.sucursal_id = public.get_user_sucursal((select auth.uid()))
    )
  )
);

-- Restore the four order-flow triggers explicitly. DROP + CREATE keeps this
-- migration reviewable on databases where a sanitized baseline omitted them.
drop trigger if exists trg_descontar_stock on public.pedido_items;
create trigger trg_descontar_stock
after insert on public.pedido_items
for each row execute function public.descontar_stock_pedido();

drop trigger if exists trg_numero_pedido_online on public.pedidos;
create trigger trg_numero_pedido_online
before update on public.pedidos
for each row execute function public.set_numero_pedido_online();

drop trigger if exists trg_restaurar_stock_cancelacion on public.pedidos;
create trigger trg_restaurar_stock_cancelacion
after update on public.pedidos
for each row execute function public.restaurar_stock_cancelacion();

drop trigger if exists trg_set_numero_pedido on public.pedidos;
create trigger trg_set_numero_pedido
before insert on public.pedidos
for each row execute function public.set_numero_pedido();
