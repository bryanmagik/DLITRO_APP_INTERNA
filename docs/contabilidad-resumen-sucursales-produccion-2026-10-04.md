# Tarjetas de Caja por día sin datos para contabilidad

El usuario confirmó que ocurre en app/portal diario y faltan nombres e importes. Se compararon permisos en ambos entornos usando consultas de solo lectura.

- Staging tiene branches.read y dispatcher_payments.read para contador_rrhh. Con la identidad QA de contador autenticada se leen tres turnos del 4 de octubre, tres nombres de sucursal y los pagos por 20.000 del ejemplo.
- Producción no tiene esos dos permisos. Su política sucursales_read_v2 requiere branches.read o la sucursal personal del usuario.
- Una transacción READ ONLY con el rol authenticated de un contador activo en producción, finalizada con ROLLBACK, comprobó el último día cerrado (3 de octubre): tres turnos, cero sucursales visibles y 413 pagos visibles de 413 esperados. La lectura de pagos no explica por sí sola los montos vacíos de la app instalada.
- Una prueba de componente reproduce la selección del día con contador_rrhh y verifica tarjetas de dos sucursales, ingreso combinado de 20.000, estado de revisión y sucursal sin pagos por cero. Pasa. TypeScript y ESLint correctos.

La migración preparada `20261002163235_accountant_cash_daily_read.sql` añade solo branches.read y dispatcher_payments.read. Está aplicada y validada en staging, con pruebas previas de lectura y denegación de gestión, y aislamiento de usuarios operativos. No debe ampliarse el permiso a superadmin ni habilitar gestión de sucursales o liquidaciones.

Producción no se modificó. Pendiente autorización para aplicar esa migración en producción y comprobación con sesión real de contabilidad en el portal diario. Tras ello, si siguen vacíos los importes, comprobar la versión desplegada y la petición del resumen, sin atribuirlo a la política de pagos ya validada.

## Aplicación autorizada en producción

El usuario autorizó explícitamente los dos permisos de lectura. Se aplicó `accountant_cash_daily_read` en producción, proyecto `uwymxjmyasnlmkitzvej`, con versión remota `20261004234943`. Solo se insertaron branches.read y dispatcher_payments.read para contador_rrhh, con ON CONFLICT DO NOTHING. No se modificaron políticas, funciones, usuarios individuales ni datos financieros.

La comprobación posterior READ ONLY con un contador activo y rol authenticated, finalizada con ROLLBACK, mostró para el 3 de octubre: tres turnos y tres sucursales visibles (antes cero sucursales), 413 pagos de 413 esperados y 14 liquidaciones de 14 esperadas. branches.manage y dispatcher_payments.manage permanecen false; no se asignó superadmin.

El mismo contenido tiene versión staging/local `20261002163235` y producción `20261004234943`, generada por apply_migration. No se reescribió historial aplicado. Considerar esta diferencia al sincronizar migraciones entre entornos.

## Estado actualizado: reporte aceptado por el usuario

El 5 de octubre de 2026, después de publicar las correcciones de la planilla, el usuario confirmó que el reporte de contabilidad quedó bien y solicitó retirarlo de los pendientes. Se cierra el pendiente de validación del reporte con esa confirmación del usuario. No representa una nueva revisión automatizada ni una validación de la actualización de escritorio, que sigue pendiente. Las publicaciones posteriores de la planilla están registradas en `excel-caja-conteo-pedidos-2026-10-04.md`.
