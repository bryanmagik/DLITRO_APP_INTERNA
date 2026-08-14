-- Harden function resolution and execution without opening any closed table.

CREATE OR REPLACE FUNCTION "public"."calcular_costo_despacho"("distancia_km" numeric)
RETURNS integer
LANGUAGE "plpgsql"
IMMUTABLE
SECURITY INVOKER
SET "search_path" TO ''
AS $$
DECLARE
  base INT := 2000;
  tramo NUMERIC := 3.5;
  extra INT := 1000;
  tramos_extra INT;
BEGIN
  IF distancia_km <= tramo THEN
    RETURN base;
  END IF;

  tramos_extra := "pg_catalog"."ceil"((distancia_km - tramo) / tramo);
  RETURN base + (tramos_extra * extra);
END;
$$;

CREATE OR REPLACE FUNCTION "public"."descontar_stock_pedido"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" TO ''
AS $$
BEGIN
  UPDATE "public"."stock_sucursal" AS ss
  SET cantidad = ss.cantidad - (r.cantidad * NEW.cantidad),
      updated_at = "pg_catalog"."now"()
  FROM "public"."recetas" AS r
  JOIN "public"."pedidos" AS p ON p.id = NEW.pedido_id
  WHERE r.producto_id = NEW.producto_id
    AND r.insumo_id = ss.insumo_id
    AND ss.sucursal_id = p.sucursal_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."log_precio_change"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" TO ''
AS $$
BEGIN
  IF OLD.precio <> NEW.precio THEN
    INSERT INTO "public"."historial_precios" (
      producto_id,
      precio_anterior,
      precio_nuevo,
      usuario_id
    )
    VALUES (
      NEW.id,
      OLD.precio,
      NEW.precio,
      "auth"."uid"()
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."restaurar_stock_cancelacion"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" TO ''
AS $$
BEGIN
  IF NEW.estado = 'cancelado' AND OLD.estado <> 'cancelado' THEN
    UPDATE "public"."stock_sucursal" AS ss
    SET cantidad = ss.cantidad + restored.total_a_devolver,
        updated_at = "pg_catalog"."now"()
    FROM (
      SELECT
        r.insumo_id,
        "pg_catalog"."sum"(r.cantidad * pi.cantidad) AS total_a_devolver
      FROM "public"."pedido_items" AS pi
      JOIN "public"."recetas" AS r ON r.producto_id = pi.producto_id
      WHERE pi.pedido_id = NEW.id
      GROUP BY r.insumo_id
    ) AS restored
    WHERE ss.insumo_id = restored.insumo_id
      AND ss.sucursal_id = NEW.sucursal_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_numero_pedido"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" TO ''
AS $$
DECLARE
  nuevo_numero INT;
BEGIN
  IF NEW.turno_id IS NULL THEN
    NEW.numero_pedido := NULL;
    RETURN NEW;
  END IF;

  UPDATE "public"."turnos"
  SET numero_ultimo_pedido = numero_ultimo_pedido + 1
  WHERE id = NEW.turno_id
  RETURNING numero_ultimo_pedido INTO nuevo_numero;

  NEW.numero_pedido := nuevo_numero;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION "public"."set_numero_pedido_online"()
RETURNS "trigger"
LANGUAGE "plpgsql"
SECURITY INVOKER
SET "search_path" TO ''
AS $$
DECLARE
  nuevo_numero INT;
BEGIN
  IF NEW.turno_id IS NOT NULL AND OLD.turno_id IS NULL THEN
    UPDATE "public"."turnos"
    SET numero_ultimo_pedido = numero_ultimo_pedido + 1
    WHERE id = NEW.turno_id
    RETURNING numero_ultimo_pedido INTO nuevo_numero;

    NEW.numero_pedido := nuevo_numero;
  END IF;
  RETURN NEW;
END;
$$;

-- These compatibility helpers no longer bypass RLS and only resolve the caller's identity.
CREATE OR REPLACE FUNCTION "public"."get_user_rol"("_user_id" uuid)
RETURNS text
LANGUAGE "sql"
STABLE
SECURITY INVOKER
SET "search_path" TO ''
AS $$
  SELECT u.rol::text
  FROM "public"."usuarios" AS u
  WHERE "_user_id" = (SELECT "auth"."uid"())
    AND u.id = (SELECT "auth"."uid"())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION "public"."get_user_sucursal"("_user_id" uuid)
RETURNS uuid
LANGUAGE "sql"
STABLE
SECURITY INVOKER
SET "search_path" TO ''
AS $$
  SELECT u.sucursal_id
  FROM "public"."usuarios" AS u
  WHERE "_user_id" = (SELECT "auth"."uid"())
    AND u.id = (SELECT "auth"."uid"())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION "public"."is_superadmin"("_user_id" uuid)
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY INVOKER
SET "search_path" TO ''
AS $$
  SELECT
    "_user_id" = (SELECT "auth"."uid"())
    AND EXISTS (
      SELECT 1
      FROM "public"."usuarios" AS u
      WHERE u.id = (SELECT "auth"."uid"())
        AND u.rol = 'superadmin'
    );
$$;

-- RLS policies need this single definer to avoid recursively querying public.usuarios.
-- The caller cannot use it to inspect any UUID other than the authenticated identity.
CREATE OR REPLACE FUNCTION "public"."is_admin"("_user_id" uuid)
RETURNS boolean
LANGUAGE "sql"
STABLE
SECURITY DEFINER
SET "search_path" TO ''
AS $$
  SELECT
    COALESCE("_user_id" = (SELECT "auth"."uid"()), false)
    AND EXISTS (
      SELECT 1
      FROM "public"."usuarios" AS u
      WHERE u.id = (SELECT "auth"."uid"())
        AND u.rol IN ('superadmin', 'admin')
    );
$$;

REVOKE ALL ON FUNCTION "public"."calcular_costo_despacho"(numeric) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."descontar_stock_pedido"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."log_precio_change"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."restaurar_stock_cancelacion"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."set_numero_pedido"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."set_numero_pedido_online"() FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."get_user_rol"(uuid) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."get_user_sucursal"(uuid) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."is_superadmin"(uuid) FROM PUBLIC, "anon", "authenticated";
REVOKE ALL ON FUNCTION "public"."is_admin"(uuid) FROM PUBLIC, "anon", "authenticated";

GRANT EXECUTE ON FUNCTION "public"."is_admin"(uuid) TO "authenticated";
