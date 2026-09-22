'use strict';

/**
 * Migration: Add composite_workflow_id to applications and application_department_calls.
 * Safe & idempotent.
 * Usage: node scripts/migrate-composite-workflow.js
 */

const { query, close } = require('../src/db/pool');

async function migrate() {
  console.log('[migrate] Applying composite_workflow_id columns and indexes...');

  await query(`
    ALTER TABLE applications
    ADD COLUMN IF NOT EXISTS composite_workflow_id UUID DEFAULT NULL;

    ALTER TABLE application_department_calls
    ADD COLUMN IF NOT EXISTS composite_workflow_id UUID DEFAULT NULL;

    CREATE INDEX IF NOT EXISTS applications_composite_workflow_idx
    ON applications (composite_workflow_id);

    CREATE INDEX IF NOT EXISTS application_department_calls_composite_workflow_idx
    ON application_department_calls (composite_workflow_id);
  `);

  console.log('[migrate] Migration complete: composite_workflow_id added successfully.');
}

if (require.main === module) {
  migrate()
    .then(() => close())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] Migration failed:', err.message);
      close().finally(() => process.exit(1));
    });
}

module.exports = { migrate };
