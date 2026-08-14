[CmdletBinding()]
param(
  [switch]$KeepWorkdir
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$sourceSupabase = Join-Path $repositoryRoot 'supabase'
$sourceConfig = Join-Path $sourceSupabase 'config.toml'
$sourceMigrations = Join-Path $sourceSupabase 'migrations'
$sourceFunctions = Join-Path $sourceSupabase 'functions'

if (-not (Test-Path -LiteralPath $sourceConfig)) {
  throw "Missing Supabase config: $sourceConfig"
}

if (-not (Test-Path -LiteralPath $sourceMigrations)) {
  throw "Missing migrations directory: $sourceMigrations"
}

if (-not (Test-Path -LiteralPath $sourceFunctions)) {
  throw "Missing Edge Functions directory: $sourceFunctions"
}

$containerRuntime = Get-Command docker -ErrorAction SilentlyContinue
if (-not $containerRuntime) {
  $containerRuntime = Get-Command podman -ErrorAction SilentlyContinue
}
if (-not $containerRuntime) {
  throw 'Local bootstrap requires Docker Desktop or Podman on PATH. No remote fallback is allowed.'
}

$supabaseCli = Get-Command npx.cmd -ErrorAction SilentlyContinue
if (-not $supabaseCli) {
  throw 'npx.cmd is required to run the pinned Supabase CLI workflow.'
}

$runId = [guid]::NewGuid().ToString('N').Substring(0, 12)
$localProjectId = "dlitro_bootstrap_$runId"
$sandboxRoot = Join-Path ([System.IO.Path]::GetTempPath()) $localProjectId
$sandboxSupabase = Join-Path $sandboxRoot 'supabase'
$sandboxMigrations = Join-Path $sandboxSupabase 'migrations'
$startAttempted = $false

function Get-ExcludedTcpPortRanges {
  $ranges = @()
  $output = & netsh interface ipv4 show excludedportrange protocol=tcp
  foreach ($line in $output) {
    if ($line -match '^\s*(\d+)\s+(\d+)(?:\s+\*)?\s*$') {
      $ranges += [pscustomobject]@{
        Start = [int]$Matches[1]
        End = [int]$Matches[2]
      }
    }
  }
  return $ranges
}

function Test-LocalTcpPortAvailable {
  param(
    [Parameter(Mandatory)] [int]$Port,
    [Parameter(Mandatory)] [object[]]$ExcludedRanges
  )

  foreach ($range in $ExcludedRanges) {
    if ($Port -ge $range.Start -and $Port -le $range.End) {
      return $false
    }
  }

  if (Get-NetTCPConnection -LocalPort $Port -ErrorAction SilentlyContinue) {
    return $false
  }

  $listener = $null
  try {
    $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
    $listener.Start()
    return $true
  }
  catch {
    return $false
  }
  finally {
    if ($null -ne $listener) {
      $listener.Stop()
    }
  }
}

function Set-TomlIntegerValue {
  param(
    [Parameter(Mandatory)] [string]$Text,
    [Parameter(Mandatory)] [string]$Section,
    [Parameter(Mandatory)] [string]$Key,
    [Parameter(Mandatory)] [int]$Value
  )

  $newline = if ($Text.Contains("`r`n")) { "`r`n" } else { "`n" }
  $lines = [System.Collections.Generic.List[string]]::new()
  foreach ($line in ($Text -split '\r?\n')) {
    $lines.Add($line)
  }

  $sectionHeader = "[$Section]"
  $sectionIndex = $lines.IndexOf($sectionHeader)
  if ($sectionIndex -lt 0) {
    if ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -ne '') {
      $lines.Add('')
    }
    $lines.Add($sectionHeader)
    $lines.Add("$Key = $Value")
    return $lines -join $newline
  }

  $nextSectionIndex = $lines.Count
  for ($index = $sectionIndex + 1; $index -lt $lines.Count; $index++) {
    if ($lines[$index] -match '^\s*\[') {
      $nextSectionIndex = $index
      break
    }
  }

  for ($index = $sectionIndex + 1; $index -lt $nextSectionIndex; $index++) {
    if ($lines[$index] -match "^\s*$([regex]::Escape($Key))\s*=") {
      $lines[$index] = "$Key = $Value"
      return $lines -join $newline
    }
  }

  $lines.Insert($nextSectionIndex, "$Key = $Value")
  return $lines -join $newline
}

$resolvedTempRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath())
$resolvedSandboxRoot = [System.IO.Path]::GetFullPath($sandboxRoot)
if (-not $resolvedSandboxRoot.StartsWith($resolvedTempRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to use a disposable directory outside the system temp root: $resolvedSandboxRoot"
}

New-Item -ItemType Directory -Path $sandboxMigrations -Force | Out-Null
Copy-Item -LiteralPath $sourceConfig -Destination (Join-Path $sandboxSupabase 'config.toml')
Copy-Item -Path (Join-Path $sourceMigrations '*.sql') -Destination $sandboxMigrations
Copy-Item -LiteralPath $sourceFunctions -Destination $sandboxSupabase -Recurse

$sandboxConfig = Join-Path $sandboxSupabase 'config.toml'
$configText = Get-Content -Raw -LiteralPath $sandboxConfig
$configText = $configText -replace '(?m)^project_id\s*=\s*"[^"]+"', "project_id = `"$localProjectId`""

Write-Output 'Port 54322 diagnostic (Get-NetTCPConnection):'
Get-NetTCPConnection -LocalPort 54322 -ErrorAction SilentlyContinue | Format-Table -AutoSize | Out-String | Write-Output
Write-Output 'Port 54322 diagnostic (netstat):'
& cmd.exe /c 'netstat -ano | findstr :54322'
Write-Output 'Excluded IPv4 TCP port ranges:'
& netsh interface ipv4 show excludedportrange protocol=tcp

$excludedRanges = @(Get-ExcludedTcpPortRanges)
$defaultDbPortAvailable = Test-LocalTcpPortAvailable -Port 54322 -ExcludedRanges $excludedRanges
$selectedPorts = [ordered]@{
  'db.shadow_port' = 54320
  'api.port' = 54321
  'db.port' = 54322
  'studio.port' = 54323
  'inbucket.port' = 54324
  'inbucket.smtp_port' = 54325
  'inbucket.pop3_port' = 54326
  'analytics.port' = 54327
  'analytics.vector_port' = 54328
  'db.pooler.port' = 54329
}

if (-not $defaultDbPortAvailable) {
  $alternativeBase = $null
  for ($candidateBase = 45000; $candidateBase -le 49000; $candidateBase += 20) {
    $candidatePorts = 0..9 | ForEach-Object { $candidateBase + $_ }
    $allAvailable = $true
    foreach ($candidatePort in $candidatePorts) {
      if (-not (Test-LocalTcpPortAvailable -Port $candidatePort -ExcludedRanges $excludedRanges)) {
        $allAvailable = $false
        break
      }
    }
    if ($allAvailable) {
      $alternativeBase = $candidateBase
      break
    }
  }

  if ($null -eq $alternativeBase) {
    throw 'No free, non-excluded block of 10 local TCP ports was found between 45000 and 49009.'
  }

  $offset = 0
  foreach ($name in @($selectedPorts.Keys)) {
    $selectedPorts[$name] = $alternativeBase + $offset
    $offset++
  }

  foreach ($entry in $selectedPorts.GetEnumerator()) {
    $parts = $entry.Key.Split('.')
    $key = $parts[-1]
    $section = ($parts[0..($parts.Length - 2)] -join '.')
    $configText = Set-TomlIntegerValue -Text $configText -Section $section -Key $key -Value $entry.Value
  }
}

foreach ($entry in $selectedPorts.GetEnumerator()) {
  if (-not (Test-LocalTcpPortAvailable -Port $entry.Value -ExcludedRanges $excludedRanges)) {
    throw "Selected local port is no longer available: $($entry.Key)=$($entry.Value)"
  }
}

[System.IO.File]::WriteAllText($sandboxConfig, $configText, [System.Text.UTF8Encoding]::new($false))

Write-Output "Disposable workdir: $sandboxRoot"
Write-Output "Local project ID: $localProjectId"
Write-Output "Selected local ports: $(($selectedPorts.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', ')"
Write-Output 'Safety: local target only; seeds disabled; functions copied; no environment or data files copied.'

try {
  $startAttempted = $true
  & npx.cmd supabase start --workdir $sandboxRoot
  if ($LASTEXITCODE -ne 0) {
    throw "supabase start failed with exit code $LASTEXITCODE"
  }
  & npx.cmd supabase db reset --local --no-seed --workdir $sandboxRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Migration replay stopped at the first error (exit code $LASTEXITCODE)"
  }

  & npx.cmd supabase db lint --local --schema public --level error --fail-on error --workdir $sandboxRoot
  if ($LASTEXITCODE -ne 0) {
    throw "Database lint failed with exit code $LASTEXITCODE"
  }

  Write-Output 'Bootstrap succeeded on a clean disposable local database.'
}
finally {
  if ($startAttempted) {
    & npx.cmd supabase stop --project-id $localProjectId --no-backup --workdir $sandboxRoot
  }

  if ($KeepWorkdir) {
    Write-Output "Preserved disposable workdir: $sandboxRoot"
  }
  elseif (Test-Path -LiteralPath $sandboxRoot) {
    Remove-Item -LiteralPath $sandboxRoot -Recurse -Force
  }
}
