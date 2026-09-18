'use strict';

/**
 * Applies schema.sql to the gateway database.
 * Usage: npm run migrate  (requires a configured .env with DB_* values)
 */

const fs = require('fs');
const path = require('path');
const { query, close } = require('./pool');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] Applying gateway schema...');
  await query(sql);
  console.log('[migrate] Done.');
}

migrate()
  .then(() => close())
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] Failed:', err.message);
    close().finally(() => process.exit(1));
  });
