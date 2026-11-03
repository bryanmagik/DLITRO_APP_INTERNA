# Auditoría para contabilidad — 15 de octubre de 2026

## Estado
Implementado y validado en staging (suscxwjloggmbsqdlgpj) y publicado en producción (uwymxjmyasnlmkitzvej).
La revisión automática rechazó inicialmente el despliegue por exigir autorización explícita de publicación. No se intentó otro mecanismo. El usuario autorizó después «si vamos nomas con eso» y se completó la publicación.

## Alcance preparado
El perfil contador_rrhh obtiene el enlace Panel de Auditoría en el menú, acceso a las rutas existentes /auditoria y /admin/auditoria, Resumen e Historial de pedidos con sus filtros y detalle completo.
La pestaña antigua Registros de despacho sigue reservada a superadmin.
Se amplía únicamente la lista de roles autorizados en private.can_read_order_audit y la validación de resumen_auditoria_pedidos. Las agregaciones, filtros, fechas, RLS y permisos de escritura permanecen como estaban.
El dueño conserva su acceso anterior al historial; no se le habilita el resumen.
No se concede rol de administrador ni modificación de pedidos, usuarios o evidencia. Los permisos existentes de contabilidad para caja y otros módulos se conservan.

## Evidencia
Las definiciones de las dos funciones coincidían exactamente entre staging y producción antes del cambio.
Suite SQL accountant_order_audit_read: PASS con diez roles, consulta de opciones/resumen/lista/eventos/detalle completo para contabilidad, denegación a roles no autorizados y anon, sin nuevos permisos operativos.
Regresiones order_audit_server_history y order_audit_dlitro_journey_cards: PASS en staging, transacciones revertidas.
Frontend: 11 pruebas aprobadas en AuditoriaDespachosPage, AuditoriaResumen y OrderAuditCards. La prueba nueva confirma Resumen como entrada para contabilidad y consulta del historial.
TypeScript y ESLint de los archivos cambiados: PASS. Compilación producción: PASS; advertencia existente por tamaño del bundle.
El primer intento de pruebas tuvo un fallo de archivos temporales del entorno. La ejecución con un trabajador y TEMP dentro del workspace pasó.
Advisors staging: advertencias existentes sobre once funciones SECURITY DEFINER y protección de contraseñas; sin nuevos objetos, privilegios ni hallazgos de RLS.

## Paquete revisable
Se recompiló la base deshaciendo en memoria exclusivamente los tres cambios de esta solicitud.
Su JavaScript index-DKy-gyVO.js coincide por SHA-256 con el paquete publicado conservado en .local/release-web-accountant-dispatcher-names.
La nueva compilación contiene index-BoLEv-aq.js y está preparada en .local/accountant-audit-release/.vercel/output.
Destino verificado por conector: proyecto dlitro-portal-interno (prj_AXOFRBDEGnZUhfN2394XYtyhRkiu), equipo magik1 (team_QkQWNlMnugHYHfXDuqbdUJVP).
Alias actual https://dlitro-portal-interno.vercel.app; despliegue previo READY dpl_AQaUbKnyJnB1FHgjeCcGdkQsYwcM.
No hay commit/push ni instalador de escritorio nuevo. No se comprobó aún la pantalla con sesión real de contabilidad.

## Migración
Staging: versión remota/local 20261016012927_accountant_order_audit_read.sql.
Se utilizó la versión generada por el servidor: la CLI encontrada falla antes de mostrar ayuda porque intenta escribir telemetría fuera del workspace. No se inventó ni reescribió historial.

## Publicación completada
Migración de producción 20261016013720_accountant_order_audit_read, equivalente por contenido a staging/local; no se reescribió historial.
Consultas READ ONLY en producción: contabilidad consulta resumen, opciones, lista, eventos y detalle completo; no obtiene orders.update, orders.delete ni users.manage. Los roles no autorizados y anon siguen denegados. Los roles sin usuario activo en producción se omiten explícitamente de la matriz; los diez roles se probaron en staging.
Despliegue dpl_2U2pUieM7FU6uyNHKSaU2iMUW7nT READY, producción, promovido al proyecto dlitro-portal-interno. URL de despliegue https://dlitro-portal-interno-ki3rlrrbe-magik1.vercel.app.
Alias habitual https://dlitro-portal-interno.vercel.app comprobado: /, /auditoria, /admin/auditoria y /contador responden 200 y referencian index-BoLEv-aq.js.
El archivo publicado coincide por SHA-256 con el validado: e50395b94b825bbe8ca9abd17233b8b1c4cdffa35d7236aafdfaf02c58aee442. Contiene el backend de producción y no contiene el de staging.
No se modificaron registros operativos ni se distribuyó un instalador de escritorio. La comprobación visual con una sesión real de contabilidad queda pendiente; las pruebas de componentes y del servidor sí pasaron.

## Reversión
Para revertir: restituir exclusivamente las listas de roles anteriores en ambas funciones y promover el despliegue web previo; conservar todos los registros de auditoría.

