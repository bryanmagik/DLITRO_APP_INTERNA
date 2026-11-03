# Dashboard de auditoría para superadmin

Implementado en staging `suscxwjloggmbsqdlgpj`. No se modificó producción. Migración aplicada: `20261004221858_order_audit_dashboard.sql`.

La pestaña Resumen es la entrada del panel para superadmin. El dueño conserva su historial de lectura. La nueva función agregada valida en servidor el rol activo superadmin; no concede permisos operativos, no escribe operaciones, ni cambia triggers o políticas existentes. Anon y todos los perfiles activos que no son superadmin fueron comprobados como denegados.

## Indicadores y definiciones

- Cambios por persona, sucursal y día: eventos del período excepto creación de pedido y eventos automáticos. Incluye productos, pagos, cancelaciones, eliminaciones y correcciones. Un evento puede abarcar varios campos; no equivale necesariamente a una sola pulsación del usuario. Las filas históricas conservan cobertura parcial y autores no identificados.
- Jarros por despachador: suma de `jarros_entregados` en pedidos de despacho actualmente entregados, creados durante el período. No cuenta jarros de retiro ni pedidos cancelados. Agrupa los pedidos sin despachador por separado. Null se muestra como falta de dato, no como cero. No demuestra recepción física en bodega.
- Promociones por sucursal: pedidos actualmente entregados creados durante el período con promo_tipo, cupón, jarra dorada o descuento positivo. Cada pedido cuenta una vez, aunque tenga cientos de eventos o varias promociones. Se muestran proporción respecto de entregados, descuentos registrados y categorías (canje, cumpleaños, trabajador, jarra dorada). Las categorías pueden coincidir.
- Fechas del historial: hora del evento. Fechas de jarros y promociones: cohorte por creación del pedido, porque el esquema actual no guarda una fecha independiente e inmutable de entrega. No presentar estas cifras como entregas efectuadas durante ese día. Las correcciones posteriores reflejan el estado actual del pedido.

Filtros de fecha y sucursal se aplican en servidor antes de agregar todos los registros, sin límites de 50/200 eventos. Período máximo de un año. Rankings completos con desplazamiento; sin truncamiento a diez personas. Enlaces de persona y sucursal abren el historial con el mismo período y filtro. El panel conserva estados de carga, error, reintento y ausencia de datos.

## Validación

- Suite SQL `order_audit_dashboard.sql` aprobada antes y después de aplicar: 205 eventos, fechas de Chile y límite exclusivo, pedidos únicos, cancelados y fuera del período excluidos, jarros null, retiro excluido de despachadores, filtros por sucursal y permisos. Todos los datos sintéticos se revirtieron.
- 90 pruebas frontend aprobadas en 15 archivos, incluyendo navegación por rol, filtros, enlaces al historial, errores y cantidades desconocidas. TypeScript, lint y compilación staging aprobados.
- Sesión real QA superadmin abierta en navegador: Resumen, consulta real con datos operativos existentes y estados vacíos. Se verificó el período 2 de agosto a 4 de octubre: 7 cambios, 2 pedidos modificados, 5 jarros informados sin despachador asignado y 2 promociones en 9 pedidos entregados. El enlace por persona abrió 7 eventos con el mismo período. Al volver se conservaron filtros del resumen. Vista de 390 px revisada, tamaño restaurado y captura guardada en .local/audit/superadmin-dashboard.png. No se agregaron datos persistentes para ilustrar los rankings.
- Documentación de funciones consultada: https://supabase.com/docs/guides/database/functions (security definer, search_path vacío, grants). El índice changelog.md no pudo recuperarse mediante el navegador de fuentes.

Frontend disponible localmente; no se publicó instalador ni se desplegó una versión de producción. La falta de despachador o autor en datos antiguos sigue explícita y no se reconstruye una identidad ficticia.
