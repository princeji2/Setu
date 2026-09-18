'use strict';

/**
 * Data access for the `citizens` table.
 *
 * Two implementations behind one interface:
 *   - pgCitizenRepository:     real PostgreSQL (production/dev)
 *   - inMemoryCitizenRepository: process-local Map (tests, no DB needed)
 *
 * The auth logic (bcrypt, JWT, duplicate detection, wrong-password
 * rejection) is identical either way — only where rows live differs.
 * Email is treated case-insensitively for uniqueness and lookup.
 */

const crypto = require('crypto');
const { query } = require('../../db/pool');

function normaliseEmail(email) {
  return String(email).trim().toLowerCase();
}

// ------------------------------------------------------------
// PostgreSQL-backed repository
// ------------------------------------------------------------
const pgCitizenRepository = {
  async findByEmail(email) {
    const res = await query(
      'SELECT id, full_name, email, password_hash, created_at FROM citizens WHERE lower(email) = $1',
      [normaliseEmail(email)]
    );
    return res.rows[0] || null;
  },

  async create({ fullName, email, passwordHash }) {
    const res = await query(
      `INSERT INTO citizens (full_name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, full_name, email, password_hash, created_at`,
      [fullName, normaliseEmail(email), passwordHash]
    );
    return res.rows[0];
  },
};

// ------------------------------------------------------------
// In-memory repository (tests) — mirrors the pg row shape.
// ------------------------------------------------------------
function createInMemoryCitizenRepository() {
  const byEmail = new Map();

  return {
    async findByEmail(email) {
      return byEmail.get(normaliseEmail(email)) || null;
    },

    async create({ fullName, email, passwordHash }) {
      const key = normaliseEmail(email);
      const row = {
        id: crypto.randomUUID(),
        full_name: fullName,
        email: key,
        password_hash: passwordHash,
        created_at: new Date().toISOString(),
      };
      byEmail.set(key, row);
      return row;
    },

    // test helper
    _reset() {
      byEmail.clear();
    },
  };
}

module.exports = {
  pgCitizenRepository,
  createInMemoryCitizenRepository,
  normaliseEmail,
};
