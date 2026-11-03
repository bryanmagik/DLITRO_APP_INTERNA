# Auditoría por jornada DLITRO y tarjetas de pedidos

## Problema confirmado

El resumen anterior agrupaba por la fecha calendario del evento. Una lectura de producción el 5 de octubre, antes de abrir turnos nuevos, encontró 47 cambios entre las 00:01 y las 01:56 correspondientes a turnos del 4 de octubre: San Bernardo 27, San Joaquín 12 y Cerro Navia 8. No había turnos con fecha_dlitro del 5. No se modificaron datos de producción.

El usuario confirmó el cambio a jornada DLITRO y solicitó agrupar el historial por jornada, con una tarjeta por pedido que se despliega para mostrar todos sus movimientos.

## Implementación

- La jornada proviene de turnos.fecha_dlitro, dando prioridad al turno registrado en la evidencia. Si no existe ese dato, se recupera el turno actual del pedido. Si tampoco tiene fecha, se calcula desde la hora del evento con el corte existente de las 06:00 de America/Santiago.
- El resumen conserva su firma RPC y selecciona jornadas usando las fechas de Chile de sus límites (fin exclusivo). Cambios, rankings y agrupación diaria usan la jornada; los pedidos entregados, jarros y promociones usan la jornada de su turno. Una corrección posterior queda atribuida a la jornada original. Los filtros ya no representan el momento calendario de la acción.
- listar_pedidos_auditoria recibe fechas date inclusivas y pagina 50 tarjetas. Agrupa por UUID de pedido y jornada, preservando pedidos diferentes con el mismo número. Eventos sin referencia mantienen una tarjeta por evento. Los filtros de autor, acción, sucursal, turno y número se aplican antes de agrupar y paginar.
- historial_completo_pedido_auditoria reutiliza consultar_auditoria_pedidos dentro de una única función STABLE y una sola solicitud. Reúne todas sus páginas en la misma instantánea, evitando huecos causados por inserciones concurrentes entre llamadas del navegador. Conserva los permisos y la consulta antigua. [Garantía de instantánea de PostgreSQL](https://www.postgresql.org/docs/current/xfunc-volatility.html).
- OrderAuditCards reutiliza Accordion y conserva fecha/hora real, autor, sucursal, estado, valores anteriores/nuevos y motivo. Las tarjetas señalan jornadas recuperadas o estimadas. Al abrirlas muestran todos los movimientos del pedido, independientemente de los filtros usados para encontrarlo. Errores o respuestas incompletas se muestran como error, con reintento.
- El resumen enlaza cada jornada con su historial. La fecha inicial usa la regla existente getDlitroDay.

No se cambian escrituras operativas, RLS, inventario, pedidos, pagos, estados ni evidencias almacenadas. El resumen sigue exclusivo de superadmin; listado y detalle conservan acceso de superadmin y dueño.

## Validación

- 105 pruebas frontend aprobadas en 20 archivos. Tras el ajuste final de singular/plural, las tres pruebas de tarjetas volvieron a pasar; TypeScript y ESLint de archivos afectados aprobados.
- Compilación staging aprobada. Permanece la advertencia existente sobre tamaño del bundle.
- Nueva suite SQL aprobada primero con migración candidata revertida y después de aplicarla en staging. Incluye 51 pedidos y más de 211 eventos de un mismo pedido, madrugada, corrección posterior, corte 06:00, verano/invierno, filtros, paginación por tarjetas, lectura completa, jarros desconocidos y acceso denegado de trabajador/anon.
- Tres suites SQL anteriores de dashboard, sucursales históricas y desglose de jarros aprobadas con la candidata y rollback. Se ajustaron sus fixtures al nuevo contrato: jornadas de turno explícitas; el pedido fuera del período pertenece a otro turno cerrado. Las expectativas de negocio y restricciones se conservaron.
- Revisión visual del componente real con datos ficticios locales: resumen, tarjetas, apertura/cierre con teclado y móvil de 390 px. Sin desbordamiento horizontal; tamaño restaurado. Vista http://127.0.0.1:8085/. No corresponde a actividad real ni a un frontend publicado. Captura .local/audit/auditoria-jornada-tarjetas-2026-10-05.png.
- Revisión Supabase: advertencias de SECURITY DEFINER públicas, incluida listar_pedidos_auditoria. El acceso intencional está limitado en el cuerpo por can_read_order_audit; anon no tiene EXECUTE, helpers privados sin acceso público; denegaciones comprobadas. El wrapper completo usa SECURITY INVOKER. Advertencia existente adicional: protección de contraseñas filtradas desactivada; no se cambió Auth.

## Estado de despliegue

Migración 20261005125911_order_audit_dlitro_journey_cards aplicada solamente en staging suscxwjloggmbsqdlgpj y registrada con ese nombre/version. La aplicación fue una transacción que contiene exclusivamente esta migración y su registro; no incluyó otras versiones pendientes. La herramienta db push --dry-run reportó versiones históricas remotas con nombres distintos de los archivos locales. No se repararon ni eliminaron esas versiones.

El usuario autorizó la actualización de producción el 5 de octubre. Se aplicó exclusivamente 20261005125911 en uwymxjmyasnlmkitzvej, en transacción, verificando previamente la huella de la consulta existente. Copia anterior guardada en .local/audit-journey-production-rollback.sql. No se escribieron filas operativas ni se alteraron versiones históricas de migraciones.

Validación READ ONLY de producción aprobada: conteo independiente de la jornada 04-10-2026 igual al resumen (173 cambios), 214 eventos en el listado, tarjetas con jornada correcta, historial completo sin otros pedidos, aritmética de jarros y denegación de contabilidad/anon y helpers privados.

Frontend publicado en el proyecto Vercel existente dlitro-portal-interno, despliegue dpl_7Yt5MuBdn62tQHUsGqbrYXTxJvo4, estado READY, alias https://dlitro-portal-interno.vercel.app. Bundle index-5rQd0JLe.js. Ruta /admin/auditoria y asset HTTP 200; backend de producción presente, staging ausente, nuevos RPC presentes. Se publicó solo el bundle público compilado mediante prebuilt; no se subieron archivos de pruebas ni respaldos.

Comprobación visual con la sesión real de superadmin: resumen por jornada, enlace de 04-10-2026 al historial con ambos filtros de jornada, tarjeta Pedido 46 de San Bernardo y apertura de sus 7 movimientos. Su último movimiento del 05-10-2026 a las 01:56:20 queda bajo la jornada 04-10-2026. Captura .local/audit/auditoria-produccion-jornada-pedido46-2026-10-05.png. Portal abierto en esa tarjeta. No se generó ni publicó un nuevo instalador de escritorio.

## Reversión preparada

La publicación siguió el plan autorizado: comprobación de las definiciones actuales, respaldo, migración única, consultas de solo lectura y frontend con configuración de producción verificada. El despliegue anterior sigue disponible en Vercel para revertir la vista si fuera necesario.

La reversión restaura la función resumen de la migración anterior 20261005003908 y el frontend anterior. Las nuevas funciones de lectura pueden permanecer para evitar errores en clientes abiertos; no requieren borrar ni corregir datos operativos. La jornada recuperada del turno actual puede cambiar si un pedido histórico se traslada; el panel explica esa limitación. Si hay evidencia de un mismo pedido en distintos turnos/jornadas, se conserva una tarjeta por jornada; abrir cualquiera muestra el historial completo del UUID.
