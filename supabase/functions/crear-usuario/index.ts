import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Payload {
  email: string;
  password: string;
  nombre: string;
  apellido?: string | null;
  telefono?: string | null;
  rut?: string | null;
  rol: string;
  sucursal_id?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  console.log("[crear-usuario] Inicio →", req.method);

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Paso 1: verificar Authorization header ────────────────────────────
    const authHeader = req.headers.get("Authorization");
    console.log("[crear-usuario] Paso 1 — authHeader presente:", !!authHeader);
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Paso 2: verificar JWT del caller con anon key ─────────────────────
    console.log("[crear-usuario] Paso 2 — verificando JWT caller");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    console.log("[crear-usuario] Envs — url:", !!supabaseUrl, "anon:", !!anonKey, "service:", !!serviceKey);

    const supabaseAnon = createClient(supabaseUrl!, anonKey!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerData, error: callerErr } = await supabaseAnon.auth.getUser();
    const caller = callerData?.user;
    console.log("[crear-usuario] Paso 2 — caller id:", caller?.id ?? null, "error:", callerErr?.message ?? null);
    if (callerErr || !caller) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Paso 3: verificar rol del caller en la tabla usuarios ─────────────
    console.log("[crear-usuario] Paso 3 — verificando rol del caller");
    const supabaseService = createClient(supabaseUrl!, serviceKey!);

    const { data: callerPerfil, error: perfilErr } = await supabaseService
      .from("usuarios")
      .select("rol, sucursal_id, activo")
      .eq("id", caller.id)
      .single();

    console.log("[crear-usuario] Paso 3 — rol:", callerPerfil?.rol ?? null, "error:", perfilErr?.message ?? null);
    if (perfilErr || !callerPerfil) {
      return new Response(JSON.stringify({ error: "No se pudo verificar el perfil del caller" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (!callerPerfil.activo || !["superadmin", "admin", "encargado"].includes(callerPerfil.rol)) {
      return new Response(JSON.stringify({ error: "Sin permisos para crear usuarios" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Paso 4: leer y validar payload ────────────────────────────────────
    console.log("[crear-usuario] Paso 4 — leyendo body");
    const body = (await req.json()) as Payload;
    console.log("[crear-usuario] Paso 4 — email:", body?.email, "nombre:", body?.nombre, "rol:", body?.rol);

    if (!body.email?.trim() || !body.password || !body.nombre?.trim() || !body.rol) {
      return new Response(JSON.stringify({ error: "Faltan campos requeridos: email, password, nombre, rol" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    if (body.password.length < 6) {
      return new Response(JSON.stringify({ error: "La contraseña debe tener al menos 6 caracteres" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const rolesOperacionales = ["tomador_pedidos", "preparador", "despachador"];
    if (callerPerfil.rol === "encargado") {
      if (!rolesOperacionales.includes(body.rol)) {
        return new Response(JSON.stringify({ error: "El encargado solo puede crear roles operacionales" }), {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
      if (!callerPerfil.sucursal_id || body.sucursal_id !== callerPerfil.sucursal_id) {
        return new Response(JSON.stringify({ error: "El usuario debe pertenecer a la sucursal del encargado" }), {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }
    }

    // ── Paso 5: crear usuario en Supabase Auth ────────────────────────────
    console.log("[crear-usuario] Paso 5 — createUser en Auth:", body.email.trim().toLowerCase());
    const { data: authData, error: authError } = await supabaseService.auth.admin.createUser({
      email: body.email.trim().toLowerCase(),
      password: body.password,
      email_confirm: true,
    });

    console.log("[crear-usuario] Paso 5 — authData id:", authData?.user?.id ?? null, "error:", authError?.message ?? null);
    if (authError) {
      return new Response(JSON.stringify({ error: authError.message }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    // ── Paso 6: insertar en tabla usuarios ────────────────────────────────
    const newUserId = authData.user.id;
    console.log("[crear-usuario] Paso 6 — INSERT usuarios, id:", newUserId);

    const { error: dbError } = await supabaseService.from("usuarios").insert({
      id: newUserId,
      nombre: body.nombre.trim(),
      apellido: body.apellido?.trim() || null,
      telefono: body.telefono?.trim() || null,
      rut: body.rut?.trim() || null,
      rol: body.rol,
      sucursal_id: body.sucursal_id || null,
      activo: true,
    });

    console.log("[crear-usuario] Paso 6 — dbError:", dbError?.message ?? null);
    if (dbError) {
      // Rollback: eliminar el usuario de Auth si el INSERT en DB falló
      console.log("[crear-usuario] Paso 6 — ROLLBACK deleteUser", newUserId);
      await supabaseService.auth.admin.deleteUser(newUserId);
      return new Response(JSON.stringify({ error: `Error en base de datos: ${dbError.message}` }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    console.log("[crear-usuario] OK — usuario creado:", newUserId);
    return new Response(
      JSON.stringify({ id: newUserId, email: authData.user.email }),
      { status: 201, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const error = e as Error;
    console.error("[crear-usuario] CATCH —", error.message, error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
