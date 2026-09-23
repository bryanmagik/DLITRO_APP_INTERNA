-- Los tomadores pueden leer las asignaciones del turno, pero la politica de
-- usuarios les ocultaba los perfiles relacionados. Eso hacia que el mapa
-- descartara todos los despachadores activos al no poder resolver sus nombres.
-- La excepcion se limita al rol despachador de la sucursal propia y exige el
-- permiso dispatchers.read; no concede users.read ni acceso entre sucursales.
alter policy usuarios_read_v2 on public.usuarios
using (
  id = (select auth.uid())
  or (
    private.has_permission('users.read')
    and (
      private.current_app_role() in ('admin', 'superadmin')
      or sucursal_id = private.current_sucursal_id()
      or (
        private.current_app_role() in ('jefe_bodega', 'logistica')
        and rol = 'logistica'
      )
    )
  )
  or (
    private.has_permission('dispatchers.read')
    and rol = 'despachador'
    and sucursal_id = private.current_sucursal_id()
  )
);
