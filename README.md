# DLITRO

Aplicación interna de DLITRO para gestión operativa multi-sucursal: toma de pedidos, cocina, logística, turnos, caja e inventario. Este repositorio contiene la app interna (escritorio, vía Tauri, y web) y el backend en Supabase (Postgres, RLS, Edge Functions).

DLITRO opera un negocio de delivery de bebidas con múltiples sucursales (propias y franquicias). El objetivo del sistema es centralizar operaciones que hoy dependen de procesos manuales (WhatsApp, papel, planillas), mejorar la trazabilidad y reducir errores operativos.

## Stack tecnológico

- **Frontend**: React + TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix primitives), TanStack Query, Zustand, React Hook Form + Zod.
- **Desktop**: Tauri (empaquetado nativo, actualización automática vía GitHub Releases).
- **Backend**: Supabase (PostgreSQL, Row Level Security, PostgreSQL Functions/Triggers, Edge Functions en Deno).
- **Testing**: Vitest (frontend), suite de SQL propia para autorización/RLS (`supabase/tests/`).

## Arquitectura general

- El frontend nunca es la capa de autorización final. Toda regla de negocio sensible (permisos por rol, alcance por sucursal, estados de pedido) se aplica en la base de datos mediante RLS y triggers.
- Los roles operativos ven una interfaz distinta según su función (cocina, logística, encargado de sucursal, administración central, etc.), pero la interfaz es solo una capa de UX — el control de acceso real vive en Postgres.
- El estado de un pedido y sus reglas de transición (ver más abajo) se enforcen a nivel de trigger, no solo en el cliente.

## Estructura principal del repositorio

```
src/
  pages/            Páginas por rol (admin, encargado, preparador, turno, bodega, contador)
  components/       Componentes reutilizables de UI
  integrations/      Cliente e integraciones (Supabase, tipos generados)
  stores/           Estado global (Zustand)
  hooks/, lib/, services/, utils/

src-tauri/          Empaquetado de escritorio (Tauri)

supabase/
  migrations/       Migraciones SQL versionadas (schema, RLS, funciones, triggers)
  functions/        Edge Functions (Deno)
  tests/            Suite de validación de autorización/RLS (SQL, transaccional)

scripts/            Scripts de utilidad de desarrollo/release
```

## Requisitos de desarrollo

- Node.js (versión LTS reciente) y npm.
- Cuenta/acceso al proyecto Supabase correspondiente (staging para desarrollo).
- Supabase CLI (`npx supabase`) para trabajar con migraciones y tipos.
- Rust + toolchain de Tauri solo si se va a compilar la app de escritorio.

## Instalación local

```bash
npm install
cp .env.staging.example .env.staging   # completar con los valores reales del proyecto de staging
npm run dev:staging
```

`dev:staging` corre primero una verificación de entorno (`verify:staging-env`) que aborta si las variables no corresponden inequívocamente al proyecto de staging, evitando apuntar accidentalmente a producción.

## Variables de entorno

