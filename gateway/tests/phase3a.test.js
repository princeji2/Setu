'use strict';

/**
 * Step 3a tests — pan_verification relay to Digital Tax Records.
 *
 * The relay logic (consent enforcement, status transitions, call +
 * audit logging, complete/failed resolution) is tested with FAKE injected
 * department clients so outcomes are deterministic and don't depend on the
 * real service being up. The live end-to-end check against the running
 * UIDAI service is a separate script (see package.json test:e2e).
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

// ---- Fake department clients (deterministic outcomes) ----
const fakeSuccessClient = {
  department: 'digital_tax_records',
  async fetchFields(reference) {
    return {
      outcome: 'success',
      statusCode: 200,
      endpoint: `GET /pan/${reference}/fields`,
      durationMs: 5,
      data: { reference, source_department: 'DTR', verified: true, field_names: ['fullName', 'filingStatus'] },
      error: null,
    };
  },
};

const fakeUnreachableClient = {
  department: 'digital_tax_records',
  async fetchFields(reference) {
    return {
      outcome: 'unreachable',
      statusCode: null,
      endpoint: `GET /pan/${reference}/fields`,
      durationMs: 12,
      data: null,
      error: 'Could not reach Digital Tax Records.',
    };
  },
};

const fakeTimeoutClient = {
  department: 'digital_tax_records',
  async fetchFields(reference) {
    return {
      outcome: 'timeout',
      statusCode: null,
      endpoint: `GET /pan/${reference}/fields`,
      durationMs: 5000,
      data: null,
      error: 'Digital Tax Records did not respond in time.',
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
  const app = createApp({
    ...repos,
    departmentClients: { digital_tax_records: client },
  });
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

  const appRes = await request(app)
    .post('/api/v1/applications')
    .set(auth(token))
    .send({ type: 'pan_verification' });
  const applicationId = appRes.body.data.id;

  if (withConsent) {
    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: applicationId,
      department: 'digital_tax_records',
      fields_requested: ['fullName', 'filingStatus'],
    });
  }
  return { token, applicationId };
}

// ------------------------------------------------------------
// 1. Consent-blocked call is refused (no department call made)
// ------------------------------------------------------------
test('verify without consent is refused (403) and makes no department call', async () => {
  let called = false;
  const spyClient = {
    department: 'digital_tax_records',
    async fetchFields(ref) { called = true; return fakeSuccessClient.fetchFields(ref); },
  };
  const { app, applicationRepository, auditRepository } = buildHarness({ client: spyClient });
  const { token, applicationId } = await setup(app, { withConsent: false });

  const res = await request(app)
    .post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token))
    .send({ reference: 'SYNPAN-000123' });

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
  assert.equal(called, false, 'the department must NOT be called without consent');

  // No department-call row; a refusal audit entry exists; app not completed.
  const calls = await applicationRepository.findCallsByApplication(applicationId);
  assert.equal(calls.length, 0);
  assert.ok(auditRepository._all().some((e) => e.action === 'department_call_refused'));
});

// ------------------------------------------------------------
// 2. Successful call -> complete + correct rows
// ------------------------------------------------------------
test('verify with consent succeeds -> status complete, call+audit rows, reference verified', async () => {
  const { app, applicationRepository, auditRepository, linkedReferenceRepository } =
    buildHarness({ client: fakeSuccessClient });
  const { token, applicationId } = await setup(app);

  const res = await request(app)
    .post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token))
    .send({ reference: 'SYNPAN-000123' });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'complete');
  assert.equal(res.body.data.verified, true);

  // Application status persisted as complete.
  const byId = await request(app).get(`/api/v1/applications/${applicationId}`).set(auth(token));
  assert.equal(byId.body.data.status, 'complete');

  // Exactly one department-call row, marked succeeded, with the endpoint.
  const calls = await applicationRepository.findCallsByApplication(applicationId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].succeeded, true);
  assert.equal(calls[0].status_code, 200);
  assert.match(calls[0].endpoint_called, /^GET \/pan\/SYNPAN-000123\/fields$/);

  // Audit trail includes the department_call and a status change to complete.
  const actions = auditRepository._all().map((e) => e.action);
  assert.ok(actions.includes('department_call'));
  assert.ok(actions.includes('application_status_change'));

  // linked_references now shows the verified reference (documents view).
  const docs = await request(app).get('/api/v1/documents').set(auth(token));
  assert.equal(docs.body.data.length, 1);
  assert.equal(docs.body.data[0].department, 'digital_tax_records');
  assert.equal(docs.body.data[0].verified, true);
});

// ------------------------------------------------------------
// 3. Department unreachable -> failed + honest message + failed row
// ------------------------------------------------------------
test('verify when department is unreachable -> status failed, honest message, failed call row', async () => {
  const { app, applicationRepository } = buildHarness({ client: fakeUnreachableClient });
  const { token, applicationId } = await setup(app);

  const res = await request(app)
    .post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token))
    .send({ reference: 'SYNPAN-000123' });

  assert.equal(res.status, 200); // business-level failure, not an HTTP error
  assert.equal(res.body.data.status, 'failed');
  assert.equal(res.body.data.outcome, 'unreachable');
  assert.match(res.body.data.message, /could not reach/i);
  assert.ok(!('verified' in res.body.data), 'must not report a verified result on failure');

  const calls = await applicationRepository.findCallsByApplication(applicationId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].succeeded, false);
  assert.equal(calls[0].status_code, null);
});

// ------------------------------------------------------------
// 4. Department timeout -> failed + honest message + failed row
// ------------------------------------------------------------
test('verify on department timeout -> status failed, timeout message, failed call row', async () => {
  const { app, applicationRepository } = buildHarness({ client: fakeTimeoutClient });
  const { token, applicationId } = await setup(app);

  const res = await request(app)
    .post(`/api/v1/applications/${applicationId}/verify`)
    .set(auth(token))
    .send({ reference: 'SYNPAN-000123' });

  assert.equal(res.status, 200);
  assert.equal(res.body.data.status, 'failed');
  assert.equal(res.body.data.outcome, 'timeout');
  assert.match(res.body.data.message, /did not respond in time/i);

  const calls = await applicationRepository.findCallsByApplication(applicationId);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].succeeded, false);
});
