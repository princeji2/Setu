'use strict';

const { Pool } = require('pg');

async function inspectRender() {
  const pool = new Pool({
    connectionString: 'postgresql://setu_gateway_db_d4ys_user:ZQur2pbWP0Tx89R6jTdx0yZMfBiARNzI@dpg-danv10oae00c73a6327g-a.singapore-postgres.render.com:5432/setu_gateway_db_d4ys?ssl=true',
    ssl: { rejectUnauthorized: false }
  });

  const res = await pool.query(`
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  console.log('=== Render DB Columns ===');
  let currentTable = '';
  for (const row of res.rows) {
    if (row.table_name !== currentTable) {
      currentTable = row.table_name;
      console.log(`\nTable: ${currentTable}`);
    }
    console.log(`  - ${row.column_name} (${row.data_type})`);
  }

  await pool.end();
}

inspectRender().catch(console.error);
