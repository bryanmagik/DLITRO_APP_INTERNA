CREATE OR REPLACE FUNCTION public.set_numero_pedido()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  IF NEW.numero_pedido IS NULL THEN
    SELECT COUNT(*) + 1 INTO NEW.numero_pedido
    FROM public.pedidos
    WHERE turno_id = NEW.turno_id;
  END IF;
  RETURN NEW;
END;
$function$;