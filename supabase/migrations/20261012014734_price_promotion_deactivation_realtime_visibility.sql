-- promociones_precio contains only product reference, advertised price, label,
-- active flag, creation timestamp and ID; no costs, customer data or credentials.
-- Required for Realtime UPDATE delivery when a promotion becomes inactive.
-- Validated in staging: 10 roles, authorized quote, forbidden writes, anon denied,
-- and visibility of the deactivated row without selection as an active quote.
-- promociones remains active-only; existing write restrictions are unchanged.
alter policy promociones_precio_order_entry_read_v1 on public.promociones_precio
using (private.has_permission('orders.create') or private.has_permission('orders.update'));
