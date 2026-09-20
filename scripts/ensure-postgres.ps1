<#
    ensure-postgres.ps1 - start the Scoop-installed PostgreSQL if it isn't
    already listening on 5432. Idempotent and safe to run repeatedly:
    if the server is already up it does nothing.

    Single source of truth for "bring Postgres up" - both the logon
    Scheduled Task (install-postgres-autostart.ps1) and start-all.ps1 can
    call it, so the Scoop paths and readiness-wait live in exactly one place.

    Postgres was installed via Scoop, which registers no Windows service, so
    it does NOT auto-start on boot on its own. The logon task fixes that.

    Exit code 0 = Postgres is listening on 5432; non-zero = it isn't.
#>

$ErrorActionPreference = 'Stop'

# Scoop Postgres paths. If Postgres is reinstalled/moved, update these three
# lines (kept in sync with start-all.ps1).
$PgBin  = 'C:\Users\Prince\scoop\apps\postgresql\current\bin'
$PgData = 'C:\Users\Prince\scoop\persist\postgresql\data'
$PgLog  = 'C:\Users\Prince\scoop\persist\postgresql\pg.log'

function Test-Pg {
    Test-NetConnection -ComputerName localhost -Port 5432 `
        -WarningAction SilentlyContinue -InformationLevel Quiet
}

if (Test-Pg) {
    Write-Host "[ensure-postgres] Already listening on 5432 - nothing to do." -ForegroundColor DarkGray
    exit 0
}

if (-not (Test-Path "$PgBin\pg_ctl.exe")) {
    Write-Host "[ensure-postgres] pg_ctl.exe not found at $PgBin - is Scoop Postgres installed?" -ForegroundColor Red
    exit 1
}

Write-Host "[ensure-postgres] Starting PostgreSQL..." -ForegroundColor Yellow
& "$PgBin\pg_ctl.exe" -D $PgData -l $PgLog start | Out-Null

$tries = 0
while (-not (Test-Pg) -and $tries -lt 20) { Start-Sleep -Seconds 1; $tries++ }

if (Test-Pg) {
    Write-Host "[ensure-postgres] PostgreSQL is up on 5432." -ForegroundColor Green
    exit 0
} else {
    Write-Host "[ensure-postgres] FAILED to start; check $PgLog" -ForegroundColor Red
    exit 1
}
