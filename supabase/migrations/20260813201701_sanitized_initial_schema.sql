-- Sanitized initial schema baseline.
-- Origin: schema-only export of DLITRO ULTIMATE public schema; no production rows included.
-- Source schema-only SHA-256: 70584F4CF00589C89B21C5E5A9774A94E306698A034DD95577A02CCAC3DCC0A4
-- Validated candidate SHA-256: B1B4CB4D1CCEAA651B5090E96DB1E0A61EE970DD9CABC9CEFF025F03AD9C47E1
-- Data posture: DDL only; no COPY FROM stdin, data INSERTs, seeds, backfills, or production values.
-- Authorization posture: RLS enabled on every public table; closed by default unless a documented policy grants access.
-- Pending policy decisions: shifts/orders/payments, inventory/stock/closures, logistics/transfers,
-- dispatcher loans/payments, accounting/reporting, manual dispatch/auditing, non-admin catalog reads,
-- anonymous access, and public order tracking.
-- Historical migrations are archived under supabase/migrations_archive/pre_sanitized_baseline and MUST NOT run on new installs.
-- BASELINE SQL BEGINS BELOW (candidate bytes preserved exactly)



SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = on;


CREATE SCHEMA IF NOT EXISTS "public";
CREATE EXTENSION IF NOT EXISTS "pg_trgm" WITH SCHEMA "extensions";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."estado_pedido" AS ENUM (
    'tomado',
    'en_preparacion',
    'listo',
    'en_despacho',
    'entregado',
    'cancelado'
);


ALTER TYPE "public"."estado_pedido" OWNER TO "postgres";


CREATE TYPE "public"."estado_turno" AS ENUM (
    'abierto',
    'cerrado'
);


ALTER TYPE "public"."estado_turno" OWNER TO "postgres";


CREATE TYPE "public"."metodo_pago" AS ENUM (
    'efectivo',
    'transferencia',
    'tarjeta',
    'mixto',
    'cortesia'
);


ALTER TYPE "public"."metodo_pago" OWNER TO "postgres";


CREATE TYPE "public"."rol_usuario" AS ENUM (
    'superadmin',
    'admin',
    'encargado',
    'tomador_pedidos',
    'preparador',
    'despachador',
    'jefe_bodega',
    'contador_rrhh',
    'logistica'
);


ALTER TYPE "public"."rol_usuario" OWNER TO "postgres";


CREATE TYPE "public"."tipo_pedido" AS ENUM (
    'despacho',
    'retiro',
    'local',
    'delivery',
    'uber',
    'rappi',
    'puerta'
);


ALTER TYPE "public"."tipo_pedido" OWNER TO "postgres";


CREATE TYPE "public"."tipo_promo" AS ENUM (
    'sabor_del_dia',
    'jarra_dorada',
    'cumpleanos',
    'cupon',
    'canje',
    'trabajador'
);


ALTER TYPE "public"."tipo_promo" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."actualizar_stock_desde_cierre"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_sucursal_id UUID;
BEGIN
  IF NEW.cantidad_real IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT sucursal_id INTO v_sucursal_id
  FROM turnos
  WHERE id = NEW.turno_id;

  IF v_sucursal_id IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO stock_sucursal (insumo_id, sucursal_id, cantidad)
  VALUES (NEW.insumo_id, v_sucursal_id, NEW.cantidad_real)
  ON CONFLICT (sucursal_id, insumo_id)
  DO UPDATE SET
    cantidad = EXCLUDED.cantidad,
    updated_at = now();

  INSERT INTO stock_movimientos (
    insumo_id,
    sucursal_id,
    tipo,
    cantidad,
    es_bodega,
    referencia_tipo,
    referencia_id,
    notas
  ) VALUES (
    NEW.insumo_id,
    v_sucursal_id,
    'inventario_cierre',
    NEW.cantidad_real - NEW.cantidad_ideal,
    false,
    'inventario_cierre',
    NEW.id,
    'Ajuste por inventario de cierre de turno'
  );

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."actualizar_stock_desde_cierre"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."aplicar_entrega_logistica"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.estado = 'entregado' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'entregado') THEN
    -- sumar a sucursal
    INSERT INTO public.stock_sucursal (sucursal_id, insumo_id, cantidad)
    SELECT NEW.sucursal_id, pli.insumo_id, COALESCE(pli.cantidad_enviada, pli.cantidad_solicitada)
    FROM public.pedidos_logistica_items pli
    WHERE pli.pedido_id = NEW.id
    ON CONFLICT (sucursal_id, insumo_id) DO UPDATE
      SET cantidad = public.stock_sucursal.cantidad + EXCLUDED.cantidad,
          updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."aplicar_entrega_logistica"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calcular_costo_despacho"("distancia_km" numeric) RETURNS integer
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
DECLARE
  base       INT := 2000;
  tramo      NUMERIC := 3.5;
  extra      INT := 1000;
  tramos_extra INT;
BEGIN
  IF distancia_km <= tramo THEN
    RETURN base;
  ELSE
    tramos_extra := CEIL((distancia_km - tramo) / tramo);
    RETURN base + (tramos_extra * extra);
  END IF;
END;
$$;


ALTER FUNCTION "public"."calcular_costo_despacho"("distancia_km" numeric) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."calcular_costo_trago"("p_producto_id" "uuid") RETURNS numeric
    LANGUAGE "sql" STABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT COALESCE(SUM(r.cantidad * i.costo_unitario), 0)
  FROM public.recetas r
  JOIN public.insumos i ON i.id = r.insumo_id
  WHERE r.producto_id = p_producto_id;
$$;


