const { Pool } = require('pg');
require('dotenv').config();

// Ensure required environment configurations are available
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'aadhaar_portal_db',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(dbConfig);

// Event listener for pool errors
pool.on('error', (err) => {
  console.error('[DATABASE CRITICAL] Unexpected error on idle PostgreSQL client:', err.message);
});

/**
 * Verifies active connectivity to the persistent PostgreSQL database.
 * If PostgreSQL is offline or misconfigured, it logs a clear diagnostic message.
 */
async function testConnection() {
  try {
    const client = await pool.connect();
    const res = await client.query('SELECT current_database(), current_user, version()');
    client.release();
    const rawVersion = res.rows[0].version || '';
    const versionMatch = rawVersion.match(/PostgreSQL\s+[\d.]+/i);
    const engine = versionMatch ? versionMatch[0] : (rawVersion.split(',')[0].split(' on ')[0] || 'PostgreSQL');

    console.log(`[DATABASE] Successfully connected to persistent PostgreSQL:`);
    console.log(`  Database: ${res.rows[0].current_database}`);
    console.log(`  User:     ${res.rows[0].current_user}`);
    console.log(`  Engine:   ${engine}`);
    return { connected: true, engine, version: rawVersion, details: res.rows[0] };
  } catch (error) {
    console.error('================================================================');
    console.error(' [DATABASE CONNECTION FAILED]');
    console.error(` Target Host: ${dbConfig.host}:${dbConfig.port}`);
    console.error(` Database:    ${dbConfig.database}`);
    console.error(` User:        ${dbConfig.user}`);
    console.error(` Error:       ${error.message}`);
    console.error(' Please ensure PostgreSQL 17 is running and credentials in .env are correct.');
    console.error('================================================================');
    return { connected: false, error: error.message };
  }
}

/**
 * Execute parameterized query safely
 * @param {string} text - SQL query with $1, $2 parameter placeholders
 * @param {Array} params - Array of parameter values
 */
async function query(text, params) {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    // Log query metrics without exposing sensitive parameters
    console.log(`[DB QUERY] Executed query in ${duration}ms (Rows: ${res.rowCount})`);
  }
  return res;
}

module.exports = {
  pool,
  query,
  testConnection,
};
