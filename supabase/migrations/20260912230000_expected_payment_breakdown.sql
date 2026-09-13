-- Expected payment split for active orders.
-- These amounts are operational instructions for the dispatcher only. They do
-- not represent received money and must never be included in cash reporting;
-- actual payments continue to live exclusively in public.pagos_turno.

alter table public.pedidos
  add column if not exists pago_esperado_efectivo integer,
  add column if not exists pago_esperado_transferencia integer,
  add column if not exists pago_esperado_tarjeta integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_pago_esperado_efectivo_nonnegative'
  ) then
    alter table public.pedidos add constraint pedidos_pago_esperado_efectivo_nonnegative
      check (pago_esperado_efectivo is null or pago_esperado_efectivo >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_pago_esperado_transferencia_nonnegative'
  ) then
    alter table public.pedidos add constraint pedidos_pago_esperado_transferencia_nonnegative
      check (pago_esperado_transferencia is null or pago_esperado_transferencia >= 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'pedidos_pago_esperado_tarjeta_nonnegative'
  ) then
    alter table public.pedidos add constraint pedidos_pago_esperado_tarjeta_nonnegative
      check (pago_esperado_tarjeta is null or pago_esperado_tarjeta >= 0);
  end if;
end $$;

comment on column public.pedidos.pago_esperado_efectivo is
  'Monto esperado en efectivo; instrucción previa, no pago recibido.';
comment on column public.pedidos.pago_esperado_transferencia is
  'Monto esperado por transferencia; instrucción previa, no pago recibido.';
comment on column public.pedidos.pago_esperado_tarjeta is
  'Monto esperado con tarjeta; instrucción previa, no pago recibido.';