ALTER FUNCTION "public"."calcular_costo_trago"("p_producto_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."descontar_bodega_central_logistica"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.estado = 'en_camino' AND (TG_OP = 'INSERT' OR OLD.estado IS DISTINCT FROM 'en_camino') THEN
    INSERT INTO public.stock_bodega_central (insumo_id, cantidad)
    SELECT pli.insumo_id, -COALESCE(pli.cantidad_enviada, pli.cantidad_solicitada)
    FROM public.pedidos_logistica_items pli
    WHERE pli.pedido_id = NEW.id
    ON CONFLICT (insumo_id) DO UPDATE
      SET cantidad = public.stock_bodega_central.cantidad - (
        SELECT COALESCE(SUM(COALESCE(cantidad_enviada, cantidad_solicitada)), 0)
        FROM public.pedidos_logistica_items WHERE pedido_id = NEW.id AND insumo_id = EXCLUDED.insumo_id
      ),
      updated_at = NOW();
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."descontar_bodega_central_logistica"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."descontar_stock_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  UPDATE stock_sucursal ss
  SET cantidad = ss.cantidad - (r.cantidad * NEW.cantidad),
      updated_at = NOW()
  FROM recetas r
  JOIN pedidos p ON p.id = NEW.pedido_id
  WHERE r.producto_id = NEW.producto_id
    AND r.insumo_id = ss.insumo_id
    AND ss.sucursal_id = p.sucursal_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."descontar_stock_pedido"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."descontar_stock_pedido_item"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  UPDATE public.stock_sucursal ss
  SET cantidad = ss.cantidad - (r.cantidad * NEW.cantidad),
      updated_at = NOW()
  FROM public.recetas r, public.pedidos p
  WHERE r.producto_id = NEW.producto_id
    AND ss.insumo_id = r.insumo_id
    AND p.id = NEW.pedido_id
    AND ss.sucursal_id = p.sucursal_id;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."descontar_stock_pedido_item"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_dlitro_day"("ts" timestamp with time zone) RETURNS "date"
    LANGUAGE "sql" IMMUTABLE
    SET "search_path" TO 'public'
    AS $$
  SELECT CASE
    WHEN EXTRACT(HOUR FROM ts AT TIME ZONE 'America/Santiago') < 6
    THEN ((ts AT TIME ZONE 'America/Santiago')::DATE - INTERVAL '1 day')::DATE
    ELSE (ts AT TIME ZONE 'America/Santiago')::DATE
  END;
$$;


ALTER FUNCTION "public"."get_dlitro_day"("ts" timestamp with time zone) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_turno_abierto"("p_sucursal_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT "public"."turnos"."id"
  FROM "public"."turnos"
  WHERE "public"."turnos"."sucursal_id" = "p_sucursal_id"
    AND "public"."turnos"."estado" = 'abierto'
  LIMIT 1;
$$;


ALTER FUNCTION "public"."get_turno_abierto"("p_sucursal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_rol"("_user_id" "uuid") RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT rol::text FROM public.usuarios WHERE id = _user_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_rol"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_sucursal"("_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT sucursal_id FROM public.usuarios WHERE id = _user_id LIMIT 1;
$$;


ALTER FUNCTION "public"."get_user_sucursal"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = _user_id AND rol IN ('superadmin', 'admin')
  );
$$;


ALTER FUNCTION "public"."is_admin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_superadmin"("_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.usuarios
    WHERE id = _user_id AND rol = 'superadmin'
  );
$$;


ALTER FUNCTION "public"."is_superadmin"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_precio_change"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF OLD.precio <> NEW.precio THEN
    INSERT INTO historial_precios (producto_id, precio_anterior, precio_nuevo, usuario_id)
    VALUES (NEW.id, OLD.precio, NEW.precio, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."log_precio_change"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restaurar_stock_cancelacion"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
BEGIN
  IF NEW.estado = 'cancelado' AND OLD.estado != 'cancelado' THEN
    UPDATE stock_sucursal ss
    SET cantidad = ss.cantidad + sub.total_a_devolver,
        updated_at = NOW()
    FROM (
      SELECT r.insumo_id, SUM(r.cantidad * pi.cantidad) as total_a_devolver
      FROM pedido_items pi
      JOIN recetas r ON r.producto_id = pi.producto_id
      WHERE pi.pedido_id = NEW.id
      GROUP BY r.insumo_id
    ) sub
    WHERE ss.insumo_id = sub.insumo_id
      AND ss.sucursal_id = NEW.sucursal_id;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."restaurar_stock_cancelacion"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_fecha_dlitro"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.fecha_dlitro IS NULL THEN
    NEW.fecha_dlitro := public.get_dlitro_day(COALESCE(NEW.created_at, NOW()));
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_fecha_dlitro"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_numero_pedido"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  nuevo_numero INT;
BEGIN
  -- Solo ejecutar si hay turno_id
  IF NEW.turno_id IS NULL THEN
    NEW.numero_pedido := NULL;
    RETURN NEW;
  END IF;

  UPDATE turnos
  SET numero_ultimo_pedido = numero_ultimo_pedido + 1
  WHERE id = NEW.turno_id
  RETURNING numero_ultimo_pedido INTO nuevo_numero;
  NEW.numero_pedido := nuevo_numero;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_numero_pedido"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_numero_pedido_global"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN
  IF NEW.numero_pedido_global IS NULL THEN
    NEW.numero_pedido_global := nextval('public.global_pedido_sequence');
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_numero_pedido_global"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_numero_pedido_online"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  nuevo_numero INT;
BEGIN
  IF NEW.turno_id IS NOT NULL AND OLD.turno_id IS NULL THEN
    UPDATE turnos
    SET numero_ultimo_pedido = numero_ultimo_pedido + 1
    WHERE id = NEW.turno_id
    RETURNING numero_ultimo_pedido INTO nuevo_numero;
    NEW.numero_pedido := nuevo_numero;
  END IF;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."set_numero_pedido_online"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_prestamos_despachador"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public'
    AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$;


ALTER FUNCTION "public"."touch_prestamos_despachador"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."asistencia" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "usuario_id" "uuid" NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "sucursal_id" "uuid" NOT NULL,
    "hora_entrada" timestamp with time zone DEFAULT "now"(),
    "hora_salida" timestamp with time zone,
    "horas_trabajadas" numeric(4,1) GENERATED ALWAYS AS (
CASE
    WHEN ("hora_salida" IS NOT NULL) THEN (EXTRACT(epoch FROM ("hora_salida" - "hora_entrada")) / 3600.0)
    ELSE NULL::numeric
END) STORED,
    "bono" integer DEFAULT 0,
    "notas" "text"
);


ALTER TABLE "public"."asistencia" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cambios_turno" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "tomador_saliente_id" "uuid" NOT NULL,
    "tomador_entrante_id" "uuid" NOT NULL,
    "efectivo_sistema" integer NOT NULL,
    "efectivo_declarado" integer NOT NULL,
    "diferencia" integer,
    "observacion" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."cambios_turno" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."categorias" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "orden" integer DEFAULT 0
);


ALTER TABLE "public"."categorias" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."clientes" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "telefono" "text",
    "fecha_nacimiento" "date",
    "notas" "text",
    "total_pedidos" integer DEFAULT 0,
    "total_gastado" integer DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."clientes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."configuracion_sucursal" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sucursal_id" "uuid" NOT NULL,
    "impresora_toma" "text",
    "impresora_cocina" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."configuracion_sucursal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."cupones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "codigo" "text" NOT NULL,
    "usado" boolean DEFAULT false,
    "fecha_uso" timestamp with time zone,
    "pedido_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."cupones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."despachos_manuales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "despachador_id" "uuid" NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "creado_por" "uuid",
    "actualizado_por" "uuid",
    "updated_at" timestamp with time zone,
    CONSTRAINT "despachos_manuales_monto_positivo" CHECK (("monto" > 0))
);


