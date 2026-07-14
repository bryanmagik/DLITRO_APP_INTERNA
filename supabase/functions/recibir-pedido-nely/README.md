# Deploy de la Edge Function

1. Instalar Supabase CLI: npm install -g supabase
2. Login: supabase login
3. Link proyecto: supabase link --project-ref uwymxjmyasnlmkitzvej
4. Deploy: supabase functions deploy recibir-pedido-nely --no-verify-jwt
5. Agregar secret en Supabase Dashboard → Settings → Edge Functions:
   NELY_API_KEY=una-clave-secreta-segura

# Endpoint resultante
POST https://uwymxjmyasnlmkitzvej.supabase.co/functions/v1/recibir-pedido-nely

# Headers requeridos
x-nely-api-key: TU_NELY_API_KEY
Content-Type: application/json
apikey: TU_SUPABASE_ANON_KEY

# Body de ejemplo
{
  "sucursal_id": "uuid-sucursal",
  "cliente_nombre": "Juan Pérez",
  "cliente_telefono": "+56912345678",
  "tipo": "despacho",
  "direccion_entrega": "Av. Las Torres 1234",
  "distancia_km": 2.5,
  "referencia_entrega": "Portón azul",
  "notas": "Sin hielo",
  "metodo_pago": "efectivo",
  "jarros_entregados": 4,
  "items": [
    {
      "producto_nombre": "Mojito Cubano",
      "cantidad": 2,
      "extras": ["Pulpa de mango", "Pulpa de frutilla"],
      "notas": "sin hielo"
    },
    { "producto_nombre": "Berries Colada", "cantidad": 1, "notas": "" }
  ]
}

## Campos opcionales

### `jarros_entregados` — INT (opcional, default 0)

Número de jarros retornables que entrega el cliente.

- Cada 4 jarros = 1 trago gratis (el más caro del pedido)
- Jarros sobrantes (módulo 4) = $1.000 de descuento c/u
- Si no se envía, default `0` (sin descuento)
- Se guarda en `pedidos.jarros_entregados` y el descuento en `pedidos.descuento`
- `total` = `subtotal` + `costo_despacho` - `descuento` (mínimo 0)

Ejemplo: 4 jarros + 1 Mojito ($11.000) + 1 Colada ($13.000) → 1 trago gratis (Colada) → descuento $13.000.

## Sabores extra (opcional por ítem)

Cada ítem puede incluir `extras`: array de nombres de sabores en `sabores_extra`. Se buscan con `ILIKE` y deben estar activos.

- `precio_unitario` = precio del producto + suma de precios de extras
- `subtotal` = `precio_unitario` × `cantidad`
- Los extras se guardan en `pedido_items.notas` como: `Extras: Pulpa de mango, Pulpa de frutilla`

Ejemplo de cálculo (Mojito $11.000 + mango $1.000 + frutilla $1.000, cantidad 2):

- `precio_unitario`: $13.000
- `subtotal`: $26.000

Si un extra no existe: HTTP 404 `{ "success": false, "error": "Sabor extra no encontrado: {nombre}" }`
