# Preparación DLITRO 0.2.7

## Preparado

- tauri.conf.json actualizado de 0.2.6 a 0.2.7.
- 101 pruebas frontend en 19 archivos pasan. TypeScript y diff-check correctos. Compilación de producción correcta; advertencia existente de tamaño del paquete.
- Instalador NSIS Windows x64 generado y firmado en `.local/release-0.2.7/dlitro_0.2.7_x64-setup.exe`, junto a `.sig`, latest.json y RELEASE_NOTES.md.
- SHA256 del instalador: `8C9135C7D83559CB74D7FD8A2516D7B12EB06EA55C91FFB52B300D64060AB53F`.
- La clave pública de firma coincide con la del updater configurado. El manifiesto coincide con versión y firma del artefacto.
- latest.json previo conservado en `.local/release-0.2.7/latest.previous.json`. El manifiesto nuevo aún no está publicado en GitHub Releases; no se activa autoactualización.
- Build web de producción preparado en `.local/release-web/.vercel/output`, con rutas SPA y enlace al proyecto Vercel existente. Solo contiene el bundle público compilado, sin datos demo ni secretos de servidor.
- Clave pública de Maps de producción recuperada de la configuración del checkout principal; `.env.production` local valida. No se imprime ni se versiona el valor. Restricciones de dominio de Google no comprobadas en sitio actualizado todavía.

## Backend de producción aplicado con autorización explícita

Proyecto: `uwymxjmyasnlmkitzvej`.

| Migración | Versión remota producción |
| --- | --- |
| order_audit_owner_role | 20261004235625 |
| order_audit_server_history | 20261004235634 |
| order_audit_dashboard | 20261004235640 |

Se actualizó crear-usuario a versión 6 en producción. Mantiene validación de autenticación dentro del cuerpo (getUser) y autorización del rol, con verify_jwt=false por compatibilidad con el flujo existente. No se crearon cuentas de demostración o del dueño en producción. El usuario Bryan Boza permanece solo en staging.

La comprobación READ ONLY en producción confirmó RPC de superadmin, prohibición de escritura directa al log y denegación de auditoría a contabilidad. Las suites de historial y dashboard se repitieron en staging y pasan, con fixtures revertidos. La política de lectura de precios de trabajador ya existe en producción y no se aplicó de nuevo.

Las versiones de migraciones de producción difieren de las locales/staging porque apply_migration asigna el timestamp remoto. No se reescribió el historial aplicado; considerar equivalencia por contenido al sincronizar entornos.

## Web publicada en producción

Proyecto `dlitro-portal-interno`, id `prj_AXOFRBDEGnZUhfN2394XYtyhRkiu`, equipo `team_QkQWNlMnugHYHfXDuqbdUJVP` (magik1). Sitio existente: https://dlitro-portal-interno.vercel.app.

La CLI de Vercel informa sesión local `bryanmartinmbc56-2464`; la publicación prebuilt --prod devolvió Not authorized. No se reemplazó la web actual.

La revisión automática rechazó iniciar otro login sin autorización de una cuenta concreta. Se solicitó al usuario autorización y correo de la cuenta administradora del equipo; no se solicitan contraseñas. No se intentó eludir el rechazo ni extraer credenciales del conector.

El usuario autorizó la cuenta bryanmartin.mbc56@gmail.com y completó el inicio de sesión oficial de Vercel. Se publicó el bundle preparado con prebuilt --prod en el proyecto existente.

- Despliegue: `dpl_qy8Un9p8T598fYJqiRgVEZS93QQW`, estado READY, destino production.
- Dirección habitual actualizada: https://dlitro-portal-interno.vercel.app.
- Despliegue: https://dlitro-portal-interno-c3yr61o0l-magik1.vercel.app.
- Comprobación HTTP: `/`, `/contador` y `/admin/auditoria` responden 200 con el bundle nuevo `index-CWdz_6LP.js`.
- Asset publicado: HTTP 200, referencia al backend de producción presente y referencia a staging ausente.
- Se abrió el portal y se comprobó visualmente la pantalla de acceso. Captura: `.local/audit/portal-produccion-0.2.7.png`.

No se comprobó la interfaz con una sesión autenticada de producción. Queda pendiente la revisión visual de Caja por día por contabilidad y de Auditoría por superadmin en el portal actualizado. Las comprobaciones anteriores del backend y de staging siguen siendo la evidencia de permisos y comportamiento.

El instalador y el manifiesto están preparados; no se creó release de GitHub ni se activó la actualización automática de escritorio. No se hizo commit/push durante esta preparación.