ALTER TABLE "public"."despachos_manuales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."despachos_manuales_cambios" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "despacho_id" "uuid" NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "despachador_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "operacion" "text" NOT NULL,
    "concepto" "text" NOT NULL,
    "monto_anterior" integer,
    "monto_nuevo" integer,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "despachos_manuales_cambios_operacion_check" CHECK (("operacion" = ANY (ARRAY['creado'::"text", 'monto_modificado'::"text", 'eliminado'::"text"])))
);


ALTER TABLE "public"."despachos_manuales_cambios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."direcciones_cliente" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "cliente_id" "uuid" NOT NULL,
    "direccion" "text" NOT NULL,
    "referencia" "text",
    "latitud" numeric(10,7),
    "longitud" numeric(10,7),
    "es_principal" boolean DEFAULT false
);


ALTER TABLE "public"."direcciones_cliente" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."gastos_turno" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "concepto" "text" NOT NULL,
    "monto" integer NOT NULL,
    "metodo" "public"."metodo_pago" DEFAULT 'efectivo'::"public"."metodo_pago",
    "usuario_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "gastos_turno_monto_check" CHECK (("monto" > 0))
);


ALTER TABLE "public"."gastos_turno" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."global_pedido_sequence"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."global_pedido_sequence" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."historial_precios" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "precio_anterior" integer NOT NULL,
    "precio_nuevo" integer NOT NULL,
    "usuario_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."historial_precios" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."insumos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "tipo" "text" NOT NULL,
    "unidad" "text",
    "unidad_logistica" "text",
    "activo" boolean DEFAULT true,
    "costo_unitario" numeric DEFAULT 0 NOT NULL,
    "formato_mayor" "text",
    "unidades_por_formato" integer,
    "ml_por_unidad" numeric
);


ALTER TABLE "public"."insumos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventario_cierre" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "cantidad_ideal" numeric NOT NULL,
    "cantidad_real" numeric,
    "diferencia" numeric GENERATED ALWAYS AS (
CASE
    WHEN ("cantidad_real" IS NOT NULL) THEN ("cantidad_real" - "cantidad_ideal")
    ELSE NULL::numeric
END) STORED,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "conteo_original" "text"
);


ALTER TABLE "public"."inventario_cierre" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventarios_parciales" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "sucursal_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "motivo" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."inventarios_parciales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventarios_parciales_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "inventario_id" "uuid" NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "cantidad_real" numeric DEFAULT 0 NOT NULL,
    "conteo_original" "text"
);


ALTER TABLE "public"."inventarios_parciales_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."log_cambios_pedido" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid",
    "usuario_id" "uuid",
    "campo" "text" NOT NULL,
    "valor_anterior" "text",
    "valor_nuevo" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."log_cambios_pedido" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pago_despachadores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "despachador_id" "uuid" NOT NULL,
    "pedidos_entregados" integer DEFAULT 0,
    "total_despachos_cobrados" integer DEFAULT 0,
    "horas_trabajadas" numeric(4,1) DEFAULT 0,
    "valor_hora" integer DEFAULT 0,
    "base_por_horas" integer DEFAULT 0,
    "bono" integer DEFAULT 0,
    "total_a_pagar" integer DEFAULT 0 NOT NULL,
    "pagado" boolean DEFAULT false,
    "fecha_pago" timestamp with time zone,
    "cierre_parcial" boolean DEFAULT false
);


ALTER TABLE "public"."pago_despachadores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pagos_turno" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "pedido_id" "uuid",
    "metodo" "public"."metodo_pago" NOT NULL,
    "monto" integer NOT NULL,
    "referencia" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."pagos_turno" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedido_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "cantidad" integer DEFAULT 1 NOT NULL,
    "precio_unitario" integer NOT NULL,
    "descuento_item" integer DEFAULT 0,
    "subtotal" integer NOT NULL,
    "notas" "text"
);


ALTER TABLE "public"."pedido_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."pedidos_global_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."pedidos_global_seq" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "turno_id" "uuid",
    "sucursal_id" "uuid" NOT NULL,
    "numero_pedido" integer,
    "tomador_id" "uuid",
    "cliente_id" "uuid",
    "cliente_nombre" "text" NOT NULL,
    "cliente_telefono" "text",
    "tipo" "public"."tipo_pedido" DEFAULT 'despacho'::"public"."tipo_pedido" NOT NULL,
    "direccion_entrega" "text",
    "referencia_entrega" "text",
    "latitud_entrega" numeric(10,7),
    "longitud_entrega" numeric(10,7),
    "distancia_km" numeric(5,2),
    "despachador_id" "uuid",
    "estado" "public"."estado_pedido" DEFAULT 'tomado'::"public"."estado_pedido" NOT NULL,
    "subtotal" integer NOT NULL,
    "descuento" integer DEFAULT 0,
    "costo_despacho" integer DEFAULT 0,
    "total" integer NOT NULL,
    "metodo_pago" "public"."metodo_pago" DEFAULT 'efectivo'::"public"."metodo_pago",
    "monto_recibido" integer,
    "vuelto" integer GENERATED ALWAYS AS (
CASE
    WHEN (("monto_recibido" IS NOT NULL) AND ("monto_recibido" > "total")) THEN ("monto_recibido" - "total")
    ELSE 0
END) STORED,
    "referencia_pago" "text",
    "promo_tipo" "public"."tipo_promo",
    "cupon_id" "uuid",
    "es_jarra_dorada" boolean DEFAULT false,
    "notas" "text",
    "comanda_impresa" boolean DEFAULT false,
    "sync_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "numero_pedido_global" integer DEFAULT "nextval"('"public"."pedidos_global_seq"'::"regclass"),
    "hora_agendada" timestamp with time zone,
    "jarros_prometidos" integer DEFAULT 0,
    "jarros_entregados" integer DEFAULT 0,
    "origen" "text" DEFAULT 'local'::"text" NOT NULL,
    "tiempo_estimado_minutos" integer,
    "estado_confirmacion" "text" DEFAULT 'confirmado'::"text" NOT NULL,
    "motivo_rechazo" "text",
    "pago_registrado" boolean DEFAULT false,
    "costo_despacho_calculado" integer,
    CONSTRAINT "pedidos_costo_despacho_calculado_no_negativo" CHECK ((("costo_despacho_calculado" IS NULL) OR ("costo_despacho_calculado" >= 0)))
);

