'use strict';

/**
 * PostgreSQL connection pool.
 * Uses parameterised queries everywhere — never interpolate user data into SQL strings.
 */

const { Pool } = require('pg');
const config   = require('./env');

const poolConfig = {
  host:     config.db.host,
  port:     config.db.port,
  database: config.db.name,
  user:     config.db.user,
  password: config.db.password,
  max:      10,
  idleTimeoutMillis:    30000,
  connectionTimeoutMillis: 5000,
};

if (config.db.ssl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // Log connection errors without exposing credentials
  console.error('[db] Unexpected pool error:', err.message);
});

/**
 * Execute a parameterised query.
 * @param {string} text   - SQL with $1, $2 … placeholders
 * @param {Array}  params - Parameter values
 */
async function query(text, params) {
  const start = Date.now();
  const res   = await pool.query(text, params);
  const duration = Date.now() - start;

  if (config.env === 'development') {
    // Log query timing only — never log parameter values (may contain PII)
    console.debug(`[db] query executed in ${duration}ms | rows: ${res.rowCount}`);
  }

  return res;
}

async function getClient() {
  return pool.connect();
}

module.exports = { query, getClient, pool };
