# Cierre de cambios actuales: pedidos y contabilidad

Fecha: 4 de octubre de 2026. Entorno verificado: staging (`suscxwjloggmbsqdlgpj`).

Estado: implementación local y validaciones automatizadas completadas. Pendiente QA visual con sesiones reales antes de publicar. Este cierre no incluye las funcionalidades nuevas de auditoría, rentabilidad, logística o franquicias del documento de actualización.

## Comportamiento

- Se cotiza con las tarifas configuradas; un fallo de carga no genera un precio de respaldo inventado.
- Crear un despacho exige cargar tarifas y tener un importe válido, entero y no negativo. Un campo vacío no equivale a envío gratuito. El ingreso manual existente se conserva cuando no hay distancia calculable; un cero explícito sigue siendo válido.
- Cambiar dirección descarta la distancia de Google anterior. Se conserva la distancia geográfica de respaldo mientras llega la nueva respuesta.
- Cero kilómetros y una tarifa configurada de cero son válidos. Se conserva el comportamiento existente de usar el último tramo para distancias superiores al rango.
- Editar un pedido conserva su costo previo si no cambia su modalidad o ubicación; una nueva cotización ausente bloquea el guardado.
- Contabilidad informa errores de consultas y evita mostrar un detalle parcial como resumen completo, con reintento.
- Los permisos de lectura de sucursales, liquidaciones y precios de trabajador fueron comprobados en staging. No se ampliaron permisos durante esta sesión.

## Evidencia

| Criterio | Verificación | Resultado |
| --- | --- | --- |
| Tarifas, límites, importes vacíos, cero, negativos y decimales | Suite Vitest, incluidas 15 regresiones nuevas | 78 pruebas aprobadas en 12 archivos |
| Tipos y análisis estático de archivos afectados | TypeScript y ESLint | Aprobado |
| Entorno y compilación | `build:staging` | Aprobado; advertencia existente sobre tamaño del paquete |
| Acceso por rol y sucursal, lectura de precios sin gestión | `authorization_rls_matrix_v2_matrix.sql` en staging | 101 aprobadas, 0 fallidas |
| Sucursales, totales de liquidaciones, modificaciones prohibidas y aislamiento del tomador | `accountant_cash_daily_read.sql` en staging | Aprobado |
| Datos sintéticos de pruebas SQL | Transacciones terminadas con `ROLLBACK` | Revertidos |
| Revisión de cambios | `git diff --check` | Aprobado |
| UI, Google Maps real, móvil y escritorio | Sesiones reales de tomador y contador | Pendiente |

## Comprobaciones manuales antes de publicar

1. Crear retiro y despacho; intentar guardar con costo vacío, verificar tarifa normal y cero explícito.
2. Simular fallo al cargar tarifas y recuperar mediante Reintentar.
3. Cambiar entre dos direcciones y verificar que la distancia anterior no determina la cotización nueva. Verificar también fallo de Google Maps.
4. Editar despacho existente y convertir entre retiro y despacho; comprobar ubicación, costo y total, sin alterar promociones existentes.
5. Con contabilidad, revisar nombres de sucursales, resumen diario y liquidaciones; simular error del detalle y reintentar.
6. Revisar esos flujos en pantalla pequeña y escritorio.

## Límites y preparación de producción

- No se publicó ni se modificó producción; no se generó un instalador nuevo.
- La política `precios_trabajador_order_entry_read_v1` existe en staging y pasó sus pruebas. Sin embargo, la migración local `20260926120000_worker_prices_order_entry_read.sql` no figura por versión ni por nombre en el historial remoto consultado. Revisar esa discrepancia antes de sincronizar migraciones; no se alteró el historial remoto para ocultarla.
- La migración contable `20261002163235_accountant_cash_daily_read` sí aparece en el historial remoto.
- Las escrituras separadas de pedido, productos y pagos conservan su arquitectura actual. Este cierre no acredita atomicidad ni implementa auditoría completa del ciclo de pedidos.
- La validación de importes en el formulario mejora la captura; no representa una nueva restricción de tarifa obligatoria en el servidor. No se modificaron reglas comerciales ni permisos de ajuste manual.
- Se preservaron los cambios locales previos del manifiesto de actualización y del resto del repositorio.
