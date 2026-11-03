# Nombres de despachadores para contabilidad

Contabilidad podía leer pedidos y liquidaciones, pero la política usuarios_read_v2 solo permitía perfiles de despachadores de su propia sucursal. Los joins de usuarios quedaban nulos al consultar otras sucursales y la pantalla mostraba un guion.

Se implementó nombres_despachadores_contabilidad(p_turno), un RPC SECURITY INVOKER con helper privado SECURITY DEFINER que devuelve exclusivamente id, nombre, apellido y nombre_completo de usuarios referenciados como despachadores en pedidos, liquidaciones o asignaciones del turno. No devuelve RUT, teléfono ni fecha de nacimiento; conserva nombres históricos de despachadores inactivos o cuyo rol haya cambiado.

El helper exige identidad autenticada activa, rol contador_rrhh/admin/superadmin y permisos cash.read y dispatcher_payments.read. No se modificaron políticas de usuarios, permisos de gestión ni datos operativos. La pantalla aplica los nombres tanto a pedidos como a pagos de despachadores y muestra un error si la consulta falla, evitando un detalle silenciosamente incompleto.

Migración 20261005192354_accountant_dispatcher_profiles_read aplicada primero en staging suscxwjloggmbsqdlgpj y luego en producción uwymxjmyasnlmkitzvej, por solicitud del usuario de habilitar esta lectura. Se aplicó exclusivamente esta migración en una transacción con su registro, sin sincronizar versiones históricas diferentes.

Validación:

- Suite SQL candidata en staging con rollback y suite persistida en staging y producción: nombres completos del turno seleccionado, ausencia de permisos amplios de usuarios y rechazo de tomador y anon. Consultas de producción de solo lectura.
- Tres pruebas de pantalla: tarjetas diarias, nombres cuando el join devuelve null y error de lectura. Regresión completa: 110 pruebas en 20 archivos pasan.
- TypeScript, lint de archivos afectados, diff-check y compilación de producción pasan. Se eliminó la opción exact no admitida en findByRole de la prueba de contabilidad.
- Advisors de staging: advertencias existentes sobre funciones públicas SECURITY DEFINER y protección de contraseñas. El RPC nuevo es SECURITY INVOKER y el helper permanece en private con validación explícita de roles.
- Publicación web READY dpl_AQaUbKnyJnB1FHgjeCcGdkQsYwcM, alias https://dlitro-portal-interno.vercel.app, paquete index-DKy-gyVO.js. Ruta /contador y paquete HTTP 200, consulta nueva presente.

No se generó un instalador nuevo. La verificación de pantalla se realizó con pruebas automatizadas; no se realizó una revisión visual autenticada del portal de producción con el rol contador en esta intervención.

Reversión: volver al despliegue web anterior y eliminar primero public.nombres_despachadores_contabilidad(uuid), luego private.accounting_dispatcher_names(uuid), mediante una migración revisada. No requiere revertir datos operativos.
