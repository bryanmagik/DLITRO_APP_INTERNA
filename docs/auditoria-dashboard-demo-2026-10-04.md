# Muestra del dashboard de auditoría

Carga solicitada por el usuario y aplicada exclusivamente en staging `suscxwjloggmbsqdlgpj` el 4 de octubre de 2026. Producción no modificada.

Archivos: `supabase/seeds/audit_dashboard_demo.sql` y `supabase/seeds/audit_dashboard_demo_cleanup.sql`. Los prefijos de UUID d410/d420/d430/d450 están reservados en estos archivos para esta muestra. La carga impide duplicación.

- Tres sucursales: DEMO Auditoría Centro, Norte y Sur.
- Seis perfiles ficticios DEMO: tres tomadores y tres despachadores. Inactivos, sin contraseñas ni identidades de autenticación. Ningún perfil superadmin nuevo.
- Tres turnos ficticios cerrados.
- 42 pedidos ficticios durante los siete días hasta el 4 de octubre, marcados en cliente y notas. No representan ventas/pagos reales; no se insertaron pagos, productos, movimientos de inventario o caja.
- 126 cambios ficticios y 42 eventos de creación. Instantáneas de muestra con nombres DEMO, marcadas como históricas para no simular cobertura de captura automática ni atribuir acciones a trabajadores reales.

Resultados de la muestra: Camila Rojas 70 cambios, Diego Soto 42, Valentina Pérez 14; Mateo Silva 62 jarros, Lucas Torres 44, Antonia Díaz 17, además de 12 sin despachador asignado. Tres pedidos sin cantidad de jarros. 31 promociones en 39 pedidos entregados; tres cancelados excluidos de promociones y jarros. Los datos previos del laboratorio se suman al seleccionar todas las sucursales.

La carga fue probada con rollback antes de persistir y verificada mediante el resumen del servidor después de confirmar. El script de retirada verifica las etiquetas DEMO y elimina exclusivamente la muestra; debe ejecutarse solo cuando el usuario solicite retirarla. Es necesario retirar también la evidencia ficticia retenida tras eliminar estos pedidos, conservando los registros reales. La retirada se comprueba en una transacción revertida; los datos permanecen disponibles para la demostración.
