# DLITRO — Instrucciones para Claude Code

App interna multi-sucursal de DLITRO (delivery de bebidas): pedidos, cocina, despacho, turnos, caja, inventario y logística. Es un sistema real: los cambios afectan pedidos, stock y dinero.

Contexto de negocio y producto (no operativo) en [`docs/contexto/`](#contexto-de-negocio-docscontexto).

## Stack

- **Frontend:** React + TypeScript, Vite, Tailwind, shadcn/ui (Radix), TanStack Query, Zustand, React Hook Form + Zod.
- **Escritorio:** Tauri (`src-tauri/`), releases vía GitHub.
- **Backend:** Supabase — PostgreSQL, RLS, funciones/triggers, RPC, Edge Functions (Deno, `supabase/functions/`).
- **Tests:** Vitest (`*.test.ts(x)` junto al código) y suite SQL en `supabase/tests/`.

## Comandos

| Comando | Uso |
| --- | --- |
| `npm run dev:staging` | Dev server contra staging. Corre antes `verify:staging-env`. |
| `npm test` | Vitest (una pasada). `npm run test:watch` para modo watch. |
| `npm run lint` | ESLint. |
| `npm run build:staging` | Build contra staging (con verificación de entorno). |
| `npm run build:production` | Build de producción. **Solo con confirmación explícita.** |

- No usar `npm run dev` ni `npm run build` a secas: cargan `.env`, no `.env.staging`.
- Antes de dar un cambio por bueno: `npm run lint` y `npm test`.

## Ambientes

| Ambiente | Supabase ref | Carpeta / rama |
| --- | --- | --- |
| **Staging** | `suscxwjloggmbsqdlgpj` (Preview Branch `staging-security`) | `DLITRO-STAGING` / `staging/security-hardening` |
| **Producción** | `uwymxjmyasnlmkitzvej` (DLITRO ULTIMATE) | `DLITRO` / `main` |

- Staging es el ambiente por defecto para desarrollo, migraciones, pruebas de RLS y QA.
- Antes de cualquier operación sobre la base de datos, confirmar a qué ref apunta. No asumir que staging y producción tienen los mismos datos, políticas, funciones o secretos.
- Detalle del flujo seguro y comprobaciones Git: [`STAGING.md`](STAGING.md).
- `.env*` con valores reales nunca se commitean. El frontend solo usa `VITE_SUPABASE_PUBLISHABLE_KEY`; jamás `service_role` ni secret keys en variables `VITE_*`.

## Seguridad de producción (obligatorio)

Nunca sin confirmación explícita del usuario en el chat, para esa acción concreta:

- Aplicar migraciones o ejecutar SQL que escriba en producción (`uwymxjmyasnlmkitzvej`).
- Ejecutar `npm run build:production` o desplegar/publicar a producción.
- Desplegar Edge Functions o cambiar RLS, auth o secretos en producción.

Además:

- "Funciona en staging" **no** es autorización para pasar a producción. Son decisiones distintas.
- Flujo: implementar → staging → tests → revisión de seguridad → plan para producción → **confirmación** → producción.
- Nunca `DROP TABLE`, `TRUNCATE` ni `DELETE`/`UPDATE` masivos sin antes previsualizar con `SELECT`, tener plan de rollback y confirmar el ambiente.
- La suite `supabase/tests/` se corre solo contra staging, nunca contra producción.
- No modificar datos de producción para simplificar el desarrollo.
- Los parches de emergencia aplicados en producción viven en `supabase/migrations_production_emergency/`, cada uno con su `_ROLLBACK.sql`.

## Pedidos: ciclo de estados

Enum `public.estado_pedido`:

```text
tomado → en_preparacion → listo → en_despacho → entregado
                                              ↘ cancelado
```

Reglas de edición (aplicadas por triggers en la BD, no solo en la UI — ver `private.guard_pedido_update_v2` y `private.guard_pedido_items_lifecycle_v2`, migración `20260817164101_order_modification_lifecycle_rule.sql`):

- **`tomado` / `en_preparacion` / `listo`:** el pedido y su comanda (`pedido_items`) se pueden modificar.
- **Revisión de cocina:** si se modifica la comanda de un pedido `listo`, vuelve automáticamente a `en_preparacion`, se marca `requiere_revision_cocina = true` y queda registrado en `log_cambios_pedido`. El flag se limpia cuando cocina lo vuelve a marcar `listo`.
- **`en_despacho`:** la comanda queda congelada. La fila `pedidos` sigue editable (pago, jarros, descuento, despachador, dirección) porque la entrega se concilia en ese estado.
- **`entregado` / `cancelado`:** bloqueados para todos excepto `admin`/`superadmin`.
- **Correcciones post-entrega:** solo vía RPC auditadas (método/composición de pago y notas). Los pagos de un pedido `entregado` están protegidos por trigger; no editar `pagos_turno` directo.
- `preparador` solo puede cambiar el estado operativo, y únicamente entre `en_preparacion` y `listo`.
- `log_cambios_pedido` es append-only: solo lo escriben triggers de confianza.

Al tocar cualquier parte del ciclo, revisar efectos aguas abajo: caja/turno, pagos, stock, auditoría, cancelación, doble ejecución y fallos parciales.

## Roles y autorización

Enum `public.rol_usuario`: `superadmin`, `admin`, `encargado`, `tomador_pedidos`, `preparador`, `despachador`, `jefe_bodega`, `contador_rrhh`, `logistica`, `dueno_dlitro`.

- Jerarquía: `superadmin` ≥ `admin` > `encargado` > roles operativos. `dueno_dlitro` es solo lectura, sin permisos operativos.
- Los permisos viven en `private.role_permissions` y se aplican con políticas `_v2` y helpers (`private.current_app_role()`, etc.). Matriz derivada: [`supabase/tests/PERMISSIONS_MATRIX.md`](supabase/tests/PERMISSIONS_MATRIX.md).
- **La autorización se valida en el backend (RLS, triggers, RPC `SECURITY DEFINER`).** Ocultar botones o rutas en el frontend no es seguridad.
- Alcance por sucursal: un usuario de la sucursal A no accede a la B salvo permiso explícito. Considerar siempre IDOR y escalamiento de privilegios.
- Sucursales propias y franquicias pueden tener reglas distintas; no asumir comportamiento idéntico. Transferencia de inventario ≠ venta a franquicia.
- Funciones `SECURITY DEFINER`: `set search_path = ''`, nombres calificados, y `revoke ... from public, anon, authenticated` cuando no deban llamarse directo.

## Migraciones

- Viven en `supabase/migrations/`, con nombre `YYYYMMDDHHMMSS_descripcion_en_snake_case.sql`.
- **Nunca editar una migración ya aplicada** a un ambiente compartido: los cambios van en una migración nueva.
- Antes de escribir una, revisar las existentes y seguir sus patrones (helpers de autorización, políticas `_v2`, guards en el schema `private`).
- Preferir migraciones idempotentes y repetibles (`if not exists`, `create or replace`, `drop policy if exists`).
- Encabezar con un comentario: regla de negocio, por qué, y decisiones tomadas.
- Invariantes en la BD (constraints, triggers), no solo en el frontend. Dinero en `numeric` o enteros, nunca float.
- Aplicar primero en staging (`suscxwjloggmbsqdlgpj`), apuntando explícitamente al ref, sin depender del link local.
- `supabase/migrations_archive/` es histórico: no tocar.

## Tests SQL (`supabase/tests/`)

- Cada archivo es autocontenido y transaccional: `begin;` … `rollback;`. No deja datos.
- Encabezado `-- STAGING only.` Datos 100 % sintéticos: UUIDs fijos con prefijo propio por archivo, emails `@test.local`.
- El nombre del archivo indica el tema o la migración que valida (p. ej. `order_audit_dashboard.sql`).
- Probar lo permitido **y** lo prohibido: rol sin permiso, otra sucursal, `anon`, estados bloqueados.
- Resultados de corridas en `supabase/tests/results/` (`<test>_result.json` / `.txt`).
- Un cambio de RLS, trigger o RPC no está terminado hasta que la suite relevante pasa en staging.
- Para bugs de lógica de negocio, agregar test de regresión (Vitest o SQL) cuando sea razonable.

## Dominios de alto riesgo

Inventario, caja, pagos, pedidos, promociones, precios, migraciones, RLS, triggers, auth y transacciones con franquicias. Preguntarse siempre:

- ¿Qué pasa si falla a mitad? ¿Puede ejecutarse dos veces? ¿Es idempotente?
- ¿Requests concurrentes generan inconsistencias? ¿El stock puede quedar negativo? ¿Se puede contar dinero dos veces?
- ¿Un usuario puede manipular el request o ver otra sucursal? ¿Queda traza de auditoría? ¿Hay rollback?

## Forma de trabajo

- Inspeccionar antes de cambiar: buscar componentes, hooks, servicios y funciones SQL existentes antes de crear nuevos.
- Cambio mínimo y seguro; no expandir el alcance. Los problemas ajenos a la tarea se mencionan, no se reescriben.
- No agregar dependencias sin justificarlo.
- Sin secretos hardcodeados ni logs con datos sensibles (tokens, contraseñas, datos completos de clientes).
- Prioridad ante conflictos: seguridad → integridad de datos → corrección → mantenibilidad → UX → performance → velocidad.
- Bugs de QA manual: reproducir → rastrear → causa raíz → impacto → fix → test → regresión.
- Antes de implementar algo significativo: qué encontré, qué voy a cambiar, archivos y riesgos. Al terminar: qué cambió, qué se verificó y qué queda por verificar a mano. No ocultar incertidumbre.

## Contexto de negocio (`docs/contexto/`)

Leer el archivo pertinente antes de cambios en esa área. Estos documentos agregan detalle, pero nunca debilitan las reglas de este archivo (producción, seguridad, autorización, integridad, tests).

- [`vision-y-producto.md`](docs/contexto/vision-y-producto.md) — identidad, problemas que resuelve, filosofía (mapear → reparar → asegurar → escalar), módulos.
- [`sucursales-y-franquicias.md`](docs/contexto/sucursales-y-franquicias.md) — propias vs. franquicia, venta logística, costo/margen/markup.
- [`plataforma-cliente.md`](docs/contexto/plataforma-cliente.md) — salir de WhatsApp, pedidos web, plataforma de clientes.
- [`roles-e-interfaces.md`](docs/contexto/roles-e-interfaces.md) — qué necesita ver cada rol.
- [`asistente-ia.md`](docs/contexto/asistente-ia.md) — asistente de IA y sus límites de acceso.
- [`comercial.md`](docs/contexto/comercial.md) — precios y estrategia comercial.
- [`seguridad-y-datos.md`](docs/contexto/seguridad-y-datos.md) — versión extendida de ambientes, BD, RLS, inventario, pedidos y finanzas.
- [`ingenieria-y-calidad.md`](docs/contexto/ingenieria-y-calidad.md) — estándares de frontend/backend, testing, QA y definición de terminado.

Registros de cambios y auditorías por fecha: `docs/*.md`.
