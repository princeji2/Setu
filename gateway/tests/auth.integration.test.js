'use strict';

/**
 * Integration test: exercises the REAL PostgreSQL-backed citizen
 * repository (not the in-memory one), proving schema.sql + the actual SQL
 * in citizen-repository.js work end to end for the "successful
 * registration" case.
 *
 * Requires a reachable Postgres with the gateway schema applied
 * (npm run migrate). If the DB is not reachable, the test SKIPS rather
 * than fails — so `npm test` stays green on machines without Postgres.
 * The dedicated `npm run test:integration` script asserts it actually ran.
 *
 * Uses a NODE_ENV of 'development' (not 'test') so the real pg pool config
 * is used, and a unique email per run so repeated runs don't collide.
 */

process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : (process.env.NODE_ENV || 'development');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { pgCitizenRepository } = require('../src/citizen-api/repositories/citizen-repository');
const pool = require('../src/db/pool');

async function dbReachable() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (err) {
    console.warn(`[integration] Postgres not reachable, skipping: ${err.message}`);
    return false;
  }
}

test('integration: successful registration persists via the real Postgres repository', async (t) => {
  if (!(await dbReachable())) {
    t.skip('Postgres not reachable');
    return;
  }

  const app = createApp({ citizenRepository: pgCitizenRepository });
  const email = `integration+${Date.now()}@example.com`;
  const payload = { full_name: 'Integration Tester', email, password: 'correct-horse-battery' };

  try {
    const res = await request(app).post('/api/v1/auth/register').send(payload);

    assert.equal(res.status, 201);
    assert.equal(res.body.success, true);
    assert.ok(res.body.data.token, 'expected a JWT');
    assert.equal(res.body.data.citizen.email, email);
    assert.equal(res.body.data.citizen.password_hash, undefined);

    // Confirm the row is genuinely in the table (not just echoed back).
    const found = await pool.query('SELECT id, email, password_hash FROM citizens WHERE lower(email) = $1', [email]);
    assert.equal(found.rowCount, 1, 'expected exactly one persisted row');
    assert.notEqual(found.rows[0].password_hash, payload.password, 'password must be hashed, not plaintext');
    assert.ok(found.rows[0].password_hash.startsWith('$2'), 'expected a bcrypt hash');
  } finally {
    // Clean up the row we created so reruns stay tidy.
    await pool.query('DELETE FROM citizens WHERE lower(email) = $1', [email]).catch(() => {});
    await pool.close();
  }
});
