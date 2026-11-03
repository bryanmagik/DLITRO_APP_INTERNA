# Caja por día: desglose de pagos y presentación

La consulta del detalle de un turno omitía `pagos_turno.pedido_id`. Se incorpora esa relación para mostrar los montos efectivamente registrados por método junto al pedido correspondiente, sumando registros repetidos y excluyendo pagos de otros pedidos o sin vínculo. La exportación de pedidos agrega columnas de efectivo, transferencia y tarjeta.

Un pedido mixto sin registros asociados muestra «Sin desglose registrado». No se reconstruyen importes a partir del total. Si la suma registrada difiere del pedido, se informa la diferencia.

El detalle diario presenta tarjetas de ingresos, gastos y diferencia de efectivo. La tabla de pedidos pasa de 17 a 7 columnas con productos, importes y datos adicionales desplegables mediante un botón accesible. Las notas del contador se mantienen editables según los permisos existentes, dentro de una sección desplegable. Se adapta el modal a pantallas pequeñas.

No hay migraciones, cambios de permisos ni escrituras de datos para esta mejora. Las fórmulas de ingresos, gastos, pagos a despachadores y cuadratura se conservan. El resumen bajo los filtros identifica explícitamente que sus ingresos corresponden a todo el turno.

## Validación

- 94 pruebas en 16 archivos pasan, incluidas cuatro pruebas del desglose (pagos mixtos, aislamiento entre pedidos, ausencia de registros y diferencia de importes con cero explícito).
- TypeScript, ESLint de los archivos afectados y compilación de staging correctos.
- Revisión con sesión superadmin en el cierre de prueba del 8 de septiembre de 2026: tres métodos registrados, detalle de productos y navegación entre pestañas.
- Revisión visual en escritorio y pantalla de 390 × 844. La tabla de pedidos conserva desplazamiento horizontal en móvil.
- Staging no contiene actualmente pedidos con método mixto; el caso mixto se verifica con pruebas automatizadas, sin crear pagos ficticios en la base.
- Producción no modificada.

## Ejemplo persistente solicitado después de la validación

Se creó en staging el pedido #15 «DEMO Pago mixto», en DEMO Auditoría Centro, turno del 4 de octubre de 2026. Total $20.000: efectivo $12.000 y transferencia $8.000. El seed `supabase/seeds/caja_mixta_demo.sql` conserva los identificadores exactos y evita duplicados. Se ensayó primero con rollback y después se verificó que los dos pagos suman el total. No se crearon ítems ni movimientos de stock. Son registros ficticios para visualizar la caja; no representan dinero recibido.

Pedido: `d4600000-0000-4000-8000-000000000001`. Pagos: `d4700000-0000-4000-8000-000000000001` y `d4700000-0000-4000-8000-000000000002`. Este ejemplo debe retirarse antes de ejecutar la limpieza de las sucursales demo de auditoría, cuando el usuario solicite retirar los ejemplos.
