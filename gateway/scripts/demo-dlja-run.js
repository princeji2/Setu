'use strict';

/**
 * One-off manual demo run for Driving Licence & Jan Aadhaar: creates a real
 * registration in the DLJA service, then drives driving_licence_registration
 * end to end through the gateway and LEAVES the rows for inspection.
 * Not part of the test suite.
 *
 *   node scripts/demo-dlja-run.js
 */

process.env.NODE_ENV = 'development';

const request = require('supertest');
const { createApp } = require('../src/app');
const config = require('../src/config/env');
const pool = require('../src/db/pool');

const auth = (t) => ({ Authorization: `Bearer ${t}` });
const DLJA = config.departments.driving_licence_jan_aadhaar.baseUrl;

(async () => {
  // 1. Create a real registration in the DLJA service to get a reference.
  const digits13 = String(Date.now()).padStart(13, '0').slice(-13);
  const jan = String(Date.now()).slice(-10);
  const create = await fetch(`${DLJA}/api/v1/registrations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      licence_number: `MH${digits13}`,
      licence_holder_name: 'Demo Driver',
      licence_issue_date: '2023-01-15',
      licence_valid_from: '2023-01-15',
      licence_expiry_date: '2043-01-14',
      jan_aadhaar_id: jan,
      family_members_count: 3,
    }),
  });
  const reference = (await create.json()).data.registration_reference;

  // 2. Drive it through the gateway.
  const app = createApp();
  const email = `demo-dlja+${Date.now()}@example.com`;
  const reg = await request(app).post('/api/v1/auth/register')
    .send({ full_name: 'Demo DLJA Citizen', email, password: 'correct-horse-battery' });
  const token = reg.body.data.token;

  const appRes = await request(app).post('/api/v1/applications').set(auth(token))
    .send({ type: 'driving_licence_registration' });
  const applicationId = appRes.body.data.id;

  await request(app).post('/api/v1/consent').set(auth(token))
    .send({ application_id: applicationId, department: 'driving_licence_jan_aadhaar', fields_requested: ['licence_holder_name', 'verification_status'] });

  const verify = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference });

  console.log('citizen email :', email);
  console.log('reference     :', reference);
  console.log('application   :', applicationId);
  console.log('verify result :', JSON.stringify(verify.body.data));

  await pool.close();
})().catch((e) => { console.error(e); process.exit(1); });
