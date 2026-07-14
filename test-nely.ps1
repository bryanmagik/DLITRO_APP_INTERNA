$headers = @{
    'x-nely-api-key' = 'dlitro-nely-2026-key'
    'Content-Type' = 'application/json'
    'apikey' = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV3eW14am15YXNubG1raXR6dmVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTcwNTksImV4cCI6MjA5MzU5MzA1OX0._bVrkREq5NDRiw09_ygILCocmJHHUZhdX_zdKMMN_ow'
}

$body = '{"sucursal_id":"d5b2f695-5273-4b63-8244-6f1491ad053e","cliente_nombre":"Test NELY","cliente_telefono":"+56912345678","tipo":"despacho","direccion_entrega":"Av. Las Torres 1234","items":[{"producto_nombre":"Mojito Cubano","cantidad":1,"notas":""}]}'

try {
    $response = Invoke-WebRequest -Uri 'https://uwymxjmyasnlmkitzvej.supabase.co/functions/v1/recibir-pedido-nely' -Method POST -Headers $headers -Body $body -UseBasicParsing
    Write-Output $response.Content
} catch {
    if ($_.ErrorDetails.Message) {
        Write-Output $_.ErrorDetails.Message
    } elseif ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Output $reader.ReadToEnd()
    } else {
        Write-Output $_.Exception.Message
    }
}