ALTER TABLE ONLY "public"."pedidos" REPLICA IDENTITY FULL;


ALTER TABLE "public"."pedidos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos_despacho_ajustes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "numero_pedido" integer,
    "turno_id" "uuid" NOT NULL,
    "sucursal_id" "uuid" NOT NULL,
    "usuario_id" "uuid",
    "operacion" "text" NOT NULL,
    "distancia_km" numeric,
    "costo_calculado" integer NOT NULL,
    "costo_anterior" integer,
    "costo_cobrado" integer NOT NULL,
    "diferencia" integer GENERATED ALWAYS AS (("costo_cobrado" - "costo_calculado")) STORED,
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "pedidos_despacho_ajustes_costo_calculado_check" CHECK (("costo_calculado" >= 0)),
    CONSTRAINT "pedidos_despacho_ajustes_costo_cobrado_check" CHECK (("costo_cobrado" >= 0)),
    CONSTRAINT "pedidos_despacho_ajustes_operacion_check" CHECK (("operacion" = ANY (ARRAY['ajustado_al_crear'::"text", 'modificado_posteriormente'::"text"])))
);


ALTER TABLE "public"."pedidos_despacho_ajustes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos_logistica" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sucursal_id" "uuid" NOT NULL,
    "encargado_id" "uuid",
    "chofer_id" "uuid",
    "estado" "text" DEFAULT 'borrador'::"text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "iniciado_por_bodega" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."pedidos_logistica" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pedidos_logistica_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "pedido_id" "uuid" NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "cantidad_solicitada" numeric NOT NULL,
    "cantidad_enviada" numeric,
    "notas" "text"
);


ALTER TABLE "public"."pedidos_logistica_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."precios_trabajador" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "precio_trabajador" integer NOT NULL,
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."precios_trabajador" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."prestamos_despachador" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "despachador_id" "uuid" NOT NULL,
    "monto" integer NOT NULL,
    "devuelto" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."prestamos_despachador" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."productos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "precio" integer NOT NULL,
    "categoria_id" "uuid",
    "tiene_alcohol" boolean DEFAULT true,
    "activo" boolean DEFAULT true,
    "imagen_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "productos_precio_check" CHECK (("precio" >= 0))
);


ALTER TABLE "public"."productos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promociones" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "descripcion" "text",
    "tipo" "public"."tipo_promo" NOT NULL,
    "dias_activos" "text"[],
    "precio_especial" integer,
    "producto_id" "uuid",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."promociones" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promociones_precio" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "precio_promo" integer NOT NULL,
    "nombre" "text",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."promociones_precio" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."recetas" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "producto_id" "uuid" NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "cantidad" numeric NOT NULL
);


ALTER TABLE "public"."recetas" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sabores_extra" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "precio" integer DEFAULT 1000 NOT NULL,
    "activo" boolean DEFAULT true
);


ALTER TABLE "public"."sabores_extra" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_bodega_central" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "cantidad" numeric DEFAULT 0 NOT NULL,
    "stock_minimo" numeric DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stock_bodega_central" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_movimientos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "sucursal_id" "uuid",
    "es_bodega" boolean DEFAULT false,
    "tipo" "text" NOT NULL,
    "cantidad" numeric NOT NULL,
    "referencia_id" "uuid",
    "referencia_tipo" "text",
    "usuario_id" "uuid",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stock_movimientos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stock_sucursal" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "sucursal_id" "uuid" NOT NULL,
    "cantidad" numeric DEFAULT 0 NOT NULL,
    "stock_minimo" numeric DEFAULT 0,
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "stock_minimo_observacion" numeric DEFAULT 0 NOT NULL,
    "stock_minimo_critico" numeric DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."stock_sucursal" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sucursales" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "nombre" "text" NOT NULL,
    "direccion" "text" NOT NULL,
    "telefono" "text",
    "latitud" numeric(10,7),
    "longitud" numeric(10,7),
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "clave_canje" "text" DEFAULT '1234'::"text"
);


ALTER TABLE "public"."sucursales" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarifas_despachador" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "horas" integer NOT NULL,
    "descripcion" "text" NOT NULL,
    "monto" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarifas_despachador" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tarifas_despacho" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tramo" integer NOT NULL,
    "distancia_desde" numeric NOT NULL,
    "distancia_hasta" numeric NOT NULL,
    "descripcion" "text" NOT NULL,
    "precio" integer DEFAULT 0 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tarifas_despacho" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transferencia_items" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "transferencia_id" "uuid" NOT NULL,
    "insumo_id" "uuid" NOT NULL,
    "cantidad" numeric NOT NULL,
    CONSTRAINT "transferencia_items_cantidad_check" CHECK (("cantidad" > (0)::numeric))
);


ALTER TABLE "public"."transferencia_items" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."transferencias_stock" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sucursal_destino_id" "uuid" NOT NULL,
    "jefe_bodega_id" "uuid",
    "estado" "text" DEFAULT 'preparando'::"text",
    "notas" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "despachado_at" timestamp with time zone,
    "recibido_at" timestamp with time zone
);


ALTER TABLE "public"."transferencias_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turno_despachadores" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "turno_id" "uuid" NOT NULL,
    "despachador_id" "uuid" NOT NULL,
    "hora_entrada" timestamp with time zone DEFAULT "now"(),
    "hora_salida" timestamp with time zone,
    "activo" boolean DEFAULT true,
    "pagado" boolean DEFAULT false,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."turno_despachadores" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."turnos" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sucursal_id" "uuid" NOT NULL,
    "tomador_id" "uuid" NOT NULL,
    "caja_chica_apertura" integer DEFAULT 0 NOT NULL,
    "estado" "public"."estado_turno" DEFAULT 'abierto'::"public"."estado_turno" NOT NULL,
    "numero_ultimo_pedido" integer DEFAULT 0,
    "efectivo_sistema" integer,
    "efectivo_declarado" integer,
    "diferencia_caja" integer GENERATED ALWAYS AS (
CASE
    WHEN (("efectivo_declarado" IS NOT NULL) AND ("efectivo_sistema" IS NOT NULL)) THEN ("efectivo_declarado" - "efectivo_sistema")
    ELSE NULL::integer
END) STORED,
    "observacion_descuadre" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "closed_at" timestamp with time zone,
    "fecha_dlitro" "date",
    "estado_cuadratura" "text" DEFAULT 'por_revisar'::"text",
    "efectivo_declarado_caja_chica" integer DEFAULT 0,
    "efectivo_declarado_sobre" integer DEFAULT 0,
    "comentario_contador" "text",
    "comentario_contador_usuario_id" "uuid",
    "comentario_contador_fecha" timestamp with time zone,
    CONSTRAINT "turnos_estado_cuadratura_check" CHECK (("estado_cuadratura" = ANY (ARRAY['por_revisar'::"text", 'revisado'::"text", 'descuadrado'::"text"])))
);


