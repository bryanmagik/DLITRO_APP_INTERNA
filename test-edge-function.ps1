# ============================================================
# TEST: recibir-pedido-nely Edge Function
# Instrucciones: Rellena NELY_API_KEY y corre este script
# ============================================================

$SUPABASE_URL   = "https://uwymxjmyasnlmkitzvej.supabase.co"
$ANON_KEY       = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3eW14am15YXNubG1raXR6dmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTcwNTksImV4cCI6MjA5MzU5MzA1OX0._bVrkREq5NDRiw09_ygILCocmJHHUZhdX_zdKMMN_ow"
$NELY_API_KEY   = "dlitro-nely-2026-key"
$FUNCTION_URL   = "$SUPABASE_URL/functions/v1/recibir-pedido-nely"

# ─── Obtener datos reales de Supabase ─────────────────────
Write-Host "`n📋 Obteniendo sucursales activas..." -ForegroundColor Cyan
$sucursales = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/sucursales?select=id,nombre&limit=5" `
    -Headers @{ "apikey" = $ANON_KEY; "Authorization" = "Bearer $ANON_KEY" }
$sucursales | Format-Table

Write-Host "📋 Obteniendo productos activos..." -ForegroundColor Cyan
$productos = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/productos?select=nombre,precio&activo=eq.true&limit=5" `
    -Headers @{ "apikey" = $ANON_KEY; "Authorization" = "Bearer $ANON_KEY" }
$productos | Format-Table

Write-Host "📋 Obteniendo tarifas_despacho..." -ForegroundColor Cyan
$tarifas = Invoke-RestMethod -Uri "$SUPABASE_URL/rest/v1/tarifas_despacho?select=tramo,distancia_desde,distancia_hasta,precio&order=tramo" `
    -Headers @{ "apikey" = $ANON_KEY; "Authorization" = "Bearer $ANON_KEY" }
$tarifas | Format-Table

# ─── Usar primera sucursal y primer producto ───────────────
$SUCURSAL_ID    = $sucursales[0].id
$PRODUCTO_NOMBRE = $productos[0].nombre

Write-Host "`n✅ Usando: Sucursal '$($sucursales[0].nombre)' | Producto '$PRODUCTO_NOMBRE'" -ForegroundColor Yellow
Write-Host "   ID Sucursal: $SUCURSAL_ID`n"

$headers = @{
    "Content-Type"    = "application/json"
    "apikey"          = $ANON_KEY
    "Authorization"   = "Bearer $ANON_KEY"
    "x-nely-api-key"  = $NELY_API_KEY
}

# ─────────────────────────────────────────────────────────────
# TEST 1: RETIRO sin distancia (costo_despacho debe ser $0)
# ─────────────────────────────────────────────────────────────
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " TEST 1: RETIRO (costo_despacho = \$0)" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

$body1 = @{
    sucursal_id      = $SUCURSAL_ID
    cliente_nombre   = "Test Retiro"
    cliente_telefono = "+56912341001"
    tipo             = "retiro"
    notas            = "Test automático - retiro"
    items            = @(
        @{ producto_nombre = $PRODUCTO_NOMBRE; cantidad = 1; notas = "" }
    )
} | ConvertTo-Json -Depth 5

try {
    $r1 = Invoke-RestMethod -Method POST -Uri $FUNCTION_URL -Headers $headers -Body $body1
    Write-Host "✅ ÉXITO:" -ForegroundColor Green
    $r1 | ConvertTo-Json
} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $_.ErrorDetails.Message
}

# ─────────────────────────────────────────────────────────────
# TEST 2: DESPACHO con distancia_km = 2.3 km (busca tarifa en tabla)
# ─────────────────────────────────────────────────────────────
Write-Host "`n═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " TEST 2: DESPACHO con distancia_km=2.3" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

$body2 = @{
    sucursal_id      = $SUCURSAL_ID
    cliente_nombre   = "Test Despacho Cercano"
    cliente_telefono = "+56912341002"
    tipo             = "despacho"
    direccion_entrega = "Av. Providencia 1234, Santiago"
    distancia_km     = 2.3
    notas            = "Test automático - despacho 2.3 km"
    items            = @(
        @{ producto_nombre = $PRODUCTO_NOMBRE; cantidad = 2; notas = "sin hielo" }
    )
} | ConvertTo-Json -Depth 5

try {
    $r2 = Invoke-RestMethod -Method POST -Uri $FUNCTION_URL -Headers $headers -Body $body2
    Write-Host "✅ ÉXITO:" -ForegroundColor Green
    $r2 | ConvertTo-Json
} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $_.ErrorDetails.Message
}

# ─────────────────────────────────────────────────────────────
# TEST 3: DESPACHO con distancia_km = 8.5 km (tramo lejano)
# ─────────────────────────────────────────────────────────────
Write-Host "`n═══════════════════════════════════════" -ForegroundColor Magenta
Write-Host " TEST 3: DESPACHO con distancia_km=8.5" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════" -ForegroundColor Magenta

$body3 = @{
    sucursal_id      = $SUCURSAL_ID
    cliente_nombre   = "Test Despacho Lejano"
    cliente_telefono = "+56912341003"
    tipo             = "despacho"
    direccion_entrega = "Av. Grecia 500, Macul, Santiago"
    distancia_km     = 8.5
    notas            = "Test automático - despacho 8.5 km"
    items            = @(
        @{ producto_nombre = $PRODUCTO_NOMBRE; cantidad = 1; notas = "" }
    )
} | ConvertTo-Json -Depth 5

try {
    $r3 = Invoke-RestMethod -Method POST -Uri $FUNCTION_URL -Headers $headers -Body $body3
    Write-Host "✅ ÉXITO:" -ForegroundColor Green
    $r3 | ConvertTo-Json
} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $_.ErrorDetails.Message
}

# ─────────────────────────────────────────────────────────────
# TEST 4: DESPACHO sin distancia_km (costo_despacho = $0, ajuste manual)
# ─────────────────────────────────────────────────────────────
Write-Host "`n═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host " TEST 4: DESPACHO sin distancia_km (manual=\$0)" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta

$body4 = @{
    sucursal_id      = $SUCURSAL_ID
    cliente_nombre   = "Test Sin Distancia"
    cliente_telefono = "+56912341004"
    tipo             = "despacho"
    direccion_entrega = "Calle Desconocida 999, Santiago"
    notas            = "Test automático - sin distancia_km"
    items            = @(
        @{ producto_nombre = $PRODUCTO_NOMBRE; cantidad = 1; notas = "" }
    )
} | ConvertTo-Json -Depth 5

try {
    $r4 = Invoke-RestMethod -Method POST -Uri $FUNCTION_URL -Headers $headers -Body $body4
    Write-Host "✅ ÉXITO:" -ForegroundColor Green
    $r4 | ConvertTo-Json
} catch {
    Write-Host "❌ ERROR: $($_.Exception.Message)" -ForegroundColor Red
    $_.ErrorDetails.Message
}

Write-Host "`n✅ Tests completados. Revisa los pedidos creados en Supabase." -ForegroundColor Green
Write-Host "   https://supabase.com/dashboard/project/uwymxjmyasnlmkitzvej/editor" -ForegroundColor Cyan
