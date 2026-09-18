'use strict';

/**
 * Phase 4 — live failure walkthrough (the demo's "what if a department is
 * down?" moment, run as real code against real Postgres).
 *
 * Precondition (set up by the operator BEFORE running this):
 *   - Postgres is running, gateway DB `setu_gateway_db` migrated.
 *   - Digital Tax Records (8000) and National Identity Registry (5000) are UP.
 *   - Driving Licence & Jan Aadhaar (3001) is STOPPED.
 *
 * What this proves, end to end, with no fakes:
 *   1. A citizen relay to a healthy department (DTR) still COMPLETES while a
 *      sibling department is down — the failure is isolated, not global.
 *   2. A citizen relay to the stopped department (DLJA) returns HTTP 200 with
 *      body status "failed" and an honest, non-sensitive message — never a
 *      substituted fake success (api.md relay-outcome convention).
 *   3. BOTH outcomes are durably recorded: a row in
 *      application_department_calls (succeeded true/false, real endpoint) and
 *      a summary in audit_log. We read those rows back straight from Postgres
 *      so a judge can see the failure was handled, not swallowed.
 *
 * Run (from gateway/):  node scripts/phase4-failure-walkthrough.js
 *
 * This is a manual walkthrough script, not part of `npm test`. It leaves its
 * rows in the DB on purpose so they can be inspected afterwards.
 */

// Use a non-development env so the pool's per-query debug logging stays quiet
// and the proof output below is readable. (Still the real pg repositories.)
process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : (process.env.NODE_ENV || 'production');

const request = require('supertest');
const { createApp } = require('../src/app');
const config = require('../src/config/env');
const pool = require('../src/db/pool');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const DTR = config.departments.digital_tax_records.baseUrl;
const line = (s) => console.log(s);
const hr = () => line('-'.repeat(70));

async function relay(app, { token, type, department, fields, reference }) {
  const appRes = await request(app).post('/api/v1/applications').set(auth(token)).send({ type });
  const applicationId = appRes.body.data.id;
  await request(app).post('/api/v1/consent').set(auth(token))
    .send({ application_id: applicationId, department, fields_requested: fields });
  const verify = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference });
  return { applicationId, httpStatus: verify.status, body: verify.body };
}

(async () => {
  const app = createApp(); // real pg repositories + real department clients

  // A fresh citizen for this walkthrough.
  const email = `phase4-walkthrough+${Date.now()}@example.com`;
  const reg = await request(app).post('/api/v1/auth/register')
    .send({ full_name: 'Phase Four Citizen', email, password: 'correct-horse-battery' });
  const token = reg.body.data.token;
  const citizenId = reg.body.data.citizen ? reg.body.data.citizen.id : reg.body.data.id;

  hr();
  line('PHASE 4 FAILURE WALKTHROUGH — DLJA (3001) is stopped; DTR + NIR are up');
  line(`citizen: ${email}`);
  hr();

  // --- A. Healthy department (DTR) still completes ---
  const healthy = await relay(app, {
    token,
    type: 'pan_verification',
    department: 'digital_tax_records',
    fields: ['fullName', 'filingStatus'],
    reference: 'SYNPAN-000123',
  });
  line('A. DTR relay (department UP):');
  line(`   HTTP ${healthy.httpStatus} | status="${healthy.body.data.status}" | verified=${healthy.body.data.verified}`);

  // --- B. Stopped department (DLJA) fails honestly ---
  const failed = await relay(app, {
    token,
    type: 'driving_licence_registration',
    department: 'driving_licence_jan_aadhaar',
    fields: ['licence_holder_name', 'verification_status'],
    reference: 'REG-DOWNTEST',
  });
  line('B. DLJA relay (department DOWN):');
  line(`   HTTP ${failed.httpStatus} | status="${failed.body.data.status}" | outcome="${failed.body.data.outcome}"`);
  line(`   message: ${failed.body.data.message}`);

  // Assertions so the script fails loudly if the convention is broken.
  const problems = [];
  if (healthy.httpStatus !== 200 || healthy.body.data.status !== 'complete') {
    problems.push('DTR relay did not complete while a sibling department was down.');
  }
  if (failed.httpStatus !== 200) {
    problems.push(`DLJA failure returned HTTP ${failed.httpStatus}, expected 200 (department failure is a completed request, not a transport error).`);
  }
  if (failed.body.data.status !== 'failed') {
    problems.push(`DLJA relay status was "${failed.body.data.status}", expected "failed".`);
  }
  if ('verified' in failed.body.data) {
    problems.push('DLJA failure body leaked a "verified" result — must never fake success on failure.');
  }

  // --- Proof straight from Postgres ---
  hr();
  line('PROOF FROM POSTGRES (setu_gateway_db)');
  hr();

  const calls = await pool.query(
    `SELECT a.type,
            c.department,
            c.endpoint_called,
            c.status_code,
            c.succeeded,
            c.response_summary,
            c.duration_ms
       FROM application_department_calls c
       JOIN applications a ON a.id = c.application_id
      WHERE a.citizen_id = $1
      ORDER BY c.called_at ASC`,
    [citizenId],
  );
  line('application_department_calls:');
  for (const r of calls.rows) {
    line(`  [${r.department}] ${r.endpoint_called}`);
    line(`      status_code=${r.status_code} succeeded=${r.succeeded} duration_ms=${r.duration_ms}`);
    line(`      summary: ${r.response_summary}`);
  }

  const audit = await pool.query(
    `SELECT action, detail
       FROM audit_log
      WHERE citizen_id = $1
      ORDER BY occurred_at ASC`,
    [citizenId],
  );
  line('');
  line('audit_log:');
  for (const r of audit.rows) {
    const d = typeof r.detail === 'string' ? r.detail : JSON.stringify(r.detail);
    line(`  ${r.action} :: ${d}`);
  }

  // Confirm the DB actually holds one succeeded and one failed department call.
  const succeededCount = calls.rows.filter((r) => r.succeeded === true).length;
  const failedCount = calls.rows.filter((r) => r.succeeded === false).length;
  hr();
  line(`SUMMARY: ${succeededCount} succeeded call row(s), ${failedCount} failed call row(s) persisted.`);
  if (succeededCount < 1) problems.push('No succeeded department-call row found in Postgres.');
  if (failedCount < 1) problems.push('No failed department-call row found in Postgres — a failure was swallowed.');

  const failedAudit = audit.rows.some(
    (r) => r.action === 'application_status_change'
      && (typeof r.detail === 'string' ? r.detail.includes('failed') : r.detail.status === 'failed'),
  );
  if (!failedAudit) problems.push('No audit_log entry recording the application moving to "failed".');

  hr();
  if (problems.length) {
    line('WALKTHROUGH FAILED:');
    problems.forEach((p) => line(`  - ${p}`));
    await pool.close();
    process.exit(1);
  }
  line('WALKTHROUGH PASSED: healthy department completed, stopped department failed');
  line('honestly, and both outcomes are durably recorded in Postgres.');
  hr();

  await pool.close();
})().catch(async (e) => {
  console.error(e);
  try { await pool.close(); } catch { /* ignore */ }
  process.exit(1);
});
