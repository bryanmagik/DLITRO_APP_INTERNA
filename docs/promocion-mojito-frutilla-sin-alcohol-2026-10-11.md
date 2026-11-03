# Corrección de precio promocional en toma de pedidos

Fecha local: 11 de octubre de 2026. Autorización: el usuario pidió «necesito que arregles eso de inmediato».

## Diagnóstico confirmado en producción
Producto Mojito Frutilla S/A: catálogo $10.000, promoción de precio activa $8.000.
El rol tomador_pedidos tenía orders.create / orders.update y catalog.read, pero no promotions.read.
RLS devolvía cero promociones a ese rol. promociones_precio no estaba publicada en supabase_realtime.
NuevoPedidoTab ya consulta promociones activas y se suscribe a sus cambios.

## Corrección aplicada
- Política SELECT para promociones activas a usuarios con orders.create u orders.update.
- Política SELECT para promociones_precio a esos mismos usuarios; permite también filas inactivas para que Realtime entregue UPDATE al desactivar. El cliente sigue seleccionando solo activo=true.
- Publicación de promociones y promociones_precio en supabase_realtime, conservando las tablas existentes.
- No se otorgó promotions.manage ni se cambió una política de escritura.
- No se modificaron precios, pedidos, inventario, pagos ni usuarios. No hubo publicación de frontend.

La revisión automática rechazó inicialmente lectura de todas las filas en ambas tablas.
Se redujo el alcance a promociones_precio y se presentó evidencia de su esquema (ID, producto, precio anunciado, nombre, activo, fecha; sin costos, clientes o credenciales), de sus registros históricos y del patrón de precios_trabajador.
La alternativa fue aprobada; promociones conserva la condición activo=true.

## Validación
Staging suscxwjloggmbsqdlgpj: suite transaccional con fixtures revertidos.
Diez roles: superadmin, admin, encargado, tomador_pedidos, preparador, despachador, jefe_bodega, contador_rrhh, logistica y dueno_dlitro.
Cotización 10000 → 8000, lectura por rol, prohibición de INSERT / UPDATE / DELETE sin promotions.manage, anonimato bloqueado, visibilidad de desactivación y tablas publicadas: PASS.
Advisors: advertencias existentes de funciones SECURITY DEFINER y protección de contraseñas, sin hallazgos nuevos de RLS en estas tablas.

Producción uwymxjmyasnlmkitzvej: consulta READ ONLY con identidad de tomador activo confirmó catálogo 10000, promoción activa 8000 y promotions.manage=false.
Políticas y publicación comprobadas después del despliegue.
No se probó una sesión visual ni entrega de eventos WebSocket en producción. Para una pantalla abierta antes del cambio, recargar una vez al guardar o descartar el borrador actual.

## Historial
CLI Supabase no disponible y paquete no presente en caché; nombres locales usan las versiones generadas por el servidor, sin inventar timestamps ni reescribir historial.
Staging/local: 20261012014625 y 20261012014734.
Producción: 20261012015014 y 20261012015036, mismos cambios efectivos; diferencias de timestamp registradas.

## Reversión
Retirar únicamente promociones_order_entry_read_v1 y promociones_precio_order_entry_read_v1 si se autoriza una reversión.
En producción, promociones ya estaba publicada; solo promociones_precio fue añadida. No retirar publicaciones preexistentes.
La reversión restauraría el problema original. No altera registros operativos.

