# Corrección de sucursales históricas en auditoría

## Causa y alcance

En producción se detectaron 116 eventos históricos sin sucursal_id ni sucursal_nombre. Todos conservaban pedido_id y un pedido actual con sucursal. La consulta anterior agrupaba esos eventos como «Sucursal no registrada» y los excluía al filtrar por sucursal.

## Corrección publicada

La migración `20261005001646_order_audit_historical_branch_resolution.sql` añade una función privada de resolución y sustituye las dos consultas de lectura. Si el evento histórico no contiene sucursal, se consulta la del pedido actual y se marca como recuperada. El resumen y el historial filtran por la misma asociación. La sucursal y el nombre originales prevalecen cuando están registrados. Los eventos modernos sin sucursal y los históricos sin pedido permanecen sin identificar.

No se actualizan filas de pedidos ni del historial. La asociación recuperada puede cambiar si el pedido se traslada de sucursal; no constituye evidencia de la sucursal al momento del evento. El panel explica esa limitación y muestra el conteo recuperado por sucursal. Los eventos sin identificar se informan fuera del ranking y siguen incluidos en el total.

La función auxiliar no se concede a roles públicos ni authenticated. Se conservan las comprobaciones de rol de cada consulta: resumen exclusivo de superadmin; historial para superadmin y dueño.

## Validación

- Migración aplicada primero a staging y después a producción.
- Suite SQL nueva, con fixtures revertidos: 205 eventos históricos, filtros de resumen e historial, conservación de sucursal original distinta del pedido actual, huérfanos, eventos modernos sin sucursal, acceso al helper y denegación de roles no autorizados. PASS.
- 13 pruebas frontend de auditoría pasan; TypeScript, lint de archivos afectados y compilación de producción correctos.
- En producción, consultas independientes verificaron total de cambios, agrupación por sucursal, jarros y promociones. No se escribieron datos operativos para probar.
- Denegación de resumen para contabilidad y de acceso al helper confirmada en producción.
- Vercel READY: `dpl_84DYZokxTVvMPPwt4q6WD1TQ1pKM`; alias https://dlitro-portal-interno.vercel.app. Ruta de auditoría HTTP 200 con bundle `index-B-NpWJi-.js`.
- Se recargó la sesión real de superadmin en Chrome y se comprobó el ranking y la navegación al historial de Cerro Navia, incluidos los eventos recuperados.

Para 05-09-2026 a 04-10-2026, la captura mostró 34 cambios: Cerro Navia 12 (7 recuperados), San Joaquín 12, San Bernardo 10 (8 recuperados), sin cambios de sucursal no identificada. Estos valores son una instantánea y aumentan con actividad real. Captura: `.local/audit/auditoria-sucursales-produccion-corregida.png`.

La advertencia existente del tamaño del bundle permanece. El instalador de escritorio preparado anteriormente aún no incluye esta nueva presentación; regenerarlo antes de publicar la actualización de escritorio.

## Contador histórico relacionado corregido

El contador de «Pedidos con modificaciones» del historial excluía eventos antiguos con tipo_evento nulo. La migración adicional `20261005002626_order_audit_legacy_modified_count.sql` los incluye sin alterar la clasificación de creaciones y cancelaciones. Se probó en staging con los 205 eventos históricos sin tipo, todos correspondientes a un solo pedido; no se duplicó el conteo. Aplicada después en producción: una nueva consulta mostró 14 eventos y 8 pedidos modificados en Cerro Navia, por actividad posterior a la captura. El contador pasó una comparación con un conteo independiente en la misma transacción READ ONLY. No se escriben filas operativas.
