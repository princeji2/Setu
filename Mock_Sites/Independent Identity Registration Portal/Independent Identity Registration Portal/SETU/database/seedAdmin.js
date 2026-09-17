const bcrypt = require('bcryptjs');
const { pool } = require('../backend/config/database');
require('dotenv').config();

async function seedAdmin() {
  const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
  const password = process.env.INITIAL_ADMIN_PASSWORD;

  if (!password) {
    console.error('[ADMIN SEED] INITIAL_ADMIN_PASSWORD environment variable is not defined.');
    return;
  }

  try {
    const client = await pool.connect();

    // Check if admin user already exists
    const existing = await client.query('SELECT id, username FROM admins WHERE username = $1', [username]);

    if (existing.rowCount > 0) {
      console.log(`[ADMIN SEED] Admin account '${username}' already exists. Skipping creation.`);
      client.release();
      return;
    }

    console.log(`[ADMIN SEED] Hashing password with bcrypt (salt rounds: 12)...`);
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert admin record
    const result = await client.query(
      'INSERT INTO admins (username, password_hash) VALUES ($1, $2) RETURNING id, username, created_at',
      [username, passwordHash]
    );

    // Log audit event
    await client.query(
      'INSERT INTO audit_logs (event_type, metadata, ip_address) VALUES ($1, $2, $3)',
      [
        'ADMIN_INITIAL_SEED',
        JSON.stringify({ admin_id: result.rows[0].id, username: result.rows[0].username }),
        '127.0.0.1'
      ]
    );

    client.release();
    console.log(`[ADMIN SEED] Admin user '${username}' successfully provisioned in PostgreSQL.`);
  } catch (err) {
    console.error('[ADMIN SEED ERROR]:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  seedAdmin()
    .then(() => pool.end())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}

module.exports = { seedAdmin };
