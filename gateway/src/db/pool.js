'use strict';

/**
 * PostgreSQL connection pool for the gateway's own database.
 * Parameterised queries everywhere — never interpolate user data into SQL.
 * Mirrors the Mock_Sites db config pattern.
 *
 * Note: the pool is created lazily so that importing this module (e.g.
 * in unit tests that use the in-memory repository) does not open a real
 * DB connection.
 */

const { Pool } = require('pg');
const config = require('../config/env');

let pool = null;

function getPool() {
  if (!pool) {
    const poolConfig = {
      host: config.db.host,
      port: config.db.port,
      database: config.db.name,
      user: config.db.user,
      password: config.db.password,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    };
    if (config.db.ssl) {
      poolConfig.ssl = { rejectUnauthorized: false };
    }
    pool = new Pool(poolConfig);
    pool.on('error', (err) => {
      console.error('[db] Unexpected pool error:', err.message);
    });
  }
  return pool;
}

/**
 * Execute a parameterised query.
 * @param {string} text   SQL with $1, $2 … placeholders
 * @param {Array}  params parameter values
 */
async function query(text, params) {
  const start = Date.now();
  const res = await getPool().query(text, params);
  if (config.env === 'development') {
    // Timing only — never log parameter values (may contain PII / secrets).
    console.debug(`[db] query executed in ${Date.now() - start}ms | rows: ${res.rowCount}`);
  }
  return res;
}

async function close() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

module.exports = { getPool, query, close };
