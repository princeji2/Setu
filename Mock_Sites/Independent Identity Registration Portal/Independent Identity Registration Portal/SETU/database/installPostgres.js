const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawnSync } = require('child_process');
const { Client } = require('pg');

async function run() {
  console.log('[POSTGRES INSTALL] Starting secure PostgreSQL 17 installation process...');

  const installerPath = path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'postgresql-17-setup.exe');
  if (!fs.existsSync(installerPath)) {
    throw new Error(`PostgreSQL 17 installer binary not found at ${installerPath}`);
  }

  // 1. Generate strong random credentials
  const dbPassword = crypto.randomBytes(16).toString('hex') + 'A1!';
  const jwtSecret = crypto.randomBytes(32).toString('hex');
  const adminPassword = crypto.randomBytes(12).toString('hex') + 'A1!';

  // 2. Write secure options file (no credentials in command-line arguments)
  const optionsPath = path.join(process.env.TEMP, 'pg_install_options.inf');
  const optionsContent = [
    'mode=unattended',
    'unattendedmodeui=none',
    `superpassword=${dbPassword}`,
    'serverport=5432'
  ].join('\r\n');

  fs.writeFileSync(optionsPath, optionsContent, { mode: 0o600 });
  console.log('[POSTGRES INSTALL] Created temporary secure options configuration.');

  try {
    console.log('[POSTGRES INSTALL] Invoking installer with options file...');
    // Execute installer referencing options file only
    const result = spawnSync('cmd.exe', ['/c', installerPath, '--optionfile', optionsPath], {
      stdio: 'inherit',
      timeout: 300000, // 5 minutes
    });

    console.log('[POSTGRES INSTALL] Installer process exited with code:', result.status);
  } finally {
    // 3. Securely remove options file
    if (fs.existsSync(optionsPath)) {
      try {
        fs.unlinkSync(optionsPath);
        console.log('[POSTGRES INSTALL] Cleaned up temporary options configuration.');
      } catch (e) {
        // ignore
      }
    }
  }

  // 4. Write persistent .env
  const envPath = path.join(__dirname, '..', '.env');
  const envContent = [
    '# ==========================================================',
    '# Independent Aadhaar Registration Portal (Website 1)',
    '# Persistent Environment Configuration',
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
    `INITIAL_ADMIN_PASSWORD=${adminPassword}`,
    '',
    '# Security & CORS Whitelist',
    'CLIENT_ORIGIN=http://localhost:5000',
    ''
  ].join('\n');

  fs.writeFileSync(envPath, envContent, { mode: 0o600 });
  console.log('[POSTGRES INSTALL] Saved configuration to .env securely.');

  // 5. Verify PostgreSQL connectivity and database creation
  console.log('[POSTGRES INSTALL] Verifying PostgreSQL connection on localhost:5432...');
  let connected = false;
  let attempts = 0;
  const maxAttempts = 15;

  while (!connected && attempts < maxAttempts) {
    attempts++;
    try {
      const client = new Client({
        host: 'localhost',
        port: 5432,
        user: 'postgres',
        password: dbPassword,
        database: 'postgres',
        connectionTimeoutMillis: 4000,
      });

      await client.connect();
      console.log(`[POSTGRES INSTALL] Successfully connected to PostgreSQL (attempt ${attempts}).`);

      const dbCheck = await client.query("SELECT 1 FROM pg_database WHERE datname = 'aadhaar_portal_db'");
      if (dbCheck.rowCount === 0) {
        console.log("[POSTGRES INSTALL] Creating database 'aadhaar_portal_db'...");
        await client.query('CREATE DATABASE aadhaar_portal_db');
        console.log("[POSTGRES INSTALL] Database 'aadhaar_portal_db' created.");
      } else {
        console.log("[POSTGRES INSTALL] Database 'aadhaar_portal_db' is ready.");
      }

      await client.end();
      connected = true;
    } catch (err) {
      if (attempts < maxAttempts) {
        console.log(`[POSTGRES INSTALL] Waiting for service to become ready (${attempts}/${maxAttempts})...`);
        await new Promise((r) => setTimeout(r, 4000));
      } else {
        console.error('[POSTGRES INSTALL] Could not connect after max attempts:', err.message);
        throw err;
      }
    }
  }

  console.log('[POSTGRES INSTALL] Setup completed successfully!');
}

run().catch((err) => {
  console.error('[POSTGRES INSTALL FAILED]:', err.message);
  process.exit(1);
});
