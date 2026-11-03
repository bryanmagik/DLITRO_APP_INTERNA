# Mapa de sucursales — 16 de octubre de 2026

## Causa reproducida
El mapa consultaba public.sucursales con selección de ID, nombre, dirección y coordenadas.
RLS permite al tomador leer únicamente su sucursal. La consulta autenticada en producción devolvió solo Cerro Navia.
Los diez registros activos de sucursales en producción tienen coordenadas; uno se llama TEST. No se eliminaron ni clasificaron sucursales durante esta corrección.
No se amplió sucursales SELECT porque la tabla contiene clave_canje.

## Cambio
- private.dispatch_map_branches: helper STABLE SECURITY DEFINER con search_path vacío y autorización explícita. Acepta usuarios activos con orders.create y sucursal asignada, o branches.read.
- public.sucursales_mapa_despachos: RPC STABLE SECURITY INVOKER; sin EXECUTE para PUBLIC/anon.
- Entrega únicamente ID, nombre, dirección y coordenadas numéricas de sucursales activas con rangos válidos.
- MapaDespachos usa el RPC; mantiene el origen de rutas en la sucursal propia y los pedidos filtrados por turno y sucursal.
- El fallo de la consulta se informa en pantalla. Se limpian marcadores al vaciar el directorio.
- Nombre y dirección de los popups se escapan como texto. No se introduce HTML desde esos campos.
No cambian claves, políticas RLS, inventario, pedidos, tarifas ni datos financieros.

## Validación
Staging suscxwjloggmbsqdlgpj: migración 20261016033406_dispatch_map_branch_directory.sql aplicada.
Suite SQL transaccional: diez roles, directorio completo para lectores autorizados, inactivas/ubicaciones ausentes/invalidas excluidas, solo cinco campos, configuración completa de otras sucursales y pedidos ajenos inaccesibles para tomador, usuarios inexistentes y anon denegados. PASS; fixtures revertidos.
Tres pruebas frontend: marcadores propios/ajenos y contenido escapado, error del RPC y directorio vacío. PASS.
Regresión completa: 114 pruebas aprobadas en 21 archivos.
TypeScript, ESLint de los archivos afectados, diff-check y compilaciones de staging y producción: PASS. Advertencia existente por tamaño del bundle.
Advisors staging: advertencias existentes sobre once funciones SECURITY DEFINER y protección de contraseñas; ninguna función pública nueva con SECURITY DEFINER.
Documentación de funciones consultada mediante el conector: https://supabase.com/docs/guides/database/functions.
No se verificó aún el mapa con una sesión real de Google Maps ni se instaló una nueva aplicación en este equipo.

## Distribución
La última release de GitHub consultada es v0.2.6, publicada el 23 de septiembre de 2026.
0.2.7 ya estaba preparada localmente y todavía no publicada; esta entrega debe incluir mapa y auditoría para contabilidad.
Artefactos nuevos preparados bajo .local/release-0.2.7-map-accountant, conservando los artefactos previos de .local/release-0.2.7.
Instalador NSIS Windows x64 generado y firmado: dlitro_0.2.7_x64-setup.exe, 11.000.155 bytes.
SHA-256: 192647bb68eccec84e1abeadf8143cc40916c704ca62c22f6a0231c31f884acb.
Firma de actualización verificada criptográficamente con la clave pública configurada: PASS. Versión y firma de latest.json coinciden con el instalador: PASS.
El instalador previo y su firma se conservan en el directorio anterior. latest.json local fue regenerado y respaldado; no se publicó ni se activó la actualización automática.
Paquete web equivalente preparado en .local/release-web-map-accountant/.vercel/output con index-P3-zJcGH.js. Al recompilar sin los cambios del mapa, el bundle coincide por SHA-256 con index-BoLEv-aq.js de la publicación anterior de contabilidad. Solo esta corrección cambia respecto del portal publicado.
La compilación nativa terminó correctamente. El primer empaquetado no pudo descargar NSIS por la restricción de red; se repitió con acceso autorizado a la descarga oficial de Tauri y terminó correctamente. Se conserva la advertencia no bloqueante del enlazador de Windows.

## Producción pendiente
La revisión automática rechazó aplicar dispatch_map_branch_directory a producción: exige autorización explícita para esa nueva consulta de acceso.
No se intentó un mecanismo alternativo ni se cambiaron los datos de producción.
La versión de Windows depende del RPC. Aplicar y verificar el backend antes de distribuir el instalador o activar latest.json.
La auditoría para contabilidad ya está habilitada en el backend de producción desde la sesión anterior.

## Reversión
Revertir el cliente a la consulta previa y retirar exclusivamente ambos RPC/helper nuevos si se autoriza una reversión. No tocar registros ni ampliar las políticas existentes. La consulta previa volvería a mostrar únicamente la sucursal propia.