ALTER TABLE "public"."turnos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."usuarios" (
    "id" "uuid" NOT NULL,
    "rut" "text",
    "nombre" "text" NOT NULL,
    "apellido" "text",
    "nombre_completo" "text" GENERATED ALWAYS AS ((("nombre" || ' '::"text") || COALESCE("apellido", ''::"text"))) STORED,
    "fecha_nacimiento" "date",
    "telefono" "text",
    "rol" "public"."rol_usuario" DEFAULT 'tomador_pedidos'::"public"."rol_usuario" NOT NULL,
    "sucursal_id" "uuid",
    "activo" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."usuarios" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_stock_bajo_minimo" WITH (security_invoker = true) AS
 SELECT "s"."nombre" AS "sucursal",
    "i"."nombre" AS "insumo",
    "i"."tipo",
    "ss"."cantidad" AS "stock_actual",
    "ss"."stock_minimo",
    ("ss"."cantidad" - "ss"."stock_minimo") AS "diferencia"
   FROM (("public"."stock_sucursal" "ss"
     JOIN "public"."sucursales" "s" ON (("s"."id" = "ss"."sucursal_id")))
     JOIN "public"."insumos" "i" ON (("i"."id" = "ss"."insumo_id")))
  WHERE ("ss"."cantidad" <= "ss"."stock_minimo")
  ORDER BY ("ss"."cantidad" - "ss"."stock_minimo");


ALTER VIEW "public"."v_stock_bajo_minimo" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."v_ventas_dia" WITH (security_invoker = true) AS
 SELECT "s"."id" AS "sucursal_id",
    "s"."nombre" AS "sucursal",
    "date"(("p"."created_at" AT TIME ZONE 'America/Santiago'::"text")) AS "fecha",
    "count"("p"."id") AS "total_pedidos",
    "sum"(
        CASE
            WHEN ("p"."estado" <> 'cancelado'::"public"."estado_pedido") THEN "p"."total"
            ELSE 0
        END) AS "total_ventas",
    "sum"(
        CASE
            WHEN ("pt"."metodo" = 'efectivo'::"public"."metodo_pago") THEN "pt"."monto"
            ELSE 0
        END) AS "total_efectivo",
    "sum"(
        CASE
            WHEN ("pt"."metodo" = 'transferencia'::"public"."metodo_pago") THEN "pt"."monto"
            ELSE 0
        END) AS "total_transferencia",
    "sum"(
        CASE
            WHEN ("pt"."metodo" = 'tarjeta'::"public"."metodo_pago") THEN "pt"."monto"
            ELSE 0
        END) AS "total_tarjeta",
    "sum"(
        CASE
            WHEN ("p"."estado" = 'cancelado'::"public"."estado_pedido") THEN 1
            ELSE 0
        END) AS "pedidos_cancelados"
   FROM (("public"."pedidos" "p"
     JOIN "public"."sucursales" "s" ON (("s"."id" = "p"."sucursal_id")))
     LEFT JOIN "public"."pagos_turno" "pt" ON (("pt"."pedido_id" = "p"."id")))
  GROUP BY "s"."id", "s"."nombre", ("date"(("p"."created_at" AT TIME ZONE 'America/Santiago'::"text")));


ALTER VIEW "public"."v_ventas_dia" OWNER TO "postgres";


ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_usuario_id_turno_id_key" UNIQUE ("usuario_id", "turno_id");



ALTER TABLE ONLY "public"."cambios_turno"
    ADD CONSTRAINT "cambios_turno_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."categorias"
    ADD CONSTRAINT "categorias_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."clientes"
    ADD CONSTRAINT "clientes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion_sucursal"
    ADD CONSTRAINT "configuracion_sucursal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."configuracion_sucursal"
    ADD CONSTRAINT "configuracion_sucursal_sucursal_id_key" UNIQUE ("sucursal_id");



ALTER TABLE ONLY "public"."cupones"
    ADD CONSTRAINT "cupones_codigo_key" UNIQUE ("codigo");



ALTER TABLE ONLY "public"."cupones"
    ADD CONSTRAINT "cupones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."despachos_manuales_cambios"
    ADD CONSTRAINT "despachos_manuales_cambios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."despachos_manuales"
    ADD CONSTRAINT "despachos_manuales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."direcciones_cliente"
    ADD CONSTRAINT "direcciones_cliente_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."gastos_turno"
    ADD CONSTRAINT "gastos_turno_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."historial_precios"
    ADD CONSTRAINT "historial_precios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."insumos"
    ADD CONSTRAINT "insumos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventario_cierre"
    ADD CONSTRAINT "inventario_cierre_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventario_cierre"
    ADD CONSTRAINT "inventario_cierre_turno_id_insumo_id_key" UNIQUE ("turno_id", "insumo_id");



ALTER TABLE ONLY "public"."inventario_cierre"
    ADD CONSTRAINT "inventario_cierre_turno_insumo_unique" UNIQUE ("turno_id", "insumo_id");



ALTER TABLE ONLY "public"."inventarios_parciales_items"
    ADD CONSTRAINT "inventarios_parciales_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."inventarios_parciales"
    ADD CONSTRAINT "inventarios_parciales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."log_cambios_pedido"
    ADD CONSTRAINT "log_cambios_pedido_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pago_despachadores"
    ADD CONSTRAINT "pago_despachadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pago_despachadores"
    ADD CONSTRAINT "pago_despachadores_turno_id_despachador_id_key" UNIQUE ("turno_id", "despachador_id");



