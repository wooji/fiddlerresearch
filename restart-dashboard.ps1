# Failsafe #1: single-server guarantee.
# Kills EVERY dashboard-server process (incl stale non --watch ones holding the port),
# then launches exactly ONE instance with --watch, and verifies it is live before exiting.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host "[restart-dashboard] killing existing dashboard-server processes..."
$procs = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*dashboard-server*' -and $_.CommandLine -notlike '*restart-dashboard*' }
foreach ($p in $procs) {
  try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop; Write-Host "  killed PID $($p.ProcessId)" } catch {}
}
# Free the port if anything else holds it
try { Get-NetTCPConnection -LocalPort 3434 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } } catch {}
Start-Sleep -Milliseconds 800

Write-Host "[restart-dashboard] starting ONE --watch instance..."
$node = (Get-Command node).Source
Start-Process -FilePath $node -ArgumentList '--watch','dashboard-server.mjs' -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardOutput "$root\dashboard.log" -RedirectStandardError "$root\dashboard.err.log"

# Verify live
$ok = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Milliseconds 600
  try {
    $v = Invoke-RestMethod -Uri 'http://localhost:3434/api/version' -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[restart-dashboard] LIVE - pid $($v.pid), startedAt $($v.startedAt), stale=$($v.stale)"
    $ok = $true; break
  } catch {}
}
$count = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*--watch dashboard-server.mjs*' }).Count
Write-Host "[restart-dashboard] running --watch instances: $count"
if (-not $ok) { Write-Error "[restart-dashboard] server did NOT come up on :3434"; exit 1 }
if ($count -ne 1) { Write-Error "[restart-dashboard] expected exactly 1 instance, found $count"; exit 1 }
Write-Host "[restart-dashboard] OK - single live instance serving latest code."
