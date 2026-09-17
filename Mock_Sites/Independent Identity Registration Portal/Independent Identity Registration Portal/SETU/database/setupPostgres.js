const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

async function main() {
  console.log('[SETUP] Initializing secure PostgreSQL 17 installation and configuration...');

  // 1. Generate cryptographically strong random credentials
  const dbPassword = crypto.randomBytes(16).toString('hex') + 'P9!';
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const initialAdminPassword = crypto.randomBytes(12).toString('hex') + 'Ad1!';

  const installerPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'postgresql-17-setup.exe');

  if (!fs.existsSync(installerPath)) {
    throw new Error(`PostgreSQL 17 installer not found at ${installerPath}`);
  }

  console.log('[SETUP] Launching PostgreSQL 17 installer in unattended mode with secure credentials...');
  
  // Arguments passed securely without shell expansion or console echoing
  const installerArgs = [
    '--mode', 'unattended',
    '--unattendedmodeui', 'none',
    '--superpassword', dbPassword,
    '--serverport', '5432'
  ];

  const installProc = spawnSync(installerPath, installerArgs, {
    stdio: 'inherit',
    windowsHide: true,
  });

  if (installProc.error) {
    console.error('[SETUP] Installer process error:', installProc.error.message);
  }

  console.log('[SETUP] PostgreSQL installation step completed.');

  // 2. Write the .env file with the configured credentials
  const envContent = [
    '# ==========================================================',
    '# Independent Aadhaar Registration Portal (Website 1)',
    '# Local Environment Configuration',
    '# ==========================================================',
    'PORT=5000',
    'NODE_ENV=development',
    '',
    '# Persistent PostgreSQL Configuration',
    'DB_HOST=localhost',
    'DB_PORT=5432',
    'DB_NAME=aadhaar_portal_db',
    'DB_USER=postgres',
    `DB_PASSWORD=${dbPassword}`,
    '',
    '# Admin Authentication Secret',
    `JWT_SECRET=${jwtSecret}`,
    'JWT_EXPIRES_IN=8h',
    '',
    '# Initial Admin Seed Credentials',
    'INITIAL_ADMIN_USERNAME=admin',
    `INITIAL_ADMIN_PASSWORD=${initialAdminPassword}`,
    '',
    '# Security & CORS Whitelist',
    'CLIENT_ORIGIN=http://localhost:5000',
    ''
  ].join('\n');

  fs.writeFileSync(path.join(__dirname, '..', '.env'), envContent, { mode: 0o600 });
  console.log('[SETUP] Secure .env file written with consistent credentials (not exposed to logs).');

  // 3. Wait for PostgreSQL service to accept connections (up to 60 seconds)
  console.log('[SETUP] Verifying PostgreSQL 17 server responsiveness...');
  let connected = false;
  let attempts = 0;
  const maxAttempts = 20;

  while (!connected && attempts < maxAttempts) {
    attempts++;
    try {
      const testClient = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: dbPassword,
        database: 'postgres',
        connectionTimeoutMillis: 3000,
      });

      await testClient.connect();
      const res = await testClient.query('SELECT version()');
      console.log(`[SETUP] Connected to PostgreSQL server on attempt ${attempts}.`);
      console.log(`[SETUP] PostgreSQL Engine: ${res.rows[0].version.split(',')[0]}`);

      // Ensure aadhaar_portal_db database exists
      const dbCheck = await testClient.query(
        "SELECT 1 FROM pg_database WHERE datname = 'aadhaar_portal_db'"
      );

      if (dbCheck.rowCount === 0) {
        console.log("[SETUP] Database 'aadhaar_portal_db' not found. Creating database...");
        await testClient.query('CREATE DATABASE aadhaar_portal_db');
        console.log("[SETUP] Database 'aadhaar_portal_db' created successfully.");
      } else {
        console.log("[SETUP] Database 'aadhaar_portal_db' already exists.");
      }

      await testClient.end();
      connected = true;
    } catch (err) {
      if (attempts < maxAttempts) {
        console.log(`[SETUP] Waiting for database to initialize (attempt ${attempts}/${maxAttempts})...`);
        await new Promise((resolve) => setTimeout(resolve, 3000));
      } else {
        console.error('[SETUP] Failed to connect to PostgreSQL server after multiple attempts:', err.message);
        throw err;
      }
    }
  }

  console.log('[SETUP] PostgreSQL 17 configuration and verification finished successfully.');
}

main().catch((err) => {
  console.error('[SETUP ERROR]:', err.message);
  process.exit(1);
});
