'use strict';

/**
 * Database Seed Script
 * Creates the default admin account.
 * Run: node database/seed.js
 *
 * Admin credentials are read from environment variables.
 * Change the password after first login in a production deployment.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'identity_documents_portal_db',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seed() {
  const username = process.env.ADMIN_USERNAME || 'admin';
  const email    = process.env.ADMIN_EMAIL    || 'admin@portal.local';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('[seed] ADMIN_PASSWORD is not set in .env — aborting.');
    process.exit(1);
  }

  console.log('[seed] Hashing admin password…');
  const passwordHash = await bcrypt.hash(password, 12);

  const client = await pool.connect();
  try {
    // Upsert: insert or update if the admin username already exists
    const result = await client.query(
      `INSERT INTO admins (username, email, password_hash)
       VALUES ($1, $2, $3)
       ON CONFLICT (username) DO UPDATE
         SET email         = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             updated_at    = NOW()
       RETURNING id, username, email`,
      [username, email, passwordHash]
    );

    console.log('[seed] Admin account ready:', result.rows[0]);
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch((err) => {
  console.error('[seed] Seed failed:', err.message);
  process.exit(1);
});
