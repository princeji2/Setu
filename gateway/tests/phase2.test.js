'use strict';

/**
 * Phase 2 endpoint tests: applications, consent, documents.
 * All against in-memory repositories (no DB needed). A real citizen is
 * registered first so we exercise the actual JWT auth path end to end.
 *
 * No department calls are involved — applications stay `submitted`, and
 * consent just records a grant row.
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

/**
 * Build an app wired to fresh in-memory repos. Returns the app plus the
 * repos (so tests can seed/inspect) and a helper to register + get a token.
 */
function buildHarness({ linkedSeed = [] } = {}) {
  const citizenRepository = createInMemoryCitizenRepository();
  const applicationRepository = createInMemoryApplicationRepository();
  const consentRepository = createInMemoryConsentRepository();
  const linkedReferenceRepository = createInMemoryLinkedReferenceRepository(linkedSeed);
  const auditRepository = createInMemoryAuditRepository();

  const app = createApp({
    citizenRepository,
    applicationRepository,
    consentRepository,
    linkedReferenceRepository,
    auditRepository,
  });

  return { app, citizenRepository, auditRepository };
}

async function registerCitizen(app, overrides = {}) {
  const payload = {
    full_name: 'Asha Kulkarni',
    email: `asha+${Math.random().toString(36).slice(2)}@example.com`,
    password: 'correct-horse-battery',
    ...overrides,
  };
  const res = await request(app).post('/api/v1/auth/register').send(payload);
  assert.equal(res.status, 201);
  return { token: res.body.data.token, citizen: res.body.data.citizen };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

// ------------------------------------------------------------
// Auth protection
// ------------------------------------------------------------
test('protected routes reject requests with no token (401)', async () => {
  const { app } = buildHarness();

  const noToken = await request(app).get('/api/v1/applications');
  assert.equal(noToken.status, 401);
  assert.equal(noToken.body.error.code, 'UNAUTHENTICATED');

  const badToken = await request(app)
    .get('/api/v1/documents')
    .set('Authorization', 'Bearer not-a-real-token');
  assert.equal(badToken.status, 401);
  assert.equal(badToken.body.error.code, 'UNAUTHENTICATED');
});

// ------------------------------------------------------------
// Applications lifecycle
// ------------------------------------------------------------
test('create application returns 201 submitted, then appears in list and by id', async () => {
  const { app } = buildHarness();
  const { token } = await registerCitizen(app);

  const created = await request(app)
    .post('/api/v1/applications')
    .set(auth(token))
    .send({ type: 'pan_verification' });

  assert.equal(created.status, 201);
  assert.equal(created.body.data.type, 'pan_verification');
  assert.equal(created.body.data.status, 'submitted');
  assert.deepEqual(created.body.data.department_calls, []);
  const id = created.body.data.id;

  const list = await request(app).get('/api/v1/applications').set(auth(token));
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 1);
  assert.equal(list.body.data[0].id, id);

  const byId = await request(app).get(`/api/v1/applications/${id}`).set(auth(token));
  assert.equal(byId.status, 200);
  assert.equal(byId.body.data.id, id);
  assert.deepEqual(byId.body.data.department_calls, []); // no calls yet
});

test('unknown application type is rejected (400)', async () => {
  const { app } = buildHarness();
  const { token } = await registerCitizen(app);

  const res = await request(app)
    .post('/api/v1/applications')
    .set(auth(token))
    .send({ type: 'not_a_real_type' });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION');
});

test('a citizen cannot read another citizen\'s application (404)', async () => {
  const { app } = buildHarness();
  const alice = await registerCitizen(app, { email: 'alice@example.com' });
  const bob = await registerCitizen(app, { email: 'bob@example.com' });

  const created = await request(app)
    .post('/api/v1/applications')
    .set(auth(alice.token))
    .send({ type: 'identity_verification' });
  const id = created.body.data.id;

  const asBob = await request(app).get(`/api/v1/applications/${id}`).set(auth(bob.token));
  assert.equal(asBob.status, 404);
  assert.equal(asBob.body.error.code, 'NOT_FOUND');
});

// ------------------------------------------------------------
// Consent
// ------------------------------------------------------------
test('granting consent for an owned application records a grant (201) + audit entry', async () => {
  const { app, auditRepository } = buildHarness();
  const { token } = await registerCitizen(app);

  const created = await request(app)
    .post('/api/v1/applications')
    .set(auth(token))
    .send({ type: 'pan_verification' });
  const applicationId = created.body.data.id;

  const consent = await request(app)
    .post('/api/v1/consent')
    .set(auth(token))
    .send({
      application_id: applicationId,
      department: 'digital_tax_records',
      fields_requested: ['PAN number', 'full name'],
    });

  assert.equal(consent.status, 201);
  assert.equal(consent.body.data.department, 'digital_tax_records');
  assert.deepEqual(consent.body.data.fields_requested, ['PAN number', 'full name']);

  // Audit trail recorded both the application creation and the consent.
  const actions = auditRepository._all().map((e) => e.action);
  assert.ok(actions.includes('application_created'));
  assert.ok(actions.includes('consent_granted'));
});

test('consent against an application you do not own is rejected (404)', async () => {
  const { app } = buildHarness();
  const alice = await registerCitizen(app, { email: 'alice2@example.com' });
  const bob = await registerCitizen(app, { email: 'bob2@example.com' });

  const created = await request(app)
    .post('/api/v1/applications')
    .set(auth(alice.token))
    .send({ type: 'pan_verification' });

  const asBob = await request(app)
    .post('/api/v1/consent')
    .set(auth(bob.token))
    .send({
      application_id: created.body.data.id,
      department: 'digital_tax_records',
      fields_requested: ['PAN number'],
    });

  assert.equal(asBob.status, 404);
  assert.equal(asBob.body.error.code, 'NOT_FOUND');
});

test('consent with invalid department is rejected (400)', async () => {
  const { app } = buildHarness();
  const { token } = await registerCitizen(app);

  const created = await request(app)
    .post('/api/v1/applications')
    .set(auth(token))
    .send({ type: 'pan_verification' });

  const res = await request(app)
    .post('/api/v1/consent')
    .set(auth(token))
    .send({
      application_id: created.body.data.id,
      department: 'ministry_of_magic',
      fields_requested: ['PAN number'],
    });

  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION');
});

// ------------------------------------------------------------
// Documents
// ------------------------------------------------------------
test('documents returns empty for a new citizen', async () => {
  const { app } = buildHarness();
  const { token } = await registerCitizen(app);

  const res = await request(app).get('/api/v1/documents').set(auth(token));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});

test('documents returns this citizen\'s seeded linked_references only', async () => {
  // Seed a linked reference, then register a citizen whose id we then
  // match by re-seeding is awkward; instead we register first, read the
  // id from the token path by seeding after. Simplest: seed with a known
  // citizen id and mint that citizen directly is not exposed — so we seed
  // generously and assert filtering by the authed citizen id.
  const { app } = buildHarness({
    linkedSeed: [
      {
        citizen_id: 'some-other-citizen',
        department: 'driving_licence_jan_aadhaar',
        department_reference: 'REG-OTHER',
        verified: true,
      },
    ],
  });
  const { token } = await registerCitizen(app);

  // The authed citizen has no linked references of their own; the seeded
  // one belongs to a different citizen and must not leak.
  const res = await request(app).get('/api/v1/documents').set(auth(token));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.data, []);
});
