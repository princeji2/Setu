'use strict';

/**
 * LIVE end-to-end check against the REAL running Digital Tax Records
 * (UIDAI) service. This does NOT use a fake client — it drives the actual
 * digital-tax-records-client over HTTP, exactly as production would.
 *
 * Requires:
 *   - the UIDAI service running on DTR_SERVICE_URL (default http://127.0.0.1:8000)
 *   - the gateway's own Postgres reachable (so applications/consent persist)
 *
 * If either is unreachable the test SKIPS rather than fails, so it doesn't
 * break `npm test` on a machine without both services up. Run explicitly
 * with `npm run test:e2e` once both are running.
 *
 * Uses NODE_ENV=development so the real pg pool + real DTR client are used.
 */

process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : (process.env.NODE_ENV || 'development');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const config = require('../src/config/env');
const pool = require('../src/db/pool');

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function servicesReachable() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.warn(`[e2e] Gateway Postgres not reachable, skipping: ${err.message}`);
    return false;
  }
  try {
    const res = await fetch(`${config.departments.digital_tax_records.baseUrl}/`, {
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) throw new Error(`root returned ${res.status}`);
  } catch (err) {
    console.warn(`[e2e] UIDAI service not reachable, skipping: ${err.message}`);
    return false;
  }
  return true;
}

test('LIVE e2e: pan_verification against the real UIDAI service completes', async (t) => {
  if (!(await servicesReachable())) {
    t.skip('gateway Postgres or UIDAI service not reachable');
    return;
  }

  // Real app: default pg repos + default real DTR client.
  const app = createApp();
  const email = `e2e+${Date.now()}@example.com`;

  try {
    const reg = await request(app).post('/api/v1/auth/register').send({
      full_name: 'E2E Tester', email, password: 'correct-horse-battery',
    });
    assert.equal(reg.status, 201);
    const token = reg.body.data.token;

    const appRes = await request(app).post('/api/v1/applications').set(auth(token))
      .send({ type: 'pan_verification' });
    const applicationId = appRes.body.data.id;

    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: applicationId,
      department: 'digital_tax_records',
      fields_requested: ['fullName', 'filingStatus'],
    });

    // Happy path against a real seeded reference.
    const ok = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
      .set(auth(token)).send({ reference: 'SYNPAN-000123' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.status, 'complete', 'expected the real service to verify SYNPAN-000123');
    assert.equal(ok.body.data.verified, true);

    // The department-call row records a real 200 from the live service.
    const detail = await request(app).get(`/api/v1/applications/${applicationId}`).set(auth(token));
    const calls = detail.body.data.department_calls;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status_code, 200);
    assert.equal(calls[0].succeeded, true);

    // Not-found path against a real (unseeded) reference on a second application.
    const app2 = await request(app).post('/api/v1/applications').set(auth(token))
      .send({ type: 'pan_verification' });
    const app2Id = app2.body.data.id;
    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: app2Id, department: 'digital_tax_records', fields_requested: ['fullName'],
    });
    const nf = await request(app).post(`/api/v1/applications/${app2Id}/verify`)
      .set(auth(token)).send({ reference: 'SYNPAN-999999' });
    assert.equal(nf.status, 200);
    assert.equal(nf.body.data.status, 'failed');
    assert.equal(nf.body.data.outcome, 'not_found');

    console.log('[e2e] Live verification against real UIDAI service: PASS');
  } finally {
    // Clean up the citizen we created (cascades to their apps/calls/consents).
    await pool.query('DELETE FROM citizens WHERE lower(email) = $1', [email.toLowerCase()]).catch(() => {});
    await pool.close();
  }
});
