[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$targetRef = 'suscxwjloggmbsqdlgpj'
$productionRef = 'uwymxjmyasnlmkitzvej'
$linkedRef = (Get-Content -Raw 'supabase\.temp\project-ref').Trim()
if ($linkedRef -ne $targetRef -or $linkedRef -eq $productionRef) {
  throw "SAFETY_STOP: expected Preview Branch $targetRef"
}

$envValues = @{}
foreach ($line in Get-Content '.env.staging') {
  if ($line -match '^\s*([^#][^=]*)=(.*)$') {
    $envValues[$Matches[1].Trim()] = $Matches[2].Trim().Trim('"').Trim("'")
  }
}

$baseUrl = $envValues['VITE_SUPABASE_URL']
$publishableKey = $envValues['VITE_SUPABASE_PUBLISHABLE_KEY']
if ($baseUrl -ne "https://$targetRef.supabase.co" -or -not $publishableKey) {
  throw 'SAFETY_STOP: invalid staging URL or missing publishable key'
}

$headers = @{ apikey = $publishableKey; 'Content-Type' = 'application/json' }
$emailA = "rls-v1-a@$targetRef.test"
$emailB = "rls-v1-b@$targetRef.test"
$passwordA = "RlsV1-A!$([guid]::NewGuid().ToString('N'))"
$passwordB = "RlsV1-B!$([guid]::NewGuid().ToString('N'))"

function Invoke-CliSqlFile([string]$file) {
  & npx.cmd supabase db query --linked --project-ref $targetRef --file $file --output json | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Supabase SQL file failed: $file" }
}

function Invoke-AuthPost([string]$path, [hashtable]$body) {
  try {
    Invoke-RestMethod -Method Post -Uri "$baseUrl/auth/v1/$path" -Headers $headers -Body ($body | ConvertTo-Json -Compress)
  }
  catch {
    $detail = $_.Exception.Message
    if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) {
      $detail = $_.ErrorDetails.Message
    }
    throw "Auth request failed at $path`: $detail"
  }
}

function New-User([string]$email, [string]$password) {
  Invoke-AuthPost 'signup' @{ email = $email; password = $password } | Out-Null
}

function Login([string]$email, [string]$password) {
  Invoke-AuthPost 'token?grant_type=password' @{ email = $email; password = $password }
}

function Rest([string]$method, [string]$path, [string]$token, $body = $null, [hashtable]$extraHeaders = @{}) {
  $requestHeaders = @{ apikey = $publishableKey; Authorization = "Bearer $token" }
  foreach ($entry in $extraHeaders.GetEnumerator()) { $requestHeaders[$entry.Key] = $entry.Value }
  $params = @{ Method = $method; Uri = "$baseUrl/rest/v1/$path"; Headers = $requestHeaders }
  if ($null -ne $body) {
    $requestHeaders['Content-Type'] = 'application/json'
    $params.Body = $body | ConvertTo-Json -Compress
  }
  try {
    Invoke-RestMethod @params
  }
  catch {
    $detail = $_.Exception.Message
    if ($null -ne $_.ErrorDetails -and $_.ErrorDetails.Message) {
      $detail = $_.ErrorDetails.Message
    }
    elseif ($null -ne $_.Exception.Response) {
      $stream = $_.Exception.Response.GetResponseStream()
      if ($null -ne $stream) {
        $reader = [System.IO.StreamReader]::new($stream)
        $responseText = $reader.ReadToEnd()
        if ($responseText) { $detail = $responseText }
      }
    }
    throw "REST $method $path failed: $detail"
  }
}

Invoke-CliSqlFile 'supabase/tests/authorization_rls_hardening_v1_auth_cleanup.sql'
Invoke-CliSqlFile 'supabase/tests/authorization_rls_hardening_v1_auth_setup.sql'

$passwordSql = "update auth.users set encrypted_password = case email when '$emailA' then crypt('$passwordA', gen_salt('bf')) when '$emailB' then crypt('$passwordB', gen_salt('bf')) else encrypted_password end, updated_at = now() where email in ('$emailA', '$emailB');"
& npx.cmd supabase db query --linked --project-ref $targetRef --output json $passwordSql | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not assign ephemeral passwords to synthetic Auth users' }

$loginA = Login $emailA $passwordA
$loginB = Login $emailB $passwordB
if (-not $loginA.access_token -or -not $loginB.access_token) { throw 'Login A/B did not return access tokens' }
Write-Output 'PASS login: usuarios A y B'

$profileA = @(Rest Get "usuarios?select=id,sucursal_id,rol&id=eq.$($loginA.user.id)" $loginA.access_token)
$profileB = @(Rest Get "usuarios?select=id,sucursal_id,rol&id=eq.$($loginB.user.id)" $loginB.access_token)
if ($profileA.Count -ne 1 -or $profileB.Count -ne 1) { throw 'Each user must see exactly one own profile in this fixture' }

$branchA = $profileA[0].sucursal_id
$dispatcher = @(Rest Get "usuarios?select=id&rol=eq.despachador&sucursal_id=eq.$branchA&activo=is.true&limit=1" $loginA.access_token)
if ($dispatcher.Count -ne 1) { throw 'Sucursal A requires one existing active dispatcher for the E2E flow' }

$turn = Rest Post 'turnos?select=id,sucursal_id,numero_ultimo_pedido' $loginA.access_token @{
  sucursal_id = $branchA
  tomador_id = $profileA[0].id
  caja_chica_apertura = 0
  estado = 'abierto'
} @{ Prefer = 'return=representation' }
$turn = @($turn)[0]
Write-Output 'PASS apertura de turno'

Rest Post 'turno_despachadores?select=id' $loginA.access_token @{
  turno_id = $turn.id
  despachador_id = $dispatcher[0].id
  activo = $true
} @{ Prefer = 'return=representation' } | Out-Null
Write-Output 'PASS selección de despachador'

$order = Rest Post 'pedidos?select=id,numero_pedido,sucursal_id' $loginA.access_token @{
  turno_id = $turn.id
  sucursal_id = $branchA
  tomador_id = $profileA[0].id
  cliente_nombre = 'RLS V1 E2E'
  tipo = 'retiro'
  subtotal = 0
  descuento = 0
  costo_despacho = 0
  total = 0
  metodo_pago = 'efectivo'
} @{ Prefer = 'return=representation' }
$order = @($order)[0]
if (-not $order.id -or -not $order.numero_pedido) { throw 'Order trigger did not assign numero_pedido' }
Write-Output 'PASS creación de pedido y trigger de numeración'

Invoke-CliSqlFile 'supabase/tests/authorization_rls_hardening_v1_e2e_cleanup.sql'
Write-Output 'PASS limpieza de datos transitorios E2E; usuarios A/B y Sucursal B conservados'
