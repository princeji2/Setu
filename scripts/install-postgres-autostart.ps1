<#
    install-postgres-autostart.ps1 - register a per-user logon Scheduled Task
    that starts the Scoop PostgreSQL automatically, so 5432 is up before you
    run anything. Run this ONCE (no admin needed for a per-user logon task).

    Idempotent: re-running updates the existing task rather than duplicating.

    Uninstall:
        Unregister-ScheduledTask -TaskName 'SetuPostgresAutostart' -Confirm:$false
#>

$ErrorActionPreference = 'Stop'

$TaskName = 'SetuPostgresAutostart'
$ensure   = Join-Path $PSScriptRoot 'ensure-postgres.ps1'

if (-not (Test-Path $ensure)) {
    Write-Host "Cannot find $ensure - run this from the Setu\scripts folder." -ForegroundColor Red
    exit 1
}

# Resolve an ABSOLUTE interpreter path. Scheduled Tasks do not inherit the
# interactive PATH, and PowerShell 7's pwsh.exe often lives under a
# WindowsApps package dir that isn't on the system PATH - so a bare
# "pwsh.exe" fails at logon with 0x80070002 (file not found). Prefer the
# current pwsh; fall back to Windows PowerShell if pwsh can't be resolved.
$interpreter = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
if (-not $interpreter) {
    $interpreter = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
}
Write-Host "Using interpreter: $interpreter" -ForegroundColor DarkGray

$action = New-ScheduledTaskAction -Execute $interpreter `
    -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ensure`""

# At logon of the current user. AtStartup would need SYSTEM + admin; logon is
# enough since you only need the DB once you're logged in and working.
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal `
    -Description 'Starts Scoop PostgreSQL (port 5432) at logon for the Setu gateway.' `
    -Force | Out-Null

Write-Host "Registered logon task '$TaskName'." -ForegroundColor Green
Write-Host "Postgres will now start automatically each time you log in." -ForegroundColor Green
Write-Host "Test it now without waiting for a reboot:" -ForegroundColor Cyan
Write-Host "    Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor DarkGray
