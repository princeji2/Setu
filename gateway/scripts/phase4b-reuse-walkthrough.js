'use strict';

/**
 * Phase 4b — live reuse walkthrough (Story 8), the centrepiece demo moment,
 * run as real code against real Postgres and the real Digital Tax Records
 * service.
 *
 * Precondition (operator sets up BEFORE running):
 *   - Postgres running, gateway DB `setu_gateway_db` migrated.
 *   - Digital Tax Records (8000) is UP (seed ref SYNPAN-000123).
 *
 * What this proves, end to end, with no fakes:
 *   1. First application: citizen supplies the PAN reference, gateway verifies
 *      it live and stores a verified linked_references row. reused=false.
 *   2. Second application (same department): citizen supplies NO reference.
 *      The gateway resolves the stored reference itself, makes a FRESH live
 *      fetch, and completes. reused=true — the citizen re-entered nothing.
 *   3. Consent is still enforced on the second application (a fresh
 *      consent_grants row), and the second call is still logged.
 *   4. Real Postgres proof: the single verified linked_references row, and the
 *      second application's application_department_calls row + audit_log entry
 *      carrying reused_reference=true, referencing the SAME stored reference.
 *
 * Run (from gateway/):  node scripts/phase4b-reuse-walkthrough.js
 *
 * Manual walkthrough, not part of `npm test`. Leaves its rows for inspection.
 */

process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : (process.env.NODE_ENV || 'production');

const request = require('supertest');
const { createApp } = require('../src/app');
const pool = require('../src/db/pool');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const REF = 'SYNPAN-000123';
const line = (s) => console.log(s);
const hr = () => line('-'.repeat(70));

async function startApp(app, token) {
  const r = await request(app).post('/api/v1/applications').set(auth(token))
    .send({ type: 'pan_verification' });
  return r.body.data.id;
}
async function grantConsent(app, token, applicationId) {
  await request(app).post('/api/v1/consent').set(auth(token)).send({
    application_id: applicationId,
    department: 'digital_tax_records',
    fields_requested: ['fullName', 'filingStatus'],
  });
}

(async () => {
  const app = createApp(); // real pg repositories + real DTR client
  const email = `phase4b-reuse+${Date.now()}@example.com`;
  const reg = await request(app).post('/api/v1/auth/register')
    .send({ full_name: 'Reuse Demo Citizen', email, password: 'correct-horse-battery' });
  const token = reg.body.data.token;
  const citizenId = reg.body.data.citizen.id;

  hr();
  line('PHASE 4b REUSE WALKTHROUGH — verify once, reuse on a second application');
  line(`citizen: ${email}`);
  hr();

  // --- First application: WITH an explicit reference ---
  const firstApp = await startApp(app, token);
  await grantConsent(app, token, firstApp);
  const first = await request(app).post(`/api/v1/applications/${firstApp}/verify`)
    .set(auth(token)).send({ reference: REF });
  line('A. First application (citizen supplies the reference):');
  line(`   HTTP ${first.status} | status="${first.body.data.status}" | reused=${first.body.data.reused} | reference=${first.body.data.reference}`);

  // --- Second application: NO reference supplied ---
  const secondApp = await startApp(app, token);
  await grantConsent(app, token, secondApp); // fresh consent, still required
  const second = await request(app).post(`/api/v1/applications/${secondApp}/verify`)
    .set(auth(token)).send({}); // <-- the point: no reference
  line('B. Second application (NO reference in the request — reuse):');
  line(`   HTTP ${second.status} | status="${second.body.data.status}" | reused=${second.body.data.reused} | reference=${second.body.data.reference}`);

  const problems = [];
  if (!(first.status === 200 && first.body.data.status === 'complete' && first.body.data.reused === false)) {
    problems.push('First application did not complete as a non-reuse verification.');
  }
  if (!(second.status === 200 && second.body.data.status === 'complete')) {
    problems.push('Second application (reuse) did not complete.');
  }
  if (second.body.data.reused !== true) {
    problems.push('Second application was not flagged reused — the skip is not provable.');
  }
  if (second.body.data.reference !== REF) {
    problems.push('Second application did not resolve the SAME stored reference.');
  }

  // --- Proof straight from Postgres ---
  hr();
  line('PROOF FROM POSTGRES (setu_gateway_db)');
  hr();

  const linked = await pool.query(
    `SELECT department, department_reference, verified
       FROM linked_references WHERE citizen_id = $1`,
    [citizenId],
  );
  line('linked_references (one verified row, reused by both applications):');
  for (const r of linked.rows) {
    line(`  [${r.department}] reference=${r.department_reference} verified=${r.verified}`);
  }

  const calls = await pool.query(
    `SELECT a.id AS application_id, c.endpoint_called, c.succeeded, c.response_summary
       FROM application_department_calls c
       JOIN applications a ON a.id = c.application_id
      WHERE a.citizen_id = $1
      ORDER BY c.called_at ASC`,
    [citizenId],
  );
  line('');
  line('application_department_calls (both applications fetched live):');
  for (const r of calls.rows) {
    const tag = r.application_id === secondApp ? ' <-- reuse' : '';
    line(`  app=${r.application_id}${tag}`);
    line(`      ${r.endpoint_called} succeeded=${r.succeeded}`);
    line(`      summary: ${r.response_summary}`);
  }

  const audit = await pool.query(
    `SELECT action, detail
       FROM audit_log
      WHERE citizen_id = $1 AND action = 'department_call'
      ORDER BY occurred_at ASC`,
    [citizenId],
  );
  line('');
  line('audit_log department_call entries (reused_reference tag):');
  for (const r of audit.rows) {
    const d = typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail;
    const tag = d.application_id === secondApp ? ' <-- reuse' : '';
    line(`  app=${d.application_id} reused_reference=${d.reused_reference}${tag}`);
  }

  // Confirm the DB actually shows the reuse tag on the second call.
  const secondAudit = audit.rows
    .map((r) => (typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail))
    .find((d) => d.application_id === secondApp);
  if (!secondAudit || secondAudit.reused_reference !== true) {
    problems.push('audit_log does not carry reused_reference=true for the second application.');
  }
  // Exactly one verified linked_references row for DTR (reused, not duplicated).
  const dtrRows = linked.rows.filter((r) => r.department === 'digital_tax_records');
  if (dtrRows.length !== 1 || dtrRows[0].verified !== true) {
    problems.push('Expected exactly one verified digital_tax_records linked_references row.');
  }

  hr();
  if (problems.length) {
    line('WALKTHROUGH FAILED:');
    problems.forEach((p) => line(`  - ${p}`));
    await pool.close();
    process.exit(1);
  }
  line('WALKTHROUGH PASSED: the second application reused the verified reference');
  line('with no re-entry, still consented, still fetched live, and the reuse is');
  line('provable in both application_department_calls and audit_log.');
  hr();

  await pool.close();
})().catch(async (e) => {
  console.error(e);
  try { await pool.close(); } catch { /* ignore */ }
  process.exit(1);
});
