'use strict';

/**
 * import-render-db.js — Safely import local Setu gateway data into the Render PostgreSQL database.
 *
 * Usage:
 *   node scripts/import-render-db.js "<RENDER_DATABASE_URL>"
 *   OR set RENDER_DATABASE_URL="postgresql://..." in environment
 *
 * Guarantees:
 * - Non-destructive: Does NOT drop tables or delete existing rows.
 * - Conflict safe: Uses ON CONFLICT DO NOTHING so existing records are kept.
 * - Validates schema before applying data.
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const databaseUrl = process.argv[2] || process.env.RENDER_DATABASE_URL;

if (!databaseUrl) {
  console.error('\n[Error] Missing DATABASE_URL.');
  console.error('Usage: node scripts/import-render-db.js "<RENDER_EXTERNAL_DATABASE_URL>"');
  console.error('Example: node scripts/import-render-db.js "postgresql://user:password@dpg-xxxx.render.com/dbname?ssl=true"\n');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  console.log('\n=== Setu Gateway — Render Database Data Import ===\n');
  console.log('[1/4] Connecting to target database...');

  try {
    const testRes = await pool.query('SELECT current_database(), current_user, version()');
    console.log(`  -> Connected to DB: ${testRes.rows[0].current_database} as user: ${testRes.rows[0].current_user}`);
  } catch (err) {
    console.error('  -> [FAIL] Connection error:', err.message);
    process.exit(1);
  }

  console.log('\n[2/4] Verifying schema tables exist...');
  const expectedTables = [
    'citizens',
    'linked_references',
    'applications',
    'consent_grants',
    'application_department_calls',
    'audit_log',
  ];

  for (const t of expectedTables) {
    const res = await pool.query(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
      [t]
    );
    if (!res.rows[0].exists) {
      console.error(`  -> [FAIL] Missing table "${t}". Running schema migration first is required.`);
      process.exit(1);
    }
  }
  console.log('  -> All 6 tables exist on the target database.');

  console.log('\n[3/4] Checking existing row counts before import...');
  const countsBefore = {};
  for (const t of expectedTables) {
    const res = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    countsBefore[t] = res.rows[0].n;
    console.log(`  -> ${t.padEnd(30)}: ${countsBefore[t]} rows`);
  }

  const sqlPath = path.join(__dirname, 'export_setu_data.sql');
  if (!fs.existsSync(sqlPath)) {
    console.error(`\n[FAIL] Export SQL file not found at: ${sqlPath}`);
    process.exit(1);
  }

  const sqlContent = fs.readFileSync(sqlPath, 'utf8');
  console.log(`\n[4/4] Applying data from ${path.basename(sqlPath)} (${(sqlContent.length / 1024).toFixed(1)} KB)...`);

  const client = await pool.connect();
  try {
    await client.query(sqlContent);
    console.log('  -> SQL transaction committed successfully.');
  } catch (err) {
    console.error('  -> [FAIL] SQL execution error:', err.message);
    process.exit(1);
  } finally {
    client.release();
  }

  console.log('\n=== Post-Import Row Counts ===\n');
  for (const t of expectedTables) {
    const res = await pool.query(`SELECT COUNT(*)::int AS n FROM ${t}`);
    const after = res.rows[0].n;
    const added = after - countsBefore[t];
    console.log(`  -> ${t.padEnd(30)}: ${after} rows (+${added} added)`);
  }

  console.log('\n Import complete! Your Render database is now populated with real verification data.\n');
  await pool.end();
}

main().catch((err) => {
  console.error('\nFatal error:', err);
  pool.end().finally(() => process.exit(1));
});
