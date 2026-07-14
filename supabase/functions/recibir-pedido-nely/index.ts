import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * POST /functions/v1/recibir-pedido-nely
 *
 * Body (campos relevantes):
 * - sucursal_id, cliente_nombre, cliente_telefono, tipo, items, metodo_pago, ...
 * - jarros_entregados: INT (opcional, default 0)
 *     Número de jarros retornables que entrega el cliente.
 *     - Cada 4 jarros = 1 trago gratis (el más caro)
 *     - Jarros sobrantes (módulo 4) = $1.000 descuento c/u
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-nely-api-key',
}

/** Descuento por jarros — idéntico a la app de escritorio. */
function calcularDescuentoJarros(
  jarros: number,
  items: Array<{ precio_unitario: number; cantidad: number }>,
): number {
  if (jarros <= 0) return 0

  const itemsPagos = items.filter((it) => it.precio_unitario > 0)
  const totalProductos = items.reduce((acc, it) => acc + Number(it.cantidad || 0), 0)
  const tragosGratis = Math.min(Math.floor(jarros / 4), totalProductos)
  const sobrantes = jarros % 4

  const precios: number[] = []
  for (const it of itemsPagos) {
    for (let i = 0; i < it.cantidad; i++) precios.push(it.precio_unitario)
  }
  precios.sort((a, b) => b - a)

  const descuentoTragos = precios.slice(0, tragosGratis).reduce((a, p) => a + p, 0)
  const descuentoSobrantes = sobrantes * 1000
  return descuentoTragos + descuentoSobrantes
}

