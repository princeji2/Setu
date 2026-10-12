'use strict';

/**
 * verify_e2e_all.js — live end-to-end verification through the gateway
 * (in-process via supertest) against the three REAL department services
 * running locally (DTR:8000, NIR:5000, DLJA:3001).
 *
 * Covers all 8 document types + reuse flow. Prints a PASS/FAIL table with
 * outcome code and status per case. Leaves rows in Postgres for inspection.
 *
 * Run (from gateway/, with the 3 dept services up):
 *   node scripts/verify_e2e_all.js
 */

process.env.NODE_ENV = 'development';

const request = require('supertest');
const { createApp } = require('../src/app');
const pool = require('../src/db/pool');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

// department per type -> fields_requested used for consent
const DEPT = {
  pan_verification: 'digital_tax_records',
  income_certificate_verification: 'digital_tax_records',
  identity_verification: 'national_identity_registry',
  voter_id_verification: 'national_identity_registry',
  birth_certificate_verification: 'national_identity_registry',
  driving_licence_registration: 'driving_licence_jan_aadhaar',
  vehicle_rc_verification: 'driving_licence_jan_aadhaar',
  passport_verification: 'driving_licence_jan_aadhaar',
};

const CASES = [
  { label: 'PAN',                 type: 'pan_verification',                 ref: 'SYNPAN-000123' },
  { label: 'Income Certificate',  type: 'income_certificate_verification',  ref: 'INC-2026-000101' },
  { label: 'Identity',            type: 'identity_verification',            ref: 'TESTAADHAAR0001' },
  { label: 'Voter ID',            type: 'voter_id_verification',            ref: 'VOTER-DL-000101' },
  { label: 'Birth Certificate',   type: 'birth_certificate_verification',   ref: 'BIRTH-DEL-000101' },
  { label: 'Driving Licence',     type: 'driving_licence_registration',     ref: 'REG-A3F7C291' },
  { label: 'Vehicle RC',          type: 'vehicle_rc_verification',          ref: 'RC-000101' },
  { label: 'Passport',            type: 'passport_verification',            ref: 'PASS-000101' },
];

async function newCitizen(app, tag) {
  const email = `e2e-${tag}+${Date.now()}@example.com`;
  const reg = await request(app).post('/api/v1/auth/register')
    .send({ full_name: 'E2E Citizen', email, password: 'correct-horse-battery' });
  return { token: reg.body.data.token, citizenId: reg.body.data.citizen.id, email };
}

async function runCase(app, token, c) {
  const dept = DEPT[c.type];
  const appRes = await request(app).post('/api/v1/applications').set(auth(token))
    .send({ type: c.type });
  const applicationId = appRes.body.data?.id;
  if (!applicationId) {
    return { ...c, httpStatus: appRes.status, outcome: 'create_failed', status: null, pass: false, raw: appRes.body };
  }
  await request(app).post('/api/v1/consent').set(auth(token))
    .send({ application_id: applicationId, department: dept, fields_requested: ['field'] });
  const v = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference: c.ref });
  const d = v.body.data || {};
  const pass = v.status === 200 && d.status === 'complete';
  return {
    ...c, applicationId,
    httpStatus: v.status,
    outcome: d.outcome || (d.status === 'complete' ? 'success' : 'n/a'),
    status: d.status,
    reused: d.reused,
    pass,
    raw: v.body,
  };
}

(async () => {
  const app = createApp();
  console.log('\n============================================================');
  console.log('LIVE E2E VERIFICATION — gateway (in-process) -> real dept HTTP');
  console.log('============================================================\n');

  const { token } = await newCitizen(app, 'main');
  const results = [];
  for (const c of CASES) {
    try {
      results.push(await runCase(app, token, c));
    } catch (e) {
      results.push({ ...c, httpStatus: 'ERR', outcome: 'exception', status: null, pass: false, raw: { message: e.message } });
    }
  }

  console.log('DOCUMENT TYPE               | HTTP | STATUS    | OUTCOME   | PASS');
  console.log('----------------------------|------|-----------|-----------|-----');
  for (const r of results) {
    console.log(
      `${r.label.padEnd(27)} | ${String(r.httpStatus).padEnd(4)} | ${String(r.status).padEnd(9)} | ${String(r.outcome).padEnd(9)} | ${r.pass ? 'PASS' : 'FAIL'}`
    );
    if (!r.pass) console.log(`   raw: ${JSON.stringify(r.raw)}`);
  }

  // ---- Reuse flow: fresh citizen, verify PAN once (with ref), then a 2nd app with NO ref ----
  console.log('\n--- REUSE FLOW (2nd application, no reference re-entered) ---');
  const reuse = await newCitizen(app, 'reuse');
  const first = await runCase(app, reuse.token, { label: 'PAN (first)', type: 'pan_verification', ref: 'SYNPAN-000123' });

  const a2 = await request(app).post('/api/v1/applications').set(auth(reuse.token)).send({ type: 'pan_verification' });
  const a2id = a2.body.data.id;
  await request(app).post('/api/v1/consent').set(auth(reuse.token))
    .send({ application_id: a2id, department: 'digital_tax_records', fields_requested: ['field'] });
  const v2 = await request(app).post(`/api/v1/applications/${a2id}/verify`).set(auth(reuse.token)).send({}); // no ref
  const d2 = v2.body.data || {};
  const reusePass = v2.status === 200 && d2.status === 'complete' && d2.reused === true && d2.reference === 'SYNPAN-000123';
  console.log(`first  : HTTP ${first.httpStatus} status=${first.status} reused=${first.reused}`);
  console.log(`second : HTTP ${v2.status} status=${d2.status} reused=${d2.reused} reference=${d2.reference}`);
  console.log(`REUSE  : ${reusePass ? 'PASS' : 'FAIL'}`);
  if (!reusePass) console.log(`   raw: ${JSON.stringify(v2.body)}`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n============================================================`);
  console.log(`Document types: ${passed}/${results.length} passed | Reuse: ${reusePass ? 'PASS' : 'FAIL'}`);
  console.log(`============================================================\n`);

  await pool.close();
  if (passed !== results.length || !reusePass) process.exit(1);
})().catch(async (e) => { console.error(e); try { await pool.close(); } catch {} process.exit(1); });
