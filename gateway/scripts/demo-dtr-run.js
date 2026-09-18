'use strict';

/**
 * One-off manual demo run: drives a real pan_verification end to end
 * against the running UIDAI service and LEAVES the rows in place so the
 * audit trail can be inspected in Postgres. Not part of the test suite.
 *
 *   node scripts/demo-dtr-run.js
 */

process.env.NODE_ENV = 'development';

const request = require('supertest');
const { createApp } = require('../src/app');
const pool = require('../src/db/pool');

const auth = (t) => ({ Authorization: `Bearer ${t}` });

(async () => {
  const app = createApp();
  const email = `demo+${Date.now()}@example.com`;

  const reg = await request(app).post('/api/v1/auth/register')
    .send({ full_name: 'Demo Citizen', email, password: 'correct-horse-battery' });
  const token = reg.body.data.token;

  const appRes = await request(app).post('/api/v1/applications').set(auth(token))
    .send({ type: 'pan_verification' });
  const applicationId = appRes.body.data.id;

  await request(app).post('/api/v1/consent').set(auth(token))
    .send({ application_id: applicationId, department: 'digital_tax_records', fields_requested: ['fullName', 'filingStatus'] });

  const verify = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference: 'SYNPAN-000123' });

  console.log('citizen email :', email);
  console.log('application   :', applicationId);
  console.log('verify result :', JSON.stringify(verify.body.data));

  await pool.close();
})().catch((e) => { console.error(e); process.exit(1); });