// Busca el costo de despacho en tarifas_despacho según la distancia en km
async function calcularCostoDespacho(
  supabase: ReturnType<typeof createClient>,
  distanciaKm: number
): Promise<number> {
  const { data: tarifas } = await supabase
    .from('tarifas_despacho')
    .select('*')
    .order('tramo')

  if (!tarifas || tarifas.length === 0) {
    console.log('tarifas_despacho vacía — usando fallback $2500')
    return 2500
  }

  const tarifa = tarifas.find(
    (t: { distancia_desde: number; distancia_hasta: number }) =>
      distanciaKm >= Number(t.distancia_desde) && distanciaKm < Number(t.distancia_hasta)
  )

  if (!tarifa) {
    // Distancia supera el último tramo → precio del último tramo
    const ultimo = tarifas[tarifas.length - 1]
    console.log(`distancia ${distanciaKm} km supera todos los tramos → precio último tramo: ${ultimo.precio}`)
    return ultimo.precio
  }

  console.log(`Tramo encontrado para ${distanciaKm} km → $${tarifa.precio}`)
  return tarifa.precio
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verificar API Key de NELY
    const nelyKey = req.headers.get('x-nely-api-key')
    const nelyApiKey = Deno.env.get('NELY_API_KEY')

    if (!nelyKey || nelyKey !== nelyApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'API Key inválida' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const body = await req.json()
    const {
      sucursal_id,
      cliente_nombre,
      cliente_telefono,
      tipo,
      direccion_entrega,
      distancia_km,
      referencia_entrega,
      notas,
      items,
      metodo_pago,
      jarros_entregados,
    } = body

    console.log('Body recibido:', JSON.stringify(body))

    const jarrosEntregados = Math.max(0, Math.floor(Number(jarros_entregados ?? 0)) || 0)

    const metodoPago: string = metodo_pago || 'efectivo'
    const metodosValidos = ['efectivo', 'transferencia', 'tarjeta']
    if (!metodosValidos.includes(metodoPago)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'metodo_pago inválido. Valores permitidos: efectivo, transferencia, tarjeta',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const tipoEntrega: string = tipo || 'despacho'

    if (metodoPago === 'tarjeta' && tipoEntrega === 'despacho') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'El pago con tarjeta solo está disponible para retiro en el local',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar campos requeridos
    if (!sucursal_id || !cliente_nombre || !cliente_telefono || !items || items.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Faltan campos requeridos: sucursal_id, cliente_nombre, cliente_telefono, items',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (body.tipo === 'despacho' && !body.direccion_entrega) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Se requiere direccion_entrega para pedidos de despacho.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (body.tipo === 'despacho' && (!body.distancia_km || body.distancia_km <= 0)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Se requiere distancia_km para pedidos de despacho. Calcular con Google Maps antes de enviar.',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verificar que la sucursal existe
    const { data: sucursal } = await supabase
      .from('sucursales')
      .select('id, nombre')
      .eq('id', sucursal_id)
      .eq('activo', true)
      .single()

    if (!sucursal) {
      return new Response(
        JSON.stringify({ success: false, error: 'Sucursal no encontrada o inactiva' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ─── Calcular costo de despacho ───────────────────────────────────────────
    let costoDespacho = 0
    const distanciaKmNum: number | null =
      distancia_km !== undefined && distancia_km !== null ? Number(distancia_km) : null

    if (tipoEntrega === 'retiro') {
      // Retiro siempre gratis
      costoDespacho = 0
      console.log('Tipo retiro → costo_despacho = 0')
    } else if (tipoEntrega === 'despacho' && distanciaKmNum !== null && !isNaN(distanciaKmNum)) {
      // Despacho con distancia conocida → consultar tarifas
      costoDespacho = await calcularCostoDespacho(supabase, distanciaKmNum)
      console.log(`Despacho ${distanciaKmNum} km → costo_despacho = ${costoDespacho}`)
    } else {
      // Despacho sin distancia_km → el tomador ajusta manualmente
      costoDespacho = 0
      console.log('Tipo despacho sin distancia_km → costo_despacho = 0 (ajuste manual)')
    }
    // ─────────────────────────────────────────────────────────────────────────

    // Buscar productos y armar items del pedido
    let subtotal = 0
    const pedidoItems: Array<{
      producto_id: string
      cantidad: number
      precio_unitario: number
      subtotal: number
      notas: string | null
    }> = []

    for (const item of items) {
      console.log('Buscando producto:', item.producto_nombre)

      const { data: producto, error: productoError } = await supabase
        .from('productos')
        .select('id, nombre, precio')
        .eq('nombre', item.producto_nombre)
        .eq('activo', true)
        .single()

      console.log('Resultado producto:', JSON.stringify(producto))
      if (productoError) console.log('Error producto:', JSON.stringify(productoError))

      if (!producto) {
        return new Response(
          JSON.stringify({ success: false, error: `Producto no encontrado: ${item.producto_nombre}` }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Procesar extras
      let sumaExtras = 0
      const extrasNombres: string[] = []

      if (item.extras && Array.isArray(item.extras)) {
        for (const extraNombre of item.extras) {
          const extra = String(extraNombre ?? '').trim()
          if (!extra) continue

          console.log('Buscando sabor extra:', extra)

          const { data: sabor } = await supabase
            .from('sabores_extra')
            .select('id, nombre, precio')
            .ilike('nombre', `%${extra}%`)
            .eq('activo', true)
            .maybeSingle()

          if (!sabor) {
            return new Response(
              JSON.stringify({ success: false, error: `Sabor extra no encontrado: ${extra}` }),
              { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
          }

          sumaExtras += sabor.precio
          extrasNombres.push(sabor.nombre)
        }
      }

      const precioUnitario = producto.precio + sumaExtras
      const itemSubtotal = precioUnitario * item.cantidad
      subtotal += itemSubtotal

      let notasItem: string | null = item.notas?.trim() || null
      if (extrasNombres.length > 0) {
        const extrasNota = `Extras: ${extrasNombres.join(', ')}`
        notasItem = notasItem ? `${extrasNota} · ${notasItem}` : extrasNota
      }

      pedidoItems.push({
        producto_id: producto.id,
        cantidad: item.cantidad,
        precio_unitario: precioUnitario,
        subtotal: itemSubtotal,
        notas: notasItem,
      })
    }

    const descuento = calcularDescuentoJarros(jarrosEntregados, pedidoItems)
    const total = Math.max(0, subtotal + costoDespacho - descuento)

    console.log(
      `subtotal=${subtotal} | costo_despacho=${costoDespacho} | jarros=${jarrosEntregados} | descuento=${descuento} | total=${total}`,
    )

    // Crear el pedido
    const { data: pedido, error: pedidoError } = await supabase
      .from('pedidos')
      .insert({
        turno_id: null,
        sucursal_id,
        cliente_nombre,
        cliente_telefono,
        tipo: tipoEntrega,
        direccion_entrega: direccion_entrega || null,
        referencia_entrega: referencia_entrega || null,
        estado: 'en_preparacion',
        subtotal,
        descuento,
        costo_despacho: costoDespacho,
        total,
        metodo_pago: metodoPago,
        notas: notas || null,
        origen: 'nely',
        estado_confirmacion: 'pendiente_confirmacion',
        jarros_entregados: jarrosEntregados,
      })
      .select()
      .single()

    if (pedidoError) {
      console.log('Error creando pedido:', JSON.stringify(pedidoError))
      return new Response(
        JSON.stringify({ success: false, error: pedidoError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Insertar items del pedido
    const itemsConPedidoId = pedidoItems.map(item => ({ ...item, pedido_id: pedido.id }))

    const { error: itemsError } = await supabase
      .from('pedido_items')
      .insert(itemsConPedidoId)

    if (itemsError) {
      console.log('Error insertando items:', JSON.stringify(itemsError))
      return new Response(
        JSON.stringify({ success: false, error: itemsError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const numeroReferencia = `NELY-${Date.now().toString().slice(-6)}`

    return new Response(
      JSON.stringify({
        success: true,
        pedido_id: pedido.id,
        numero_referencia: numeroReferencia,
        costo_despacho: costoDespacho,
        distancia_km: distanciaKmNum,
        metodo_pago: metodoPago,
        jarros_entregados: jarrosEntregados,
        descuento,
        total,
        mensaje: 'Pedido recibido correctamente.',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.log('Error interno:', error)
    return new Response(
      JSON.stringify({ success: false, error: 'Error interno del servidor' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
