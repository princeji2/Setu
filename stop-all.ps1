<#
    stop-all.ps1 — shut down the full Setu stack.

    Stops the services listening on the known ports (frontend, gateway, the
    three department services) and then stops the PostgreSQL server.

    Usage:
        pwsh -File .\stop-all.ps1
#>

$ErrorActionPreference = 'SilentlyContinue'
$root = $PSScriptRoot

$PgBin  = 'C:\Users\Prince\scoop\apps\postgresql\current\bin'
$PgData = 'C:\Users\Prince\scoop\persist\postgresql\data'

Write-Host "`n=== Setu stack: stopping ===`n" -ForegroundColor Cyan

# --- Kill whatever owns each app port ----------------------------------------
$ports = @(
    @{ Name = 'Frontend'; Port = 3000 },
    @{ Name = 'Gateway API'; Port = 4000 },
    @{ Name = 'Driving Licence & Jan Aadhaar'; Port = 3001 },
    @{ Name = 'National Identity Registry'; Port = 5000 },
    @{ Name = 'Digital Tax Records'; Port = 8000 }
)

foreach ($p in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $p.Port -State Listen -ErrorAction SilentlyContinue
    if ($conns) {
        $pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
        foreach ($procId in $pids) {
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
        Write-Host ("  stopped {0,-32} :{1}" -f $p.Name, $p.Port) -ForegroundColor Green
    } else {
        Write-Host ("  (not running) {0,-24} :{1}" -f $p.Name, $p.Port) -ForegroundColor DarkGray
    }
}

# --- Stop PostgreSQL last -----------------------------------------------------
Write-Host "`nStopping PostgreSQL..." -ForegroundColor Yellow
& "$PgBin\pg_ctl.exe" -D $PgData stop -m fast | Out-Null
Write-Host "  done" -ForegroundColor Green

Write-Host "`n=== Setu stack stopped ===`n" -ForegroundColor Cyan
