'use strict';

const { query, close } = require('../src/db/pool');

async function migrate() {
  console.log('[migrate-identity-matcher] Starting migration...');

  try {
    await query('ALTER TABLE application_department_calls ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2) DEFAULT NULL;');
    console.log('  -> Added match_confidence to application_department_calls');

    await query('ALTER TABLE linked_references ADD COLUMN IF NOT EXISTS demographics JSONB DEFAULT NULL;');
    console.log('  -> Added demographics to linked_references');

    await query('ALTER TABLE linked_references ADD COLUMN IF NOT EXISTS match_confidence NUMERIC(5,2) DEFAULT NULL;');
    console.log('  -> Added match_confidence to linked_references');

    await query('ALTER TABLE linked_references ADD COLUMN IF NOT EXISTS discrepancy JSONB DEFAULT NULL;');
    console.log('  -> Added discrepancy to linked_references');

    console.log('[migrate-identity-matcher] Migration completed successfully.');
  } catch (err) {
    console.error('[migrate-identity-matcher] Migration failed:', err);
    process.exitCode = 1;
  } finally {
    await close();
  }
}

migrate();