Definidas en `.env.staging` (no versionado). Solo se documentan los **nombres**; los valores se obtienen desde el panel del proyecto Supabase correspondiente y nunca se comparten en este repositorio:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_GOOGLE_MAPS_API_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PATH` (solo build de escritorio)
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (solo build de escritorio)

El frontend solo debe usar la clave pública (`VITE_SUPABASE_PUBLISHABLE_KEY`, tipo `anon`). Nunca debe agregarse una `service_role` key ni ningún secreto de servidor a una variable `VITE_*`, porque esas variables terminan embebidas en el bundle del cliente.

## Scripts disponibles

| Script | Descripción |
| --- | --- |
| `npm run dev:staging` | Desarrollo local apuntando a staging (con verificación de entorno previa) |
| `npm run build:staging` | Build de producción del frontend apuntando a staging |
| `npm run build` / `npm run build:dev` | Build genérico / modo desarrollo |
| `npm run lint` | ESLint sobre todo el proyecto |
| `npm test` / `npm run test:watch` | Suite de tests con Vitest |
| `npm run tauri` | Comandos de Tauri (empaquetado de escritorio) |
| `npm run verify:staging-env` | Verifica que las variables de entorno correspondan al ambiente de staging |
| `npm run release:manifest` | Genera el manifiesto de release para el auto-update |

## Supabase y sistema de migrations

El schema, las políticas de RLS, las funciones y los triggers viven como migraciones SQL versionadas en `supabase/migrations/`, nombradas con timestamp (`YYYYMMDDHHMMSS_descripcion.sql`). Convenciones:

- Nunca editar una migración que ya fue aplicada a un ambiente compartido — los cambios posteriores van en una migración **nueva**.
- Antes de escribir una migración, revisar las existentes para seguir los patrones ya establecidos (helpers de autorización, convenciones de nombres de policies, etc.).
- Las migraciones se aplican con `supabase db push` apuntando explícitamente al proyecto correcto (nunca dependiendo únicamente del estado de link local).

## Ambientes

El proyecto trabaja con dos ambientes conceptuales:

- **Producción**: el proyecto Supabase principal, usado por la app real.
- **Staging**: un ambiente de branching de Supabase dedicado a desarrollo, QA y validación de cambios de seguridad/RLS antes de que lleguen a producción.

Los identificadores concretos de cada proyecto (refs, URLs, claves) no se documentan en este README por diseño — se gestionan de forma privada por el equipo. Ningún flujo de desarrollo debe ejecutar migraciones ni pruebas contra producción sin autorización explícita.

## Sistema de roles

El acceso está basado en roles operativos (además de autenticación), aplicados vía Postgres RLS. A grandes rasgos:

- **Administración** (admin/superadmin): control multi-sucursal y configuración global.
- **Encargado de sucursal**: gestión operativa de su propia sucursal (personal, turnos, caja, stock).
- **Tomador de pedidos**: registra pedidos durante un turno.
- **Preparador (cocina)**: visualiza y avanza pedidos en preparación.
- **Despachador**: entrega pedidos asignados.
- **Logística / Jefe de bodega**: inventario central y distribución entre sucursales.
- **Contador / RRHH**: información de caja, gastos y asistencia.

Los permisos concretos de cada rol viven en la base de datos (no se detallan aquí); la interfaz de cada rol es una vista adaptada, pero la autorización real siempre se valida en el backend.

## Flujo general de pedidos

Un pedido recorre los siguientes estados reales:

```
tomado → en_preparacion → listo → en_despacho → entregado
                                              ↘ cancelado
```

- **`tomado`**, **`en_preparacion`** y **`listo`**: el pedido puede modificarse (productos, cantidades, datos del cliente, etc.).
- **`en_despacho`**: la comanda (productos del pedido) queda congelada; el resto del pedido (datos logísticos, pago, despachador asignado) sigue pudiendo ajustarse como parte de la confirmación de entrega.
- **`entregado`** y **`cancelado`**: el pedido queda bloqueado para modificación por los roles operativos normales; solo administración conserva una vía de corrección auditada para casos excepcionales.

**Regla de revisión de cocina**: si un pedido en estado `listo` recibe una modificación operacional válida (por ejemplo, se agrega o quita un producto), el pedido vuelve automáticamente a `en_preparacion` para que cocina lo revise y prepare de nuevo. Esto queda señalizado visualmente en la pantalla de cocina y registrado en el historial de cambios del pedido.

## Testing

- **Frontend**: `npm test` (Vitest).
- **Autorización / RLS**: `supabase/tests/` contiene una suite de SQL autocontenida y transaccional (cada archivo abre una transacción y termina en `ROLLBACK`, por lo que no deja datos persistentes). Cubre la matriz de permisos por rol, acceso anónimo, funciones RPC/`SECURITY DEFINER`, y los triggers de negocio (guards). Se ejecuta contra el ambiente de staging, nunca contra producción.

## Seguridad y RLS (nivel general)

- Row Level Security está habilitado en las tablas de negocio relevantes; el acceso se resuelve por rol, permiso y alcance de sucursal.
- La autorización del frontend (ocultar botones, rutas protegidas) es solo una mejora de experiencia — nunca el mecanismo de seguridad real.
- Cambios a políticas de RLS, funciones `SECURITY DEFINER` o triggers de autorización se consideran de alto riesgo y requieren validación en staging antes de cualquier despliegue a producción.
- No se documentan aquí las reglas de autorización completas ni los detalles internos de las Edge Functions, por tratarse de información operativa sensible.

## Contribución / flujo de desarrollo

1. Trabajar sobre una rama dedicada, nunca directo sobre la rama de producción.
2. Para cambios de schema/RLS: escribir una migración nueva, validarla en staging, y correr la suite de `supabase/tests/` antes de dar el cambio por bueno.
3. Correr `npm run lint` y `npm test` antes de proponer un cambio.
4. Los cambios de seguridad (RLS, triggers, funciones de autorización) requieren revisión explícita y evidencia de que la suite de autorización sigue pasando.
5. No se hace commit ni push de archivos `.env*` con valores reales, ni de cualquier archivo que contenga claves, contraseñas o tokens.
