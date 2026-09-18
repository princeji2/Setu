'use strict';

/**
 * LIVE end-to-end check against the REAL running Driving Licence & Jan
 * Aadhaar portal. Drives the actual driving-licence-jan-aadhaar-client over
 * HTTP — no fakes.
 *
 * DLJA ships with NO seeded registrations (references are REG-XXXXXXXX,
 * created only via POST), so this test first creates a real registration
 * directly against the DLJA service to obtain a live reference, then
 * verifies it through the gateway. This is a more honest e2e: real data is
 * created in the department, then the gateway fetches it back.
 *
 * Requires the DLJA service on DLJA_SERVICE_URL (default :3001) and the
 * gateway's Postgres. Skips (does not fail) if either is unreachable.
 * Run with `npm run test:e2e:dlja`.
 */

process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : (process.env.NODE_ENV || 'development');

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const config = require('../src/config/env');
const pool = require('../src/db/pool');

const auth = (token) => ({ Authorization: `Bearer ${token}` });
const DLJA = config.departments.driving_licence_jan_aadhaar.baseUrl;

async function reachable() {
  try {
    await pool.query('SELECT 1');
  } catch (err) {
    console.warn(`[e2e-dlja] Gateway Postgres not reachable, skipping: ${err.message}`);
    return false;
  }
  try {
    const res = await fetch(`${DLJA}/api/v1/health`, { signal: AbortSignal.timeout(2000) });
    if (!res.ok && res.status !== 503) throw new Error(`health returned ${res.status}`);
  } catch (err) {
    console.warn(`[e2e-dlja] DLJA service not reachable, skipping: ${err.message}`);
    return false;
  }
  return true;
}

// Create a real registration directly in the DLJA service; returns its REG- reference.
async function createRegistration() {
  // Licence must match ^[A-Z]{2}[0-9]{2}[0-9]{4}[0-9]{7}$ = 2 letters + 13
  // digits. jan_aadhaar_id must be exactly 10 digits. Both derived from the
  // clock to stay unique and avoid the duplicate-collision 409. Holder name
  // must be letters/spaces only (no digits) per the service's name regex.
  const digits13 = String(Date.now()).padStart(13, '0').slice(-13);
  const jan = String(Date.now()).slice(-10);            // 10 digits
  const licence = `MH${digits13}`;                      // MH + 13 digits = 15 chars
  const res = await fetch(`${DLJA}/api/v1/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licence_number: licence,
      licence_holder_name: 'Test Driver',               // letters/spaces only
      licence_issue_date: '2023-01-15',
      licence_valid_from: '2023-01-15',
      licence_expiry_date: '2043-01-14',
      jan_aadhaar_id: jan,
      family_members_count: 3,
    }),
    signal: AbortSignal.timeout(3000),
  });
  const body = await res.json();
  assert.equal(res.status, 201, `expected 201 creating a registration, got ${res.status}: ${JSON.stringify(body)}`);
  return body.data.registration_reference;
}

test('LIVE e2e: driving_licence_registration against the real DLJA service completes', async (t) => {
  if (!(await reachable())) {
    t.skip('gateway Postgres or DLJA service not reachable');
    return;
  }

  const reference = await createRegistration();
  const app = createApp(); // real pg repos + real DLJA client
  const email = `e2e-dlja+${Date.now()}@example.com`;

  try {
    const reg = await request(app).post('/api/v1/auth/register').send({
      full_name: 'E2E DLJA Tester', email, password: 'correct-horse-battery',
    });
    assert.equal(reg.status, 201);
    const token = reg.body.data.token;

    const appRes = await request(app).post('/api/v1/applications').set(auth(token))
      .send({ type: 'driving_licence_registration' });
    const applicationId = appRes.body.data.id;

    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: applicationId, department: 'driving_licence_jan_aadhaar',
      fields_requested: ['licence_holder_name', 'verification_status'],
    });

    // Happy path against the reference we just created in the real service.
    const ok = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
      .set(auth(token)).send({ reference });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.status, 'complete', `expected DLJA to verify ${reference}`);
    assert.equal(ok.body.data.verified, true);

    const detail = await request(app).get(`/api/v1/applications/${applicationId}`).set(auth(token));
    const calls = detail.body.data.department_calls;
    assert.equal(calls.length, 1);
    assert.equal(calls[0].status_code, 200);
    assert.equal(calls[0].succeeded, true);
    assert.equal(calls[0].department, 'driving_licence_jan_aadhaar');

    // Not-found path against a real (nonexistent) reference on a 2nd application.
    const app2 = await request(app).post('/api/v1/applications').set(auth(token))
      .send({ type: 'driving_licence_registration' });
    const app2Id = app2.body.data.id;
    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: app2Id, department: 'driving_licence_jan_aadhaar', fields_requested: ['verification_status'],
    });
    const nf = await request(app).post(`/api/v1/applications/${app2Id}/verify`)
      .set(auth(token)).send({ reference: 'REG-DEADBEEF' });
    assert.equal(nf.status, 200);
    assert.equal(nf.body.data.status, 'failed');
    assert.equal(nf.body.data.outcome, 'not_found');

    console.log(`[e2e-dlja] Live verification against real DLJA service (${reference}): PASS`);
  } finally {
    await pool.query('DELETE FROM citizens WHERE lower(email) = $1', [email.toLowerCase()]).catch(() => {});
    await pool.close();
  }
});
