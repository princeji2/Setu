'use strict';

/**
 * Composite Workflow tests — Multi-Department Chained Application.
 *
 * Proves that Setu orchestrates a single composite application ("Senior Citizen Transport Concession")
 * across multiple departments (National Identity Registry -> Driving Licence & Jan Aadhaar):
 *   1. Application creation assigns a composite_workflow_id.
 *   2. Consent is enforced for both departments.
 *   3. Backend executes Step 1 (NIR) then automatically passes forward to Step 2 (DLJA).
 *   4. Both department calls are linked under the SAME composite_workflow_id in DB and audit log.
 *   5. Reuse path: verified references from either/both departments are reused via findVerified().
 *   6. Single-department standalone applications remain 100% unaffected.
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

function createMockClients() {
  const nirCalls = [];
  const dljaCalls = [];
  const dtrCalls = [];

  return {
    nirCalls,
    dljaCalls,
    dtrCalls,
    clients: {
      digital_tax_records: {
        department: 'digital_tax_records',
        async fetchFields(ref) {
          dtrCalls.push(ref);
          return {
            outcome: 'success',
            statusCode: 200,
            endpoint: `GET /pan/${ref}/fields`,
            durationMs: 4,
            data: { reference: ref, source_department: 'DTR', verified: true, field_names: ['fullName'] },
            error: null,
          };
        },
      },
      national_identity_registry: {
        department: 'national_identity_registry',
        async fetchFields(ref) {
          nirCalls.push(ref);
          if (ref === 'INVALID-NIR') {
            return {
              outcome: 'not_found',
              statusCode: 404,
              endpoint: `GET /api/registration/${ref}/fields`,
              durationMs: 5,
              data: null,
              error: 'Identity reference not found',
            };
          }
          return {
            outcome: 'success',
            statusCode: 200,
            endpoint: `GET /api/registration/${ref}/fields`,
            durationMs: 5,
            data: { reference: ref, source_department: 'NIR', verified: true, field_names: ['fullName', 'dob'] },
            error: null,
          };
        },
      },
      driving_licence_jan_aadhaar: {
        department: 'driving_licence_jan_aadhaar',
        async fetchFields(ref) {
          dljaCalls.push(ref);
          if (ref === 'INVALID-DLJA') {
            return {
              outcome: 'not_found',
              statusCode: 404,
              endpoint: `GET /api/v1/gateway/registrations/${ref}`,
              durationMs: 6,
              data: null,
              error: 'Registration not found',
            };
          }
          return {
            outcome: 'success',
            statusCode: 200,
            endpoint: `GET /api/v1/gateway/registrations/${ref}`,
            durationMs: 6,
            data: {
              reference: ref,
              source_department: 'DLJA',
              verified: true,
              field_names: ['licence_holder_name', 'licence_expiry_date'],
            },
            error: null,
          };
        },
      },
    },
  };
}

async function setup() {
  const citizenRepo = createInMemoryCitizenRepository();
  const applicationRepo = createInMemoryApplicationRepository();
  const consentRepo = createInMemoryConsentRepository();
  const linkedRefRepo = createInMemoryLinkedReferenceRepository();
  const auditRepo = createInMemoryAuditRepository();
  const mockClients = createMockClients();

  const app = createApp({
    citizenRepository: citizenRepo,
    applicationRepository: applicationRepo,
    consentRepository: consentRepo,
    linkedReferenceRepository: linkedRefRepo,
    auditRepository: auditRepo,
    departmentClients: mockClients.clients,
  });

  const citizen = await citizenRepo.create({
    fullName: 'Senior Citizen Test',
    email: `citizen_${Date.now()}@example.com`,
    passwordHash: 'hash',
  });

  // Login to get token
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: citizen.email, password: 'password' });

  // For testing with mock repo, generate token manually or bypass auth
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ sub: citizen.id, email: citizen.email }, process.env.JWT_SECRET || 'dev_insecure_secret_key_change_in_production_min_32_bytes!');

  return {
    app,
    citizen,
    token,
    applicationRepo,
    consentRepo,
    linkedRefRepo,
    auditRepo,
    mockClients,
  };
}

test('Composite Workflow: Application creation assigns composite_workflow_id', async () => {
  const { app, token } = await setup();

  const res = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'senior_citizen_transport_concession' });

  assert.equal(res.status, 201);
  assert.equal(res.body.success, true);
  assert.equal(res.body.data.type, 'senior_citizen_transport_concession');
  assert.ok(res.body.data.composite_workflow_id, 'Must generate a composite_workflow_id');
});

test('Composite Workflow: Enforces consent for all chained departments', async () => {
  const { app, token } = await setup();

  const appRes = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'senior_citizen_transport_concession' });

  const appId = appRes.body.data.id;

  // Attempt verify without granting consent
  const verifyRes = await request(app)
    .post(`/api/v1/applications/${appId}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      references: {
        nir_reference: 'TESTAADHAAR0001',
        dlja_reference: 'REG-A3F7C291',
      },
    });

  assert.equal(verifyRes.status, 403);
  assert.equal(verifyRes.body.error.code, 'CONSENT_REQUIRED');
});

test('Composite Workflow: Executes NIR step 1 then automatically DLJA step 2 under one composite_workflow_id', async () => {
  const { app, token, citizen, mockClients, applicationRepo, auditRepo } = await setup();

  // 1. Create application
  const appRes = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'senior_citizen_transport_concession' });
  const appId = appRes.body.data.id;
  const compositeId = appRes.body.data.composite_workflow_id;

  // 2. Grant consent for both departments
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: appId,
      department: 'national_identity_registry',
      fields_requested: ['fullName', 'dob'],
    });

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: appId,
      department: 'driving_licence_jan_aadhaar',
      fields_requested: ['licence_holder_name', 'licence_expiry_date'],
    });

  // 3. Verify
  const verifyRes = await request(app)
    .post(`/api/v1/applications/${appId}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      references: {
        nir_reference: 'TESTAADHAAR0001',
        dlja_reference: 'REG-A3F7C291',
      },
    });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.success, true);
  assert.equal(verifyRes.body.data.status, 'complete');
  assert.equal(verifyRes.body.data.composite_workflow_id, compositeId);
  assert.equal(verifyRes.body.data.steps.length, 2);

  // Assert both department clients were called
  assert.deepEqual(mockClients.nirCalls, ['TESTAADHAAR0001']);
  assert.deepEqual(mockClients.dljaCalls, ['REG-A3F7C291']);

  // Assert both calls in DB share the same composite_workflow_id
  const calls = await applicationRepo.findCallsByApplication(appId);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].department, 'national_identity_registry');
  assert.equal(calls[0].composite_workflow_id, compositeId);
  assert.equal(calls[1].department, 'driving_licence_jan_aadhaar');
  assert.equal(calls[1].composite_workflow_id, compositeId);

  // Assert audit trail records composite_workflow_id
  const auditLogs = auditRepo._all().filter((l) => l.citizen_id === citizen.id);
  const deptCallsInAudit = auditLogs.filter((l) => l.action === 'department_call');
  assert.equal(deptCallsInAudit.length, 2);
  const detail0 = typeof deptCallsInAudit[0].detail === 'string' ? JSON.parse(deptCallsInAudit[0].detail) : deptCallsInAudit[0].detail;
  const detail1 = typeof deptCallsInAudit[1].detail === 'string' ? JSON.parse(deptCallsInAudit[1].detail) : deptCallsInAudit[1].detail;
  assert.equal(detail0.composite_workflow_id, compositeId);
  assert.equal(detail1.composite_workflow_id, compositeId);
});

test('Composite Workflow: Reuses previously verified references via findVerified()', async () => {
  const { app, token, citizen, mockClients, linkedRefRepo } = await setup();

  // Pre-seed verified NIR and DLJA references in linked_references
  await linkedRefRepo.markVerified({
    citizenId: citizen.id,
    department: 'national_identity_registry',
    departmentReference: 'PREVERIFIED-NIR-001',
  });
  await linkedRefRepo.markVerified({
    citizenId: citizen.id,
    department: 'driving_licence_jan_aadhaar',
    departmentReference: 'PREVERIFIED-REG-002',
  });

  // Create application
  const appRes = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'senior_citizen_transport_concession' });
  const appId = appRes.body.data.id;

  // Grant consent
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: appId, department: 'national_identity_registry', fields_requested: ['fullName'] });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: appId, department: 'driving_licence_jan_aadhaar', fields_requested: ['licence_holder_name'] });

  // Call verify with ZERO references in request body — reuse engine should resolve both!
  const verifyRes = await request(app)
    .post(`/api/v1/applications/${appId}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({});

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.status, 'complete');
  assert.equal(verifyRes.body.data.steps[0].reused, true);
  assert.equal(verifyRes.body.data.steps[0].reference, 'PREVERIFIED-NIR-001');
  assert.equal(verifyRes.body.data.steps[1].reused, true);
  assert.equal(verifyRes.body.data.steps[1].reference, 'PREVERIFIED-REG-002');

  assert.deepEqual(mockClients.nirCalls, ['PREVERIFIED-NIR-001']);
  assert.deepEqual(mockClients.dljaCalls, ['PREVERIFIED-REG-002']);
});

test('Composite Workflow: Halts and marks failed honestly if Step 1 fails', async () => {
  const { app, token, mockClients } = await setup();

  const appRes = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'senior_citizen_transport_concession' });
  const appId = appRes.body.data.id;

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: appId, department: 'national_identity_registry', fields_requested: ['fullName'] });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: appId, department: 'driving_licence_jan_aadhaar', fields_requested: ['licence_holder_name'] });

  // Step 1 receives INVALID-NIR
  const verifyRes = await request(app)
    .post(`/api/v1/applications/${appId}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      references: {
        nir_reference: 'INVALID-NIR',
        dlja_reference: 'REG-A3F7C291',
      },
    });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.status, 'failed');
  assert.equal(verifyRes.body.data.failed_step, 1);

  // DLJA must NOT have been called
  assert.equal(mockClients.dljaCalls.length, 0);
});

test('Standalone services remain unaffected by composite workflows', async () => {
  const { app, token, mockClients } = await setup();

  const appRes = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'pan_verification' });
  const appId = appRes.body.data.id;

  assert.equal(appRes.body.data.composite_workflow_id, null, 'Standalone app must have composite_workflow_id null');

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: appId, department: 'digital_tax_records', fields_requested: ['fullName'] });

  const verifyRes = await request(app)
    .post(`/api/v1/applications/${appId}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'SYNPAN-000123' });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.status, 'complete');
  assert.equal(verifyRes.body.data.department, 'digital_tax_records');
  assert.deepEqual(mockClients.dtrCalls, ['SYNPAN-000123']);
});
