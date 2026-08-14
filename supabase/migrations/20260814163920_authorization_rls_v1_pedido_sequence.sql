-- Required by pedidos.numero_pedido_global DEFAULT nextval(...).
revoke all on sequence public.pedidos_global_seq from public, anon, authenticated;
grant usage on sequence public.pedidos_global_seq to authenticated;
