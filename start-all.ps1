<#
    start-all.ps1 — bring up the full Setu stack locally.

    Order matters: PostgreSQL first (everything else needs it), then the
    three department services, then the gateway, then the frontend.

    Each service (except Postgres) opens in its OWN PowerShell window so you
    can watch its logs and Ctrl+C it individually. Postgres runs as a
    background server via pg_ctl (Scoop install has no Windows service).

    Usage:
        pwsh -File .\start-all.ps1        # from the Setu workspace root

    To shut everything down again:  .\stop-all.ps1
#>

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# --- Resolved, verified paths -------------------------------------------------
$PgBin   = 'C:\Users\Prince\scoop\apps\postgresql\current\bin'
$PgData  = 'C:\Users\Prince\scoop\persist\postgresql\data'
$PgLog   = 'C:\Users\Prince\scoop\persist\postgresql\pg.log'

$DtrDir  = Join-Path $root 'Mock_Sites\UIDAI_Backend_Digital_Tax_Records\UIDAI_Backend'
$NirDir  = Join-Path $root 'Mock_Sites\Independent Identity Registration Portal\Independent Identity Registration Portal\SETU'
$DljaDir = Join-Path $root 'Mock_Sites\driving-licence-jan-aadhaar-portal\driving-licence-jan-aadhaar-portal'
$GwDir   = Join-Path $root 'gateway'
$FeDir   = Join-Path $root 'frontend'

function Start-Window {
    param([string]$Title, [string]$WorkDir, [string]$Command)
    # Open a new PowerShell window that cd's in and runs the command, staying open.
    Start-Process pwsh -ArgumentList @(
        '-NoExit', '-Command',
        "`$host.UI.RawUI.WindowTitle = '$Title'; Set-Location '$WorkDir'; $Command"
    ) | Out-Null
    Write-Host "  -> launched: $Title" -ForegroundColor Green
}

function Test-Port {
    param([int]$Port)
    try {
        (Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue).TcpTestSucceeded
    } catch { $false }
}

Write-Host "`n=== Setu stack: starting ===`n" -ForegroundColor Cyan

# --- 1. PostgreSQL ------------------------------------------------------------
Write-Host "[1/6] PostgreSQL (port 5432)..." -ForegroundColor Yellow
if (Test-Port 5432) {
    Write-Host "  -> already running" -ForegroundColor DarkGray
} else {
    & "$PgBin\pg_ctl.exe" -D $PgData -l $PgLog start | Out-Null
    $tries = 0
    while (-not (Test-Port 5432) -and $tries -lt 15) { Start-Sleep -Seconds 1; $tries++ }
    if (Test-Port 5432) { Write-Host "  -> started" -ForegroundColor Green }
    else { Write-Host "  -> FAILED to start; check $PgLog" -ForegroundColor Red; exit 1 }
}

# --- 2. Department services ---------------------------------------------------
Write-Host "[2/6] Digital Tax Records (FastAPI, port 8000)..." -ForegroundColor Yellow
Start-Window 'Setu DTR :8000' $DtrDir '.\venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000'

Write-Host "[3/6] National Identity Registry (Node, port 5000)..." -ForegroundColor Yellow
Start-Window 'Setu NIR :5000' $NirDir 'npm start'

Write-Host "[4/6] Driving Licence & Jan Aadhaar (Node, port 3001)..." -ForegroundColor Yellow
Start-Window 'Setu DLJA :3001' $DljaDir 'npm start'

# --- 3. Gateway ---------------------------------------------------------------
Write-Host "[5/6] Gateway API (Node, port 4000)..." -ForegroundColor Yellow
Start-Window 'Setu Gateway :4000' $GwDir 'npm start'

# --- 4. Frontend --------------------------------------------------------------
Write-Host "[6/6] Frontend (static, port 3000)..." -ForegroundColor Yellow
Start-Window 'Setu Frontend :3000' $FeDir 'node server.js'

# --- Wait + health check ------------------------------------------------------
Write-Host "`nWaiting for services to come up..." -ForegroundColor Cyan
Start-Sleep -Seconds 6

$checks = @(
    @{ Name = 'PostgreSQL'; Port = 5432 },
    @{ Name = 'Digital Tax Records'; Port = 8000 },
    @{ Name = 'National Identity Registry'; Port = 5000 },
    @{ Name = 'Driving Licence & Jan Aadhaar'; Port = 3001 },
    @{ Name = 'Gateway API'; Port = 4000 },
    @{ Name = 'Frontend'; Port = 3000 }
)

Write-Host "`n=== Health check ===" -ForegroundColor Cyan
foreach ($c in $checks) {
    if (Test-Port $c.Port) {
        Write-Host ("  [OK]   {0,-32} :{1}" -f $c.Name, $c.Port) -ForegroundColor Green
    } else {
        Write-Host ("  [DOWN] {0,-32} :{1}  (check its window)" -f $c.Name, $c.Port) -ForegroundColor Red
    }
}

Write-Host "`nOpen the app:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "Stop everything:  .\stop-all.ps1`n" -ForegroundColor DarkGray
