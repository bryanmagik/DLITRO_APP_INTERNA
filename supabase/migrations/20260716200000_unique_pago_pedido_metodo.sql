-- Evita pagos duplicados por (pedido_id, metodo).
-- Permite pago mixto: un registro por método en el mismo pedido.
-- Limpia duplicados existentes (conserva el más antiguo) antes del constraint.

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY pedido_id, metodo
      ORDER BY created_at ASC NULLS LAST, id ASC
    ) AS rn
  FROM public.pagos_turno
  WHERE pedido_id IS NOT NULL
)
DELETE FROM public.pagos_turno
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.pagos_turno
  ADD CONSTRAINT unique_pago_pedido_metodo
  UNIQUE (pedido_id, metodo);
