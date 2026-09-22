'use strict';
const { Pool } = require('pg');
const pool = new Pool({ host: '127.0.0.1', port: 5432, database: 'setu_gateway_db', user: 'postgres' });
async function run() {
  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'applications'");
  console.log('Local applications columns:', res.rows.map(r => r.column_name));
  await pool.end();
}
run().catch(console.error);
