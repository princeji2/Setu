'use strict';

/**
 * Step 3b tests — identity_verification relay to National Identity Registry.
 *
 * Same four cases as phase3a (consent-blocked, success, unreachable,
 * timeout), using FAKE injected clients so outcomes are deterministic and
 * DB-independent. NO token-expiry/retry test: the real NIR gateway endpoint
 * uses a static X-Gateway-Key with no token expiry (confirmed by reading
 * the source in Step 3b), so there is nothing to retry. The live e2e check
 * against the real service is in tests/nir.e2e.test.js.
 */

process.env.NODE_ENV = 'test';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { createInMemoryCitizenRepository } = require('../src/citizen-api/repositories/citizen-repository');
const { createInMemoryApplicationRepository } = require('../src/citizen-api/repositories/application-repository');
const { createInMemoryConsentRepository } = require('../src/citizen-api/repositories/consent-repository');
const { createInMemoryLinkedReferenceRepository } = require('../src/citizen-api/repositories/linked-reference-repository');
const { createInMemoryAuditRepository } = require('../src/citizen-api/repositories/audit-repository');

const DEPARTMENT = 'national_identity_registry';
const REF = 'TESTAADHAAR0001';

const fakeSuccessClient = {
  department: DEPARTMENT,
  async fetchFields(reference) {
    return {
      outcome: 'success', statusCode: 200,
      endpoint: `GET /api/registration/${reference}/fields`, durationMs: 6,
      data: { reference, source_department: 'NIR', verified: true, field_names: ['fullName', 'dob', 'gender', 'address'] },
      error: null,
    };
  },
};

const fakeUnreachableClient = {
  department: DEPARTMENT,
  async fetchFields(reference) {
    return {
      outcome: 'unreachable', statusCode: null,
      endpoint: `GET /api/registration/${reference}/fields`, durationMs: 11,
      data: null, error: 'Could not reach National Identity Registry.',
    };
  },
};

const fakeTimeoutClient = {
  department: DEPARTMENT,
  async fetchFields(reference) {
    return {
      outcome: 'timeout', statusCode: null,
      endpoint: `GET /api/registration/${reference}/fields`, durationMs: 5000,
      data: null, error: 'National Identity Registry did not respond in time.',
    };
  },
};

function buildHarness({ client = fakeSuccessClient } = {}) {
  const repos = {
    citizenRepository: createInMemoryCitizenRepository(),
    applicationRepository: createInMemoryApplicationRepository(),
    consentRepository: createInMemoryConsentRepository(),
    linkedReferenceRepository: createInMemoryLinkedReferenceRepository(),
    auditRepository: createInMemoryAuditRepository(),
  };
  // Keep the real DTR client entry harmless by omitting it; only NIR needed.
  const app = createApp({ ...repos, departmentClients: { [DEPARTMENT]: client } });
  return { app, ...repos };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function setup(app, { withConsent = true } = {}) {
  const reg = await request(app).post('/api/v1/auth/register').send({
    full_name: 'Asha Kulkarni',
    email: `asha+${Math.random().toString(36).slice(2)}@example.com`,
    password: 'correct-horse-battery',
  });
  const token = reg.body.data.token;

  const appRes = await request(app).post('/api/v1/applications').set(auth(token))
    .send({ type: 'identity_verification' });
  const applicationId = appRes.body.data.id;

  if (withConsent) {
    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: applicationId,
      department: DEPARTMENT,
      fields_requested: ['fullName', 'dob'],
    });
  }
  return { token, applicationId };
}

test('NIR: verify without consent is refused (403) and makes no department call', async () => {
  let called = false;
  const spy = { department: DEPARTMENT, async fetchFields(r) { called = true; return fakeSuccessClient.fetchFields(r); } };
  const { app, applicationRepository, auditRepository } = buildHarness({ client: spy });
  const { token, applicationId } = await setup(app, { withConsent: false });

  const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference: REF });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
  assert.equal(called, false);
  assert.equal((await applicationRepository.findCallsByApplication(applicationId)).length, 0);
  assert.ok(auditRepository._all().some((e) => e.action === 'department_call_refused'));
});

test('NIR: verify with consent succeeds -> complete, call+audit rows, reference verified', async () => {
  const { app, applicationRepository, auditRepository } = buildHarness({ client: fakeSuccessClient });
  const { token, applicationId } = await setup(app);

  const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference: REF });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'complete');
  assert.equal(res.body.data.department, DEPARTMENT);
  assert.equal(res.body.data.verified, true);

  const calls = await applicationRepository.findCallsByApplication(applicationId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].succeeded, true);
  assert.equal(calls[0].department, DEPARTMENT);
  assert.match(calls[0].endpoint_called, /^GET \/api\/registration\/TESTAADHAAR0001\/fields$/);

  const actions = auditRepository._all().map((e) => e.action);
  assert.ok(actions.includes('department_call'));
  assert.ok(actions.includes('application_status_change'));

  const docs = await request(app).get('/api/v1/documents').set(auth(token));
  assert.equal(docs.body.data.length, 1);
  assert.equal(docs.body.data[0].department, DEPARTMENT);
  assert.equal(docs.body.data[0].verified, true);
});

test('NIR: unreachable -> failed, honest message, failed call row', async () => {
  const { app, applicationRepository } = buildHarness({ client: fakeUnreachableClient });
  const { token, applicationId } = await setup(app);

  const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference: REF });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'failed');
  assert.equal(res.body.data.outcome, 'unreachable');
  assert.match(res.body.data.message, /could not reach national identity registry/i);

  const calls = await applicationRepository.findCallsByApplication(applicationId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].succeeded, false);
  assert.equal(calls[0].status_code, null);
});

test('NIR: timeout -> failed, timeout message, failed call row', async () => {
  const { app, applicationRepository } = buildHarness({ client: fakeTimeoutClient });
  const { token, applicationId } = await setup(app);

  const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token)).send({ reference: REF });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'failed');
  assert.equal(res.body.data.outcome, 'timeout');
  assert.match(res.body.data.message, /did not respond in time/i);

  const calls = await applicationRepository.findCallsByApplication(applicationId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].succeeded, false);
});
