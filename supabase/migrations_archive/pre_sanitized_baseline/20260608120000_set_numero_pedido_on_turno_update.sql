-- Recalcular numero_pedido al asignar o cambiar turno_id (p. ej. al aceptar pedidos online)
CREATE OR REPLACE FUNCTION public.set_numero_pedido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.turno_id IS NOT NULL AND (
    NEW.numero_pedido IS NULL
    OR (TG_OP = 'UPDATE' AND OLD.turno_id IS DISTINCT FROM NEW.turno_id)
  ) THEN
    SELECT COALESCE(MAX(numero_pedido), 0) + 1 INTO NEW.numero_pedido
    FROM public.pedidos
    WHERE turno_id = NEW.turno_id
      AND (TG_OP = 'INSERT' OR id IS DISTINCT FROM NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_set_numero_pedido ON public.pedidos;
CREATE TRIGGER trg_set_numero_pedido
  BEFORE INSERT OR UPDATE OF turno_id ON public.pedidos
  FOR EACH ROW
  EXECUTE FUNCTION public.set_numero_pedido();
