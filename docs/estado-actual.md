# Estado actual de DLITRO

> **Lectura obligatoria al inicio de cada sesión.** Pendientes conocidos y diferencias entre ambientes.
> Actualizar este archivo cuando un punto se resuelva o aparezca uno nuevo.
>
> **Última actualización:** 3 de noviembre de 2026.

Ambientes: staging `suscxwjloggmbsqdlgpj` · producción `uwymxjmyasnlmkitzvej`. Ver [`CLAUDE.md`](../CLAUDE.md).

## Ramas

- Rama de trabajo: `staging/security-hardening`.
- `main` está desactualizada: no usarla para builds ni PRs hasta reconciliarla.
- `rescate/main-agosto`: cambios de agosto sin integrar (incluye el buscador de usuarios). No mergear sin revisión.

## Pendientes conocidos

### Seguridad / base de datos

- **Producción no tiene el hardening de funciones que ya está en staging:**
  - 7 funciones sin `search_path` fijo. — **Preparado, pendiente de aplicar.**
  - `is_superadmin` y `get_turno_abierto` ejecutables por `authenticated`. — **Preparado, pendiente de aplicar.**
  - Extensión `pg_trgm` instalada en el schema `public`. — Sin preparar (fuera de alcance del hardening).

  Archivos en `supabase/migrations_production_emergency/`: `20261103_harden_function_search_path_prod.sql`, su `_ROLLBACK.sql` y `_VERIFY.sql`. Antes de aplicar: correr VERIFY y guardar la salida como snapshot; el ROLLBACK asume un ACL previo que debe coincidir con ese snapshot.
- **Leaked password protection desactivada** en ambos ambientes (Supabase Auth).

### Migraciones

- **Historial divergente:** hay migraciones con el mismo nombre y distinto timestamp entre producción y staging (p. ej. `order_audit_*`). **No usar `supabase db push` hasta reconciliar.**
- `20260926120000_worker_prices_order_entry_read.sql` está en el repo pero **no está aplicada en ningún ambiente**.
- `20261016033406_dispatch_map_branch_directory.sql` **solo existe en staging**. El instalador 0.2.7 depende de ella, así que 0.2.7 no puede publicarse antes de aplicarla en producción.

### Releases

- Última release publicada: **v0.2.6**. La 0.2.7 está bloqueada por `dispatch_map_branch_directory` (ver arriba).

### Pedidos y pagos

- **Pedidos de Uber y Rappi se registran con `metodo_pago = 'cortesia'`.** Falta un método de pago de plataforma.
- **Hay pedidos entregados cuya suma de pagos no cuadra con el total**, por falta de atomicidad al registrar pedido y pagos.
- El default de `pedidos.estado` en la BD sigue siendo `'tomado'` (estado sin uso). Hoy el frontend envía `en_preparacion` explícitamente.
