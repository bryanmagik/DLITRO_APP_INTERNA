import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

interface ItemIn { producto_id: string; cantidad: number; notas?: string }
interface PedidoIn {
  sucursal_id: string;
  cliente_nombre: string;
  cliente_telefono?: string;
  tipo?: "despacho" | "retiro" | "local";
  direccion_entrega?: string;
  referencia_entrega?: string;
  latitud_entrega?: number;
  longitud_entrega?: number;
  distancia_km?: number;
  costo_despacho?: number;
  metodo_pago?: "efectivo" | "transferencia" | "tarjeta";
  notas?: string;
  items: ItemIn[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as PedidoIn;
    if (!body?.sucursal_id || !body?.cliente_nombre || !Array.isArray(body.items) || body.items.length === 0) {
      return new Response(JSON.stringify({ error: "Payload inválido: sucursal_id, cliente_nombre e items requeridos" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // validar productos y precios actuales
    const ids = body.items.map((i) => i.producto_id);
    const { data: productos, error: prodErr } = await supabase
      .from("productos").select("id,precio,activo").in("id", ids);
    if (prodErr) throw prodErr;
    const mapaPrecio = new Map<string, number>();
    for (const p of productos ?? []) {
      if (p.activo === false) {
        return new Response(JSON.stringify({ error: `Producto inactivo: ${p.id}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      mapaPrecio.set(p.id as string, p.precio as number);
    }
    for (const it of body.items) {
      if (!mapaPrecio.has(it.producto_id) || !it.cantidad || it.cantidad <= 0) {
        return new Response(JSON.stringify({ error: `Item inválido: ${it.producto_id}` }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const subtotal = body.items.reduce(
      (a, it) => a + (mapaPrecio.get(it.producto_id) ?? 0) * it.cantidad, 0,
    );
    const costo_despacho = body.costo_despacho ?? 0;
    const total = subtotal + costo_despacho;

    const { data: pedido, error: pedErr } = await supabase
      .from("pedidos")
      .insert({
        turno_id: null,
        sucursal_id: body.sucursal_id,
        cliente_nombre: body.cliente_nombre,
        cliente_telefono: body.cliente_telefono ?? null,
        tipo: body.tipo ?? "despacho",
        direccion_entrega: body.direccion_entrega ?? null,
        referencia_entrega: body.referencia_entrega ?? null,
        latitud_entrega: body.latitud_entrega ?? null,
        longitud_entrega: body.longitud_entrega ?? null,
        distancia_km: body.distancia_km ?? null,
        costo_despacho,
        subtotal,
        total,
        metodo_pago: body.metodo_pago ?? "efectivo",
        notas: body.notas ?? null,
        estado: "en_preparacion",
        origen: "online",
        estado_confirmacion: "pendiente_confirmacion",
      })
      .select("id")
      .single();
    if (pedErr) throw pedErr;

    const itemsRows = body.items.map((it) => ({
      pedido_id: pedido!.id,
      producto_id: it.producto_id,
      cantidad: it.cantidad,
      precio_unitario: mapaPrecio.get(it.producto_id) ?? 0,
      subtotal: (mapaPrecio.get(it.producto_id) ?? 0) * it.cantidad,
      notas: it.notas ?? null,
    }));
    const { error: itErr } = await supabase.from("pedido_items").insert(itemsRows);
    if (itErr) throw itErr;

    return new Response(JSON.stringify({ pedido_id: pedido!.id, subtotal, total }), {
      status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("recibir-pedido-online error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});