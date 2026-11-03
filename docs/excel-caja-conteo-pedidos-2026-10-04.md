# Excel de Caja por día: conteo de pedidos

El usuario confirmó que PEDIDOS debe contar únicamente entregados. Antes contaba pedidos propios no cancelados, incluyendo pendientes y excluyendo Uber/Rappi. Además, las columnas de plataformas contaban estados cancelados y pendientes, a diferencia de las modalidades propias.

Se cuenta cada pedido entregado una vez, incluyendo plataformas. RETIROS, DESPACHOS, UBER y RAPPI cuentan entregados de su modalidad. Cancelados continúan separados; se añade PEDIDOS PENDIENTES al final para conservar posiciones de columnas existentes. Los indicadores de productos, promociones y comunas propios se limitan también a entregados. Los importes financieros mantienen las fórmulas previas y sus registros por método.

Los turnos ahora se cargan paginados y todas las consultas paginadas usan orden estable por id, evitando depender de orden arbitrario. No se modificó la autorización ni la base de datos.

La presentación tiene encabezado verde, filas alternadas, separadores de miles y anchos legibles. Se congelan encabezado y columnas de fecha/sucursal. Una hoja Criterios explica fecha operativa, estados, plataformas, métodos e importes. El diálogo de exportación informa el criterio.

| Criterio | Evidencia | Resultado |
| --- | --- | --- |
| Entregados, plataformas, pendientes, cancelados y varias filas de pago | Prueba de exportación con dos turnos de misma sucursal | Aprobado |
| Más de 1.000 pedidos y turnos | Dos pruebas de paginación | Aprobado |
| Error de consulta no genera archivo parcial | Prueba de exportación | Aprobado |
| Regresión | 98 pruebas en 17 archivos | Aprobado |
| Tipos, lint y compilación staging | Validaciones locales | Aprobado; advertencia existente de tamaño del paquete |
| Descarga real | Chrome, octubre 2026, todas las sucursales | Archivo XLSX generado |
| Contenido del XLSX frente a base staging | Inspección de XML del archivo descargado y consulta agregada independiente | Centro 14, Norte 13, Sur 13 entregados; un cancelado en cada sucursal; cero pendientes |
| Pago mixto | XLSX Centro: efectivo 12.000, transferencia 8.000 | Correcto |

No se disponía del informe original con diferencia reportada ni de su fecha/sucursal. Se corrigen las inconsistencias demostradas del código y se aplica la definición confirmada; no se acredita que el caso original solo tuviera esta causa. Se verificó contenido y estilos del XLSX; no se abrió en la aplicación de escritorio Excel. Producción sin modificaciones.

## Aclaración posterior: retiros en cero

El usuario especificó que RETIROS salía en cero y que no conciliaba con despachos. Se encontró una causa adicional: el formulario crea los pedidos locales con tipo `local`, mientras el informe solo contaba `retiro`. Se corrige RETIROS para incluir ambos nombres y DESPACHOS para incluir `despacho` y `delivery`. Se agrega PUERTA al final, sin mover las columnas existentes. La conciliación es PEDIDOS = RETIROS + DESPACHOS + UBER + RAPPI + PUERTA, siempre solo entregados. También se reconoce `delivery` para el importe cobrado por despacho. Una regresión cubre los siete tipos, pendientes y cancelados, y verifica la igualdad de la suma.

## Correcciones y aceptación del 5 de octubre de 2026

Esta actualización sustituye las definiciones anteriores de RETIROS y EFECTIVO:

- RETIROS incluye pedidos entregados de tipo local, retiro y puerta. PUERTA se conserva como desglose incluido en RETIROS. La conciliación vigente es PEDIDOS = RETIROS + DESPACHOS + UBER + RAPPI, sin sumar PUERTA nuevamente.
- EFECTIVO es el neto de ventas en efectivo menos gastos en efectivo y el total completo de pagos realizados a despachadores, incluidos bonos. Se excluyen los registros de ingreso de caja chica de los gastos; no se agrega el fondo de caja chica al resultado. Los saldos negativos se conservan.
- EFECTIVO TOTAL CAJA es el efectivo bruto ingresado por ventas, antes de descontar egresos y sin agregar caja chica.

Ambas correcciones se publicaron en el portal de producción con autorización explícita. Publicaciones Vercel: `dpl_4aun4GuufcmWX9vMKpbykMMQU1on` (retiros) y `dpl_9xERxa3vnN6PrVgRjkyqDGN9ivVi` (efectivo). La última entrega el paquete `index-C-7uSOvU.js`; página y paquete comprobados con HTTP 200. Las ocho pruebas de exportación, lint de los archivos afectados y compilaciones de staging y producción pasaron. No se modificaron datos operativos ni se publicó un instalador nuevo.

El usuario confirmó que el reporte de contabilidad quedó bien y pidió eliminar su validación de los pendientes. Estado: aceptado por el usuario y cerrado; la actualización de escritorio permanece pendiente.
