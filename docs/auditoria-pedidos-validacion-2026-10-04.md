# Auditoría de pedidos: implementación y validación

Entorno: staging `suscxwjloggmbsqdlgpj`. Producción no modificada.

## Alcance implementado

Historial automático en la tabla existente para creación, modificación, cancelación y eliminación de pedidos; productos; descuentos/promociones; registro/corrección de pagos. Captura autor autenticado, reloj del servidor, estado del pedido, turno, sucursal, tomador original y valores anteriores/nuevos. Conserva la evidencia tras borrar un pedido y no duplica las correcciones entregadas ni el retorno automático a cocina.

El panel incorpora filtros antes de paginar, 50 eventos por página, cronología por pedido, resúmenes de pedidos distintos y estados de carga, vacío, error y reintento. Fechas en Chile. La evidencia histórica se marca como parcial; los nuevos campos no reconstruyen autores o valores que nunca se registraron. Contacto y ubicación del cliente se omiten de las nuevas instantáneas.

Consulta reservada en servidor a superadmin y `dueno_dlitro`. El dueño no hereda permisos de pedidos, caja, inventario o usuarios. Se impide que admin cree o se asigne perfiles de dueño/superadmin. La función de creación de usuarios conserva autenticación JWT en su cuerpo y ahora valida esos perfiles antes de crear Auth.

## Pruebas completadas antes de solicitar aplicación

| Prueba | Resultado |
| --- | --- |
| Vitest completo | 87 aprobadas en 14 archivos |
| Revisión posterior de historial completo y fechas | 9 aprobadas en 2 archivos; añade una prueba nueva |
| Compilación staging | Aprobada |
| TypeScript y ESLint de archivos afectados | Aprobados |
| `order_audit_server_history.sql` con migración candidata y rollback | Aprobado |
| `advanced_delivered_order_payment_corrections.sql` con candidata y rollback | Aprobado, todas las assertions |
| `authorization_rls_matrix_v2_matrix.sql` con candidata y rollback | 101 aprobadas, 0 fallidas |
| `authorization_rls_matrix_v2_order_lifecycle.sql` con candidata y rollback | 25 aprobadas, 0 fallidas |

La nueva suite cubre autor A/autor B, cantidades anteriores/nuevas, estado al aplicar canje, pagos, no-ops, rollback, imposibilidad de fabricar o eliminar evidencia por API, acceso privado, falta de permisos operativos del dueño, prohibición de autopromoción admin, paginación con 211 eventos y retención del historial.

El fallo inicial de la suite antigua de ciclo era un conteo sin filtro de tipo: esperaba tres correcciones y encontró siete eventos al incluir la creación y pagos que ahora también se registran. Se añadió únicamente el filtro de los dos tipos post-cierre a los conteos de autor y sucursal. Se mantuvo la expectativa de tres correcciones, así como las dos por campo y todas las demás pruebas. Resultado final: 25/25, sin fallos.

## Cambios sensibles revisados

- El RPC existente de corrección de pagos necesita escribir evidencia aunque el cliente ya no tenga INSERT en historial. Se conserva su contrato y todas las validaciones de montos/métodos; añade explícitamente permiso `cash.manage`, alcance de turno y sucursal a sus controles antes de escribir con privilegios del servidor.
- Los triggers de inventario y las reglas de estados no se reemplazan. El nuevo historial utiliza triggers AFTER y se confirma/revierte en la misma transacción de cada escritura.
- La conservación del historial cambia exclusivamente las FK de la tabla de auditoría a SET NULL; no cambia las FK de pagos/productos ni autoriza eliminación de pedidos.
- Las restricciones de auditoría sustituyen únicamente las políticas SELECT de las tres tablas de evidencia, no las consultas operativas de pedidos/caja/despachos.

## Estado de despliegue y pendientes

El rol dedicado fue agregado a staging y `crear-usuario` versión 7 fue desplegada allí. La primera aplicación de la migración principal fue rechazada por revisión automática por la amplitud del cambio y el reporte inicial de una regresión; esa regresión de conteo ya fue precisada y todas las suites posteriores pasaron. La segunda solicitud, con los resultados aprobados, también fue rechazada: la revisión exige autorización específica del usuario para este cambio persistente que abarca RLS, triggers, retención y el RPC de pagos. Tras autorización explícita del usuario el 4 de octubre, la migración principal se aplicó correctamente con versión remota 20261004220345; el archivo local coincide con esa versión. El rechazo no se sorteó mediante una ejecución indirecta persistente.

Cuenta solicitada: Bryan Boza, `boza@dlitro.cl`. Intento inicial mediante credenciales locales: las credenciales locales del superadmin sintético ya no permiten iniciar sesión. No se cambiaron contraseñas existentes para resolverlo. Se dejó el formulario de Auth en el dashboard de staging con el correo, sin contraseña, para que el usuario complete personalmente la credencial y la creación. El usuario creó Auth y se verificó el correo confirmado. Se insertó el perfil Bryan Boza, activo, rol dueno_dlitro, sin sucursal. Consulta autenticada con su UID: auditoría true; orders.update, cash.manage y users.manage false; 7 eventos históricos disponibles. No se obtuvo ni modificó su contraseña.

Después de aplicar se repitieron con rollback las suites de historial, pagos, permisos (101/101) y ciclo (25/25): todas aprobadas. Compilación staging y 87 pruebas frontend aprobadas. El usuario inició sesión con boza@dlitro.cl. Se verificaron en navegador el perfil de dueño y su único menú de auditoría, carga real de 7 registros, historial individual, filtro por persona con resultado vacío y limpieza. Vista móvil de 390 px revisada y tamaño restaurado. Los pagos se muestran en texto y CLP, sin JSON técnico. No se recuperaron tokens ni contraseñas del navegador. El frontend local está abierto en http://127.0.0.1:8080 conectado a staging. La paginación de más de 200 eventos se verificó mediante la suite de base de datos, no con datos persistentes en pantalla. La cuadratura física de jarros, gestión de alertas y estadísticas completas de despachadores requieren etapas posteriores; este cambio captura evidencia sin inventar recepciones físicas.

No se publicó frontend ni instalador. La atomicidad de todo un pedido con productos/pagos en varias solicitudes permanece fuera de este alcance.
