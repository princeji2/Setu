const fs = require('fs');
const path = require('path');
const { pool, testConnection } = require('../backend/config/database');

async function initializeDatabase() {
  console.log('[DB INIT] Starting database schema migration for aadhaar_portal_db...');
  
  // Test connection first
  const connStatus = await testConnection();
  if (!connStatus.connected) {
    console.error('[DB INIT] Cannot initialize database: connection failed.');
    process.exit(1);
  }

  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  try {
    const client = await pool.connect();
    console.log('[DB INIT] Applying schema.sql definitions...');
    await client.query(schemaSql);
    client.release();
    console.log('[DB INIT] Database tables and indexes created/verified successfully:');
    console.log('  - registrations (with UNIQUE constraint on identity_reference)');
    console.log('  - admins');
    console.log('[DB INIT] Schema migration complete.');

    // Seed synthetic identity references with fields
    const { seedRegistrations } = require('./seedRegistrations');
    await seedRegistrations();
  } catch (err) {
    console.error('[DB INIT ERROR] Failed to apply schema or seed records:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  initializeDatabase()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { initializeDatabase };
