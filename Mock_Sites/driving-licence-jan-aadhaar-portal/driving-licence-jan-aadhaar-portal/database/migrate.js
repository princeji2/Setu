'use strict';

/**
 * Database Migration Script
 * Reads schema.sql and applies it to the configured PostgreSQL database.
 * Run: node database/migrate.js
 */

require('dotenv').config();
const fs   = require('fs');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'identity_documents_portal_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql        = fs.readFileSync(schemaPath, 'utf8');

  console.log('[migrate] Connecting to database:', process.env.DB_NAME || 'identity_documents_portal_db');

  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[migrate] Schema applied successfully.');
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch((err) => {
  console.error('[migrate] Migration failed:', err.message);
  process.exit(1);
});
