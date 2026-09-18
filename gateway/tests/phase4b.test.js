'use strict';

/**
 * Phase 4b — reuse path (Story 8).
 *
 * Proves that once a citizen has verified a department, a SECOND application
 * needing that same department goes straight to a fresh, consented, logged
 * fetch WITHOUT the citizen re-entering the reference — and that reuse never
 * becomes a way to skip consent or serve cached data.
 *
 * In-memory harness (deterministic, no DB / no live service). A fake DTR
 * client records every reference it is asked to fetch and how many times, so
 * the test can assert the second call: (a) happened at all — reuse re-fetches,
 * (b) used the STORED reference even though the request body had none.
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

const DEPARTMENT = 'digital_tax_records';
const REF = 'SYNPAN-000123';

// Fake DTR client that records what it was asked to fetch.
function recordingClient() {
  const calls = [];
  return {
    calls,
    department: DEPARTMENT,
    async fetchFields(reference) {
      calls.push(reference);
      return {
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /pan/${reference}/fields`,
        durationMs: 5,
        data: {
          reference,
          source_department: 'DTR',
          verified: true,
          field_names: ['fullName', 'filingStatus'],
          masked_fields: [
            { name: 'fullName', value: 'U*** A****' },
            { name: 'filingStatus', value: 'FILED' },
          ],
        },
        error: null,
      };
    },
  };
}

function buildHarness(client) {
  const repos = {
    citizenRepository: createInMemoryCitizenRepository(),
    applicationRepository: createInMemoryApplicationRepository(),
    consentRepository: createInMemoryConsentRepository(),
    linkedReferenceRepository: createInMemoryLinkedReferenceRepository(),
    auditRepository: createInMemoryAuditRepository(),
  };
  const app = createApp({ ...repos, departmentClients: { [DEPARTMENT]: client } });
  return { app, ...repos };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// The audit repo stores `detail` as a JSON string (mirrors the pg column),
// so parse it back before asserting on fields.
const parsed = (entry) => (typeof entry.detail === 'string' ? JSON.parse(entry.detail) : entry.detail);

async function registerCitizen(app) {
  const reg = await request(app).post('/api/v1/auth/register').send({
    full_name: 'Asha Kulkarni',
    email: `asha+${Math.random().toString(36).slice(2)}@example.com`,
    password: 'correct-horse-battery',
  });
  return reg.body.data.token;
}

async function newApplication(app, token, { withConsent = true } = {}) {
  const appRes = await request(app).post('/api/v1/applications').set(auth(token))
    .send({ type: 'pan_verification' });
  const applicationId = appRes.body.data.id;
  if (withConsent) {
    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: applicationId,
      department: DEPARTMENT,
      fields_requested: ['fullName', 'filingStatus'],
    });
  }
  return applicationId;
}

// ------------------------------------------------------------
// 1. findVerified repository behavior
// ------------------------------------------------------------
test('findVerified returns null when nothing verified, the row once verified', async () => {
  const repo = createInMemoryLinkedReferenceRepository();
  const citizenId = 'citizen-1';

  assert.equal(await repo.findVerified({ citizenId, department: DEPARTMENT }), null);

  await repo.markVerified({ citizenId, department: DEPARTMENT, departmentReference: REF });
  const row = await repo.findVerified({ citizenId, department: DEPARTMENT });
  assert.ok(row);
  assert.equal(row.department_reference, REF);
  assert.equal(row.verified, true);

  // A different department is still null.
  assert.equal(await repo.findVerified({ citizenId, department: 'national_identity_registry' }), null);
});

// ------------------------------------------------------------
// 2. Reuse skip: second application, NO reference supplied
// ------------------------------------------------------------
test('reuse: a second application resolves the stored reference with no re-entry', async () => {
  const client = recordingClient();
  const { app, auditRepository, applicationRepository } = buildHarness(client);
  const token = await registerCitizen(app);

  // First application: verify WITH an explicit reference (first-time flow).
  const firstApp = await newApplication(app, token);
  const first = await request(app).post(`/api/v1/applications/${firstApp}/verify`)
    .set(auth(token)).send({ reference: REF });
  assert.equal(first.status, 200);
  assert.equal(first.body.data.status, 'complete');
  assert.equal(first.body.data.reused, false, 'first verification is not a reuse');

  // Second application: same department, verify with NO reference in the body.
  const secondApp = await newApplication(app, token);
  const second = await request(app).post(`/api/v1/applications/${secondApp}/verify`)
    .set(auth(token)).send({}); // <-- no reference, the whole point

  assert.equal(second.status, 200);
  assert.equal(second.body.data.status, 'complete');
  assert.equal(second.body.data.reused, true, 'second verification reused the stored reference');

  // The gateway still made a FRESH live fetch (reuse re-fetches, not caches),
  // and it used the STORED reference even though the body had none.
  assert.equal(client.calls.length, 2, 'a real fetch happened for BOTH applications');
  assert.equal(client.calls[1], REF, 'the reused fetch used the stored reference');

  // A department-call row was still written for the second application.
  const secondCalls = await applicationRepository.findCallsByApplication(secondApp);
  assert.equal(secondCalls.length, 1);
  assert.equal(secondCalls[0].succeeded, true);

  // The audit trail PROVES the reuse — not inferred from timing.
  const reuseAudit = auditRepository._all()
    .map((e) => ({ action: e.action, detail: parsed(e) }))
    .find((e) => e.action === 'department_call' && e.detail.application_id === secondApp);
  assert.ok(reuseAudit);
  assert.equal(reuseAudit.detail.reused_reference, true);

  // And the first application's audit entry is explicitly NOT a reuse.
  const firstAudit = auditRepository._all()
    .map((e) => ({ action: e.action, detail: parsed(e) }))
    .find((e) => e.action === 'department_call' && e.detail.application_id === firstApp);
  assert.equal(firstAudit.detail.reused_reference, false);
});

// ------------------------------------------------------------
// 3. Reuse still requires consent (Story 3 holds every time)
// ------------------------------------------------------------
test('reuse still requires consent: no consent on the second application -> 403, no fetch', async () => {
  const client = recordingClient();
  const { app, applicationRepository, auditRepository } = buildHarness(client);
  const token = await registerCitizen(app);

  // First application verifies (creates the verified linked_reference).
  const firstApp = await newApplication(app, token);
  await request(app).post(`/api/v1/applications/${firstApp}/verify`)
    .set(auth(token)).send({ reference: REF });
  assert.equal(client.calls.length, 1);

  // Second application WITHOUT consent, no reference.
  const secondApp = await newApplication(app, token, { withConsent: false });
  const res = await request(app).post(`/api/v1/applications/${secondApp}/verify`)
    .set(auth(token)).send({});

  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
  // No additional fetch happened — reuse did not bypass the consent gate.
  assert.equal(client.calls.length, 1, 'reuse must NOT skip the consent check');
  assert.equal((await applicationRepository.findCallsByApplication(secondApp)).length, 0);
  assert.ok(auditRepository._all()
    .map((e) => ({ action: e.action, detail: parsed(e) }))
    .some((e) => e.action === 'department_call_refused' && e.detail.application_id === secondApp));
});

// ------------------------------------------------------------
// 4. Genuine first-time with no reference AND nothing to reuse -> 400
// ------------------------------------------------------------
test('no reference and nothing verified yet -> 400 VALIDATION (nothing to reuse)', async () => {
  const client = recordingClient();
  const { app } = buildHarness(client);
  const token = await registerCitizen(app);

  const appId = await newApplication(app, token);
  const res = await request(app).post(`/api/v1/applications/${appId}/verify`)
    .set(auth(token)).send({}); // no reference, no prior verified row

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION');
  assert.match(res.body.error.message, /reference is required/i);
  assert.equal(client.calls.length, 0, 'no fetch when there is nothing to act on');
});