ALTER TABLE ONLY "public"."pagos_turno"
    ADD CONSTRAINT "pagos_turno_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_despacho_ajustes"
    ADD CONSTRAINT "pedidos_despacho_ajustes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_logistica_items"
    ADD CONSTRAINT "pedidos_logistica_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos_logistica"
    ADD CONSTRAINT "pedidos_logistica_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_sync_id_key" UNIQUE ("sync_id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_turno_id_numero_pedido_key" UNIQUE ("turno_id", "numero_pedido");



ALTER TABLE ONLY "public"."precios_trabajador"
    ADD CONSTRAINT "precios_trabajador_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."precios_trabajador"
    ADD CONSTRAINT "precios_trabajador_producto_id_key" UNIQUE ("producto_id");



ALTER TABLE ONLY "public"."prestamos_despachador"
    ADD CONSTRAINT "prestamos_despachador_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."prestamos_despachador"
    ADD CONSTRAINT "prestamos_despachador_turno_id_despachador_id_key" UNIQUE ("turno_id", "despachador_id");



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promociones"
    ADD CONSTRAINT "promociones_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promociones_precio"
    ADD CONSTRAINT "promociones_precio_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recetas"
    ADD CONSTRAINT "recetas_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."recetas"
    ADD CONSTRAINT "recetas_producto_id_insumo_id_key" UNIQUE ("producto_id", "insumo_id");



ALTER TABLE ONLY "public"."sabores_extra"
    ADD CONSTRAINT "sabores_extra_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_bodega_central"
    ADD CONSTRAINT "stock_bodega_central_insumo_id_key" UNIQUE ("insumo_id");



ALTER TABLE ONLY "public"."stock_bodega_central"
    ADD CONSTRAINT "stock_bodega_central_insumo_unique" UNIQUE ("insumo_id");



ALTER TABLE ONLY "public"."stock_bodega_central"
    ADD CONSTRAINT "stock_bodega_central_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_insumo_id_sucursal_id_key" UNIQUE ("insumo_id", "sucursal_id");



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_sucursal_insumo_unique" UNIQUE ("sucursal_id", "insumo_id");



ALTER TABLE ONLY "public"."sucursales"
    ADD CONSTRAINT "sucursales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarifas_despachador"
    ADD CONSTRAINT "tarifas_despachador_horas_key" UNIQUE ("horas");



ALTER TABLE ONLY "public"."tarifas_despachador"
    ADD CONSTRAINT "tarifas_despachador_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarifas_despacho"
    ADD CONSTRAINT "tarifas_despacho_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tarifas_despacho"
    ADD CONSTRAINT "tarifas_despacho_tramo_key" UNIQUE ("tramo");



ALTER TABLE ONLY "public"."transferencia_items"
    ADD CONSTRAINT "transferencia_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."transferencias_stock"
    ADD CONSTRAINT "transferencias_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turno_despachadores"
    ADD CONSTRAINT "turno_despachadores_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."turno_despachadores"
    ADD CONSTRAINT "turno_despachadores_turno_id_despachador_id_key" UNIQUE ("turno_id", "despachador_id");



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pagos_turno"
    ADD CONSTRAINT "unique_pago_pedido_metodo" UNIQUE ("pedido_id", "metodo");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_rut_key" UNIQUE ("rut");



CREATE INDEX "idx_cambios_turno_created_at" ON "public"."cambios_turno" USING "btree" ("created_at");



CREATE INDEX "idx_cambios_turno_turno_id" ON "public"."cambios_turno" USING "btree" ("turno_id");



CREATE INDEX "idx_clientes_nombre" ON "public"."clientes" USING "gin" ("nombre" "extensions"."gin_trgm_ops");



CREATE INDEX "idx_clientes_telefono" ON "public"."clientes" USING "btree" ("telefono");



CREATE INDEX "idx_despachos_manuales_actualizado_por" ON "public"."despachos_manuales" USING "btree" ("actualizado_por");



CREATE INDEX "idx_despachos_manuales_cambios_changed_at" ON "public"."despachos_manuales_cambios" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_despachos_manuales_cambios_despacho_id" ON "public"."despachos_manuales_cambios" USING "btree" ("despacho_id");



CREATE INDEX "idx_despachos_manuales_cambios_usuario_id" ON "public"."despachos_manuales_cambios" USING "btree" ("usuario_id");



CREATE INDEX "idx_despachos_manuales_creado_por" ON "public"."despachos_manuales" USING "btree" ("creado_por");



CREATE INDEX "idx_despachos_manuales_turno_desp" ON "public"."despachos_manuales" USING "btree" ("turno_id", "despachador_id");



CREATE INDEX "idx_gastos_turno" ON "public"."gastos_turno" USING "btree" ("turno_id");



CREATE INDEX "idx_inventarios_parciales_items_inv" ON "public"."inventarios_parciales_items" USING "btree" ("inventario_id");



CREATE INDEX "idx_inventarios_parciales_turno" ON "public"."inventarios_parciales" USING "btree" ("turno_id");



CREATE INDEX "idx_log_cambios_pedido_created_at" ON "public"."log_cambios_pedido" USING "btree" ("created_at" DESC);



CREATE INDEX "idx_log_cambios_pedido_pedido_id" ON "public"."log_cambios_pedido" USING "btree" ("pedido_id");



CREATE INDEX "idx_pagos_turno" ON "public"."pagos_turno" USING "btree" ("turno_id", "metodo");



CREATE INDEX "idx_pedidos_despachador" ON "public"."pedidos" USING "btree" ("despachador_id", "estado");



CREATE INDEX "idx_pedidos_despacho_ajustes_changed_at" ON "public"."pedidos_despacho_ajustes" USING "btree" ("changed_at" DESC);



CREATE INDEX "idx_pedidos_despacho_ajustes_pedido_id" ON "public"."pedidos_despacho_ajustes" USING "btree" ("pedido_id");



CREATE INDEX "idx_pedidos_despacho_ajustes_usuario_id" ON "public"."pedidos_despacho_ajustes" USING "btree" ("usuario_id");



CREATE INDEX "idx_pedidos_estado" ON "public"."pedidos" USING "btree" ("estado");



CREATE INDEX "idx_pedidos_pendientes_online" ON "public"."pedidos" USING "btree" ("sucursal_id", "estado_confirmacion") WHERE ("estado_confirmacion" = 'pendiente_confirmacion'::"text");



CREATE INDEX "idx_pedidos_sucursal" ON "public"."pedidos" USING "btree" ("sucursal_id", "created_at" DESC);



CREATE INDEX "idx_pedidos_sync" ON "public"."pedidos" USING "btree" ("sync_id");



CREATE INDEX "idx_pedidos_turno" ON "public"."pedidos" USING "btree" ("turno_id", "numero_pedido");



CREATE INDEX "idx_precios_trabajador_producto" ON "public"."precios_trabajador" USING "btree" ("producto_id");



CREATE INDEX "idx_stock_sucursal" ON "public"."stock_sucursal" USING "btree" ("sucursal_id", "insumo_id");



CREATE INDEX "idx_turnos_sucursal" ON "public"."turnos" USING "btree" ("sucursal_id", "created_at" DESC);



CREATE UNIQUE INDEX "promociones_precio_producto_activo_unique" ON "public"."promociones_precio" USING "btree" ("producto_id") WHERE ("activo" = true);



CREATE UNIQUE INDEX "un_turno_abierto_por_sucursal" ON "public"."turnos" USING "btree" ("sucursal_id") WHERE ("estado" = 'abierto'::"public"."estado_turno");



CREATE OR REPLACE TRIGGER "trg_actualizar_stock_cierre" AFTER INSERT OR UPDATE OF "cantidad_real" ON "public"."inventario_cierre" FOR EACH ROW WHEN (("new"."cantidad_real" IS NOT NULL)) EXECUTE FUNCTION "public"."actualizar_stock_desde_cierre"();



CREATE OR REPLACE TRIGGER "trg_aplicar_entrega_logistica" AFTER INSERT OR UPDATE OF "estado" ON "public"."pedidos_logistica" FOR EACH ROW EXECUTE FUNCTION "public"."aplicar_entrega_logistica"();









CREATE OR REPLACE TRIGGER "trg_descontar_bodega_central_logistica" AFTER UPDATE OF "estado" ON "public"."pedidos_logistica" FOR EACH ROW EXECUTE FUNCTION "public"."descontar_bodega_central_logistica"();



CREATE OR REPLACE TRIGGER "trg_descontar_stock" AFTER INSERT ON "public"."pedido_items" FOR EACH ROW EXECUTE FUNCTION "public"."descontar_stock_pedido"();



CREATE OR REPLACE TRIGGER "trg_log_precio" BEFORE UPDATE ON "public"."productos" FOR EACH ROW EXECUTE FUNCTION "public"."log_precio_change"();



CREATE OR REPLACE TRIGGER "trg_numero_pedido_online" BEFORE UPDATE ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."set_numero_pedido_online"();









CREATE OR REPLACE TRIGGER "trg_restaurar_stock_cancelacion" AFTER UPDATE ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."restaurar_stock_cancelacion"();



CREATE OR REPLACE TRIGGER "trg_set_fecha_dlitro" BEFORE INSERT ON "public"."turnos" FOR EACH ROW EXECUTE FUNCTION "public"."set_fecha_dlitro"();



CREATE OR REPLACE TRIGGER "trg_set_numero_pedido" BEFORE INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."set_numero_pedido"();



CREATE OR REPLACE TRIGGER "trg_set_numero_pedido_global" BEFORE INSERT ON "public"."pedidos" FOR EACH ROW EXECUTE FUNCTION "public"."set_numero_pedido_global"();



CREATE OR REPLACE TRIGGER "update_prestamos_despachador_updated_at" BEFORE UPDATE ON "public"."prestamos_despachador" FOR EACH ROW EXECUTE FUNCTION "public"."touch_prestamos_despachador"();



ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."asistencia"
    ADD CONSTRAINT "asistencia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."cambios_turno"
    ADD CONSTRAINT "cambios_turno_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."configuracion_sucursal"
    ADD CONSTRAINT "configuracion_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."despachos_manuales"
    ADD CONSTRAINT "despachos_manuales_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."despachos_manuales_cambios"
    ADD CONSTRAINT "despachos_manuales_cambios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."despachos_manuales"
    ADD CONSTRAINT "despachos_manuales_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."despachos_manuales"
    ADD CONSTRAINT "despachos_manuales_despachador_id_fkey" FOREIGN KEY ("despachador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."despachos_manuales"
    ADD CONSTRAINT "despachos_manuales_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."direcciones_cliente"
    ADD CONSTRAINT "direcciones_cliente_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."gastos_turno"
    ADD CONSTRAINT "gastos_turno_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."gastos_turno"
    ADD CONSTRAINT "gastos_turno_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."historial_precios"
    ADD CONSTRAINT "historial_precios_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."historial_precios"
    ADD CONSTRAINT "historial_precios_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."inventario_cierre"
    ADD CONSTRAINT "inventario_cierre_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id");



ALTER TABLE ONLY "public"."inventario_cierre"
    ADD CONSTRAINT "inventario_cierre_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."inventarios_parciales_items"
    ADD CONSTRAINT "inventarios_parciales_items_inventario_id_fkey" FOREIGN KEY ("inventario_id") REFERENCES "public"."inventarios_parciales"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."log_cambios_pedido"
    ADD CONSTRAINT "log_cambios_pedido_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."log_cambios_pedido"
    ADD CONSTRAINT "log_cambios_pedido_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."pago_despachadores"
    ADD CONSTRAINT "pago_despachadores_despachador_id_fkey" FOREIGN KEY ("despachador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."pago_despachadores"
    ADD CONSTRAINT "pago_despachadores_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."pagos_turno"
    ADD CONSTRAINT "pagos_turno_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id");



ALTER TABLE ONLY "public"."pagos_turno"
    ADD CONSTRAINT "pagos_turno_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedido_items"
    ADD CONSTRAINT "pedido_items_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_cliente_id_fkey" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_cupon_id_fkey" FOREIGN KEY ("cupon_id") REFERENCES "public"."cupones"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_despachador_id_fkey" FOREIGN KEY ("despachador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."pedidos_despacho_ajustes"
    ADD CONSTRAINT "pedidos_despacho_ajustes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."pedidos_logistica"
    ADD CONSTRAINT "pedidos_logistica_chofer_id_fkey" FOREIGN KEY ("chofer_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."pedidos_logistica"
    ADD CONSTRAINT "pedidos_logistica_encargado_id_fkey" FOREIGN KEY ("encargado_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."pedidos_logistica_items"
    ADD CONSTRAINT "pedidos_logistica_items_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id");



ALTER TABLE ONLY "public"."pedidos_logistica_items"
    ADD CONSTRAINT "pedidos_logistica_items_pedido_id_fkey" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedidos_logistica"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."pedidos_logistica"
    ADD CONSTRAINT "pedidos_logistica_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_tomador_id_fkey" FOREIGN KEY ("tomador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."pedidos"
    ADD CONSTRAINT "pedidos_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id");



ALTER TABLE ONLY "public"."precios_trabajador"
    ADD CONSTRAINT "precios_trabajador_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."prestamos_despachador"
    ADD CONSTRAINT "prestamos_despachador_despachador_id_fkey" FOREIGN KEY ("despachador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."prestamos_despachador"
    ADD CONSTRAINT "prestamos_despachador_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."productos"
    ADD CONSTRAINT "productos_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "public"."categorias"("id");



ALTER TABLE ONLY "public"."promociones_precio"
    ADD CONSTRAINT "promociones_precio_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."promociones"
    ADD CONSTRAINT "promociones_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."recetas"
    ADD CONSTRAINT "recetas_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id");



ALTER TABLE ONLY "public"."recetas"
    ADD CONSTRAINT "recetas_producto_id_fkey" FOREIGN KEY ("producto_id") REFERENCES "public"."productos"("id");



ALTER TABLE ONLY "public"."stock_bodega_central"
    ADD CONSTRAINT "stock_bodega_central_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."stock_movimientos"
    ADD CONSTRAINT "stock_movimientos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id");



ALTER TABLE ONLY "public"."stock_sucursal"
    ADD CONSTRAINT "stock_sucursal_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."transferencia_items"
    ADD CONSTRAINT "transferencia_items_insumo_id_fkey" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id");



ALTER TABLE ONLY "public"."transferencia_items"
    ADD CONSTRAINT "transferencia_items_transferencia_id_fkey" FOREIGN KEY ("transferencia_id") REFERENCES "public"."transferencias_stock"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."transferencias_stock"
    ADD CONSTRAINT "transferencias_stock_jefe_bodega_id_fkey" FOREIGN KEY ("jefe_bodega_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."transferencias_stock"
    ADD CONSTRAINT "transferencias_stock_sucursal_destino_id_fkey" FOREIGN KEY ("sucursal_destino_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."turno_despachadores"
    ADD CONSTRAINT "turno_despachadores_despachador_id_fkey" FOREIGN KEY ("despachador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."turno_despachadores"
    ADD CONSTRAINT "turno_despachadores_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "public"."turnos"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_comentario_contador_usuario_id_fkey" FOREIGN KEY ("comentario_contador_usuario_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");



ALTER TABLE ONLY "public"."turnos"
    ADD CONSTRAINT "turnos_tomador_id_fkey" FOREIGN KEY ("tomador_id") REFERENCES "public"."usuarios"("id");



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."usuarios"
    ADD CONSTRAINT "usuarios_sucursal_id_fkey" FOREIGN KEY ("sucursal_id") REFERENCES "public"."sucursales"("id");

-- Sanitized authorization baseline: closed by default.
ALTER TABLE "public"."asistencia" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cambios_turno" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."categorias" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."clientes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."configuracion_sucursal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."cupones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."despachos_manuales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."despachos_manuales_cambios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."direcciones_cliente" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."gastos_turno" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."historial_precios" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."insumos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventario_cierre" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventarios_parciales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."inventarios_parciales_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."log_cambios_pedido" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pago_despachadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pagos_turno" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pedido_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pedidos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pedidos_despacho_ajustes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pedidos_logistica" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."pedidos_logistica_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."precios_trabajador" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."prestamos_despachador" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."productos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promociones" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."promociones_precio" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."recetas" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sabores_extra" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_bodega_central" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_movimientos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."stock_sucursal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."sucursales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tarifas_despachador" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."tarifas_despacho" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transferencia_items" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."transferencias_stock" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."turno_despachadores" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."turnos" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."usuarios" ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA "public" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA "public" FROM PUBLIC, "anon", "authenticated";
REVOKE ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA "public" FROM PUBLIC, "anon", "authenticated";

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON TABLES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON SEQUENCES FROM PUBLIC, "anon", "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" REVOKE ALL ON FUNCTIONS FROM PUBLIC, "anon", "authenticated";

GRANT USAGE ON SCHEMA "public" TO "authenticated";

-- Concrete consumer: authenticated users load their own application profile.
GRANT SELECT ON TABLE "public"."usuarios" TO "authenticated";
CREATE POLICY "usuarios_self_select"
ON "public"."usuarios"
FOR SELECT
TO "authenticated"
USING ((SELECT "auth"."uid"()) = "id");

-- Concrete consumer: existing administration screens and authorization helpers.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  "public"."usuarios",
  "public"."categorias",
  "public"."insumos",
  "public"."productos",
  "public"."sucursales",
  "public"."tarifas_despachador",
  "public"."tarifas_despacho"
TO "authenticated";

CREATE POLICY "usuarios_admin_all" ON "public"."usuarios"
TO "authenticated"
USING ("public"."is_admin"((SELECT "auth"."uid"())))
WITH CHECK ("public"."is_admin"((SELECT "auth"."uid"())));

CREATE POLICY "categorias_admin_all" ON "public"."categorias"
TO "authenticated"
USING ("public"."is_admin"((SELECT "auth"."uid"())))
WITH CHECK ("public"."is_admin"((SELECT "auth"."uid"())));

CREATE POLICY "insumos_admin_all" ON "public"."insumos"
TO "authenticated"
USING ("public"."is_admin"((SELECT "auth"."uid"())))
WITH CHECK ("public"."is_admin"((SELECT "auth"."uid"())));

CREATE POLICY "productos_admin_all" ON "public"."productos"
TO "authenticated"
USING ("public"."is_admin"((SELECT "auth"."uid"())))
WITH CHECK ("public"."is_admin"((SELECT "auth"."uid"())));

CREATE POLICY "sucursales_admin_all" ON "public"."sucursales"
TO "authenticated"
USING ("public"."is_admin"((SELECT "auth"."uid"())))
WITH CHECK ("public"."is_admin"((SELECT "auth"."uid"())));

CREATE POLICY "tarifas_despachador_admin_all" ON "public"."tarifas_despachador"
TO "authenticated"
USING ("public"."is_admin"((SELECT "auth"."uid"())))
WITH CHECK ("public"."is_admin"((SELECT "auth"."uid"())));

CREATE POLICY "tarifas_despacho_admin_all" ON "public"."tarifas_despacho"
TO "authenticated"
USING ("public"."is_admin"((SELECT "auth"."uid"())))
WITH CHECK ("public"."is_admin"((SELECT "auth"."uid"())));

-- These definers are consumed by the concrete policies above. get_turno_abierto stays blocked.
GRANT EXECUTE ON FUNCTION "public"."get_user_rol"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."get_user_sucursal"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_admin"("uuid") TO "authenticated";
GRANT EXECUTE ON FUNCTION "public"."is_superadmin"("uuid") TO "authenticated";
