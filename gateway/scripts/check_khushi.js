'use strict';

const { Pool } = require('pg');

async function checkLocal() {
  const local = new Pool({ host: '127.0.0.1', port: 5432, database: 'setu_gateway_db', user: 'postgres' });
  try {
    const res = await local.query("SELECT id, email, full_name FROM citizens WHERE full_name ILIKE '%khushi%'");
    console.log('LOCAL DB Khushi:', res.rows);
    if (res.rows.length > 0) {
      for (const row of res.rows) {
        const cid = row.id;
        console.log(`\nLocal Details for ${row.full_name} (${row.email}):`);
        const apps = await local.query('SELECT id, type, status, composite_workflow_id, created_at FROM applications WHERE citizen_id = $1', [cid]);
        console.log('Applications:', apps.rows);
        const docs = await local.query('SELECT id, department, department_reference, verified, demographics, match_confidence, discrepancy FROM linked_references WHERE citizen_id = $1', [cid]);
        console.log('Linked References:', docs.rows);
      }
    }
  } catch (e) {
    console.log('LOCAL DB error:', e.message);
  } finally {
    await local.end();
  }
}

async function checkRender() {
  const render = new Pool({
    connectionString: 'postgresql://setu_gateway_db_d4ys_user:ZQur2pbWP0Tx89R6jTdx0yZMfBiARNzI@dpg-danv10oae00c73a6327g-a.singapore-postgres.render.com:5432/setu_gateway_db_d4ys?ssl=true',
    ssl: { rejectUnauthorized: false }
  });
  try {
    const res = await render.query("SELECT id, email, full_name FROM citizens WHERE full_name ILIKE '%khushi%'");
    console.log('\nRENDER DB Khushi:', res.rows);
    if (res.rows.length > 0) {
      for (const row of res.rows) {
        const cid = row.id;
        console.log(`\nRender Details for ${row.full_name} (${row.email}):`);
        const apps = await render.query('SELECT id, type, status, composite_workflow_id, created_at FROM applications WHERE citizen_id = $1', [cid]);
        console.log('Applications:', apps.rows);
        const docs = await render.query('SELECT id, department, department_reference, verified, demographics, match_confidence, discrepancy FROM linked_references WHERE citizen_id = $1', [cid]);
        console.log('Linked References:', docs.rows);
      }
    }
  } catch (e) {
    console.log('RENDER DB error:', e.message);
  } finally {
    await render.end();
  }
}

async function main() {
  await checkLocal();
  await checkRender();
}

main();
