$ErrorActionPreference = "Stop"

Write-Host "=========================================================="
Write-Host "Installing & Configuring PostgreSQL 17 Windows Service"
Write-Host "=========================================================="

# 1. Generate strong cryptographically secure random credentials
$bytes = New-Object byte[] 16
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$rng.GetBytes($bytes)
$dbPass = [System.BitConverter]::ToString($bytes) -replace '-' + "P9!"

$jwtBytes = New-Object byte[] 32
$rng.GetBytes($jwtBytes)
$jwtSecret = [System.BitConverter]::ToString($jwtBytes) -replace '-'

$adminBytes = New-Object byte[] 12
$rng.GetBytes($adminBytes)
$adminPass = [System.BitConverter]::ToString($adminBytes) -replace '-' + "Ad1!"

$installer = "$env:TEMP\postgresql-17-setup.exe"
if (-not (Test-Path $installer)) {
    throw "Installer not found at $installer"
}

Write-Host "[1/5] Running EnterpriseDB PostgreSQL 17 unattended installer..."
$argList = "--mode unattended --unattendedmodeui none --superpassword `"$dbPass`" --serverport 5432"

$proc = Start-Process -FilePath $installer -ArgumentList $argList -Wait -PassThru
Write-Host "Installer finished with ExitCode: $($proc.ExitCode)"

# 2. Verify Windows Service
Write-Host "[2/5] Checking PostgreSQL Windows service status..."
Start-Sleep -Seconds 5
$svc = Get-Service | Where-Object { $_.Name -like "*postgres*" }
if ($svc) {
    Write-Host "Found PostgreSQL Service: $($svc.Name) (Status: $($svc.Status))"
    if ($svc.Status -ne "Running") {
        Write-Host "Starting service $($svc.Name)..."
        Start-Service $svc.Name
        Start-Sleep -Seconds 5
    }
} else {
    Write-Host "Warning: Service not found under standard name, checking port 5432 directly..."
}

# 3. Verify Port 5432
Write-Host "[3/5] Verifying localhost:5432 connection..."
$portCheck = Test-NetConnection -Port 5432 -ComputerName localhost
if (-not $portCheck.TcpTestSucceeded) {
    Write-Host "Waiting another 10 seconds for PostgreSQL to accept connections..."
    Start-Sleep -Seconds 10
    $portCheck = Test-NetConnection -Port 5432 -ComputerName localhost
}
Write-Host "Port 5432 Listening: $($portCheck.TcpTestSucceeded)"

# 4. Write secure .env with matching credentials
Write-Host "[4/5] Writing persistent .env configuration..."
$envContent = @"
# ==========================================================
# Independent Aadhaar Registration Portal (Website 1)
# Persistent Environment Configuration
# ==========================================================
PORT=5000
NODE_ENV=development

# PostgreSQL Persistent Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=aadhaar_portal_db
DB_USER=postgres
DB_PASSWORD=$dbPass

# Admin Authentication Secret
JWT_SECRET=$jwtSecret
JWT_EXPIRES_IN=8h

# Initial Admin Seed Credentials
INITIAL_ADMIN_USERNAME=admin
INITIAL_ADMIN_PASSWORD=$adminPass

# Security & CORS Whitelist
CLIENT_ORIGIN=http://localhost:5000
"@

Set-Content -Path ".env" -Value $envContent -Encoding utf8
Write-Host "Configuration saved to .env securely."

# 5. Add PostgreSQL bin to current process PATH if installed in Program Files
$pgBin = "C:\Program Files\PostgreSQL\17\bin"
if (Test-Path $pgBin) {
    $env:PATH = "$pgBin;$env:PATH"
    Write-Host "Added $pgBin to PATH."
}

Write-Host "=========================================================="
Write-Host "PostgreSQL Setup Script Completed."
Write-Host "=========================================================="
