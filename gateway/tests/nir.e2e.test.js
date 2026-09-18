'use strict';

/**
 * LIVE end-to-end check against the REAL running National Identity
 * Registry service. Drives the actual national-identity-registry-client
 * over HTTP, exactly as production would — no fakes.
 *
 * Requires:
 *   - the NIR service running on NIR_SERVICE_URL (default http://127.0.0.1:5000)
 *   - the gateway's own Postgres reachable
 * Skips (does not fail) if either is unreachable. Run with `npm run test:e2e:nir`.
 */

process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : (process.env.NODE_ENV || 'development');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const config = require('../src/config/env');
const pool = require('../src/db/pool');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function reachable() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.warn(`[e2e-nir] Gateway Postgres not reachable, skipping: ${err.message}`);
    return false;
  }
  try {
    const res = await fetch(`${config.departments.national_identity_registry.baseUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok && res.status !== 503) throw new Error(`health returned ${res.status}`);
  } catch (err) {
    console.warn(`[e2e-nir] NIR service not reachable, skipping: ${err.message}`);
    return false;
  }
  return true;
}

test('LIVE e2e: identity_verification against the real NIR service completes', async (t) => {
  if (!(await reachable())) {
    t.skip('gateway Postgres or NIR service not reachable');
    return;
  }

  const app = createApp(); // real pg repos + real NIR client
  const email = `e2e-nir+${Date.now()}@example.com`;

  try {
    const reg = await request(app).post('/api/v1/auth/register').send({
      full_name: 'E2E NIR Tester', email, password: 'correct-horse-battery',
    });
    assert.equal(reg.status, 201);
    const token = reg.body.data.token;

    const appRes = await request(app).post('/api/v1/applications').set(auth(token))
      .send({ type: 'identity_verification' });
    const applicationId = appRes.body.data.id;

    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: applicationId, department: 'national_identity_registry',
      fields_requested: ['fullName', 'dob'],
    });

    // Happy path against a real seeded reference.
    const ok = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
      .set(auth(token)).send({ reference: 'TESTAADHAAR0001' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.status, 'complete', 'expected the real NIR service to verify TESTAADHAAR0001');
    assert.equal(ok.body.data.verified, true);

    const detail = await request(app).get(`/api/v1/applications/${applicationId}`).set(auth(token));
    const calls = detail.body.data.department_calls;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status_code, 200);
    assert.equal(calls[0].succeeded, true);
    assert.equal(calls[0].department, 'national_identity_registry');

    // Not-found path against a real (unseeded) reference on a second application.
    const app2 = await request(app).post('/api/v1/applications').set(auth(token))
      .send({ type: 'identity_verification' });
    const app2Id = app2.body.data.id;
    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: app2Id, department: 'national_identity_registry', fields_requested: ['fullName'],
    });
    const nf = await request(app).post(`/api/v1/applications/${app2Id}/verify`)
      .set(auth(token)).send({ reference: 'TESTAADHAAR9999' });
    assert.equal(nf.status, 200);
    assert.equal(nf.body.data.status, 'failed');
    assert.equal(nf.body.data.outcome, 'not_found');

    console.log('[e2e-nir] Live verification against real NIR service: PASS');
  } finally {
    await pool.query('DELETE FROM citizens WHERE lower(email) = $1', [email.toLowerCase()]).catch(() => {});
    await pool.close();
  }
});
