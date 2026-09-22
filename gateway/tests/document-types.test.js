'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const { createApp } = require('../src/app');
const { createDigitalTaxRecordsClient } = require('../src/department-clients/digital-tax-records-client');
const { createNationalIdentityRegistryClient } = require('../src/department-clients/national-identity-registry-client');
const { createDrivingLicenceJanAadhaarClient } = require('../src/department-clients/driving-licence-jan-aadhaar-client');

const { createInMemoryCitizenRepository } = require('../src/citizen-api/repositories/citizen-repository');
const { createInMemoryApplicationRepository } = require('../src/citizen-api/repositories/application-repository');
const { createInMemoryConsentRepository } = require('../src/citizen-api/repositories/consent-repository');
const { createInMemoryLinkedReferenceRepository } = require('../src/citizen-api/repositories/linked-reference-repository');
const { createInMemoryAuditRepository } = require('../src/citizen-api/repositories/audit-repository');

// ---------------------------------------------------------------------------
// 1. Client Routing Tests: Verify client fetchFields routes to correct endpoints
// ---------------------------------------------------------------------------
test('DTR Client: routes PANCARD- and INC- references to dedicated endpoints', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          reference: url.includes('pan-card') ? 'PANCARD-000102' : 'INC-2026-000102',
          sourceDepartment: 'Digital Tax Records',
          fields: [{ name: 'fullName', value: 'Aditi Rao', verified: true }],
        },
      }),
    };
  };

  const client = createDigitalTaxRecordsClient({
    baseUrl: 'http://dtr.test:8000',
    gatewayKey: 'test-key',
    fetchImpl: fakeFetch,
  });

  // Test PAN Card routing
  const panRes = await client.fetchFields('PANCARD-000102');
  assert.equal(panRes.outcome, 'success');
  assert.equal(panRes.endpoint, 'GET /pan-card/PANCARD-000102/fields');
  assert.equal(calls[0].url, 'http://dtr.test:8000/pan-card/PANCARD-000102/fields');

  // Test Income Certificate routing
  const incRes = await client.fetchFields('INC-2026-000102');
  assert.equal(incRes.outcome, 'success');
  assert.equal(incRes.endpoint, 'GET /income-certificate/INC-2026-000102/fields');
  assert.equal(calls[1].url, 'http://dtr.test:8000/income-certificate/INC-2026-000102/fields');
});

test('NIR Client: routes VOTER- and BIRTH- references to dedicated endpoints', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          identityReference: url.includes('voter-id') ? 'VOTER-DL-000102' : 'BIRTH-DEL-000102',
          sourceDepartment: 'National Identity Registry',
          fields: [{ name: 'fullName', value: 'Aditi Rao', verified: true }],
        },
      }),
    };
  };

  const client = createNationalIdentityRegistryClient({
    baseUrl: 'http://nir.test:5000',
    gatewayKey: 'test-key',
    fetchImpl: fakeFetch,
  });

  // Test Voter ID routing
  const voterRes = await client.fetchFields('VOTER-DL-000102');
  assert.equal(voterRes.outcome, 'success');
  assert.equal(voterRes.endpoint, 'GET /api/voter-id/VOTER-DL-000102/fields');
  assert.equal(calls[0].url, 'http://nir.test:5000/api/voter-id/VOTER-DL-000102/fields');

  // Test Birth Certificate routing
  const birthRes = await client.fetchFields('BIRTH-DEL-000102');
  assert.equal(birthRes.outcome, 'success');
  assert.equal(birthRes.endpoint, 'GET /api/birth-certificate/BIRTH-DEL-000102/fields');
  assert.equal(calls[1].url, 'http://nir.test:5000/api/birth-certificate/BIRTH-DEL-000102/fields');
});

test('DLJA Client: routes RC- and PASS- references to dedicated endpoints', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, headers: opts.headers });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        data: {
          registration_reference: url.includes('vehicle-rc') ? 'RC-7B010002' : 'PASS-7B010002',
          owner_name: url.includes('vehicle-rc') ? 'Aditi Rao' : undefined,
          holder_name: url.includes('passport') ? 'Aditi Rao' : undefined,
          verification_status: 'VERIFIED',
        },
      }),
    };
  };

  const client = createDrivingLicenceJanAadhaarClient({
    baseUrl: 'http://dlja.test:3001',
    gatewayKey: 'test-key',
    fetchImpl: fakeFetch,
  });

  // Test Vehicle RC routing
  const rcRes = await client.fetchFields('RC-7B010002');
  assert.equal(rcRes.outcome, 'success');
  assert.equal(rcRes.endpoint, 'GET /api/v1/gateway/vehicle-rc/RC-7B010002');
  assert.equal(calls[0].url, 'http://dlja.test:3001/api/v1/gateway/vehicle-rc/RC-7B010002');
  assert.equal(rcRes.data.demographics.fullName, 'Aditi Rao');

  // Test Passport routing
  const passRes = await client.fetchFields('PASS-7B010002');
  assert.equal(passRes.outcome, 'success');
  assert.equal(passRes.endpoint, 'GET /api/v1/gateway/passport/PASS-7B010002');
  assert.equal(calls[1].url, 'http://dlja.test:3001/api/v1/gateway/passport/PASS-7B010002');
  assert.equal(passRes.data.demographics.fullName, 'Aditi Rao');
});

// ---------------------------------------------------------------------------
// 2. Multi-Document Accumulation Test: Aditi Rao
// ---------------------------------------------------------------------------
test('Multi-Document Accumulation: Aditi Rao links PAN Card, Voter ID, and Vehicle RC under one Setu ID', async () => {
  const repos = {
    citizenRepository: createInMemoryCitizenRepository(),
    applicationRepository: createInMemoryApplicationRepository(),
    consentRepository: createInMemoryConsentRepository(),
    linkedReferenceRepository: createInMemoryLinkedReferenceRepository(),
    auditRepository: createInMemoryAuditRepository(),
  };

  const mockClients = {
    digital_tax_records: {
      department: 'digital_tax_records',
      fetchFields: async (ref) => ({
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /pan-card/${ref}/fields`,
        durationMs: 42,
        data: {
          reference: ref,
          source_department: 'Digital Tax Records',
          verified: true,
          field_names: ['fullName', 'panNumber', 'status'],
          masked_fields: [
            { name: 'fullName', value: 'A***i R*o' },
            { name: 'panNumber', value: 'ABCDE1234F' },
          ],
          demographics: { fullName: 'Aditi Rao', dob: '1992-04-18' },
        },
      }),
    },
    national_identity_registry: {
      department: 'national_identity_registry',
      fetchFields: async (ref) => ({
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /api/voter-id/${ref}/fields`,
        durationMs: 38,
        data: {
          reference: ref,
          source_department: 'National Identity Registry',
          verified: true,
          field_names: ['fullName', 'epicNumber', 'constituency'],
          masked_fields: [
            { name: 'fullName', value: 'A***i R*o' },
            { name: 'epicNumber', value: 'DL010002' },
          ],
          demographics: { fullName: 'Aditi Rao', dob: '1992-04-18' },
        },
      }),
    },
    driving_licence_jan_aadhaar: {
      department: 'driving_licence_jan_aadhaar',
      fetchFields: async (ref) => ({
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /api/v1/gateway/vehicle-rc/${ref}`,
        durationMs: 45,
        data: {
          reference: ref,
          source_department: 'Driving Licence & Jan Aadhaar Portal',
          verified: true,
          field_names: ['owner_name', 'vehicle_number', 'vehicle_class'],
          masked_fields: [
            { name: 'owner_name', value: 'A***i R*o' },
            { name: 'vehicle_number', value: 'DL01AB0102' },
          ],
          demographics: { fullName: 'Aditi Rao', dob: '1992-04-18' },
        },
      }),
    },
  };

  const app = createApp({ ...repos, departmentClients: mockClients });

  // 1. Citizen registers
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ full_name: 'Aditi Rao', email: 'aditi.rao@example.com', password: 'Password123!' });
  assert.equal(regRes.status, 201);
  const token = regRes.body.data.token;

  // 2. Verify DTR PAN Card
  const app1 = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'pan_card_verification' });
  assert.equal(app1.status, 201);

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: app1.body.data.id,
      department: 'digital_tax_records',
      fields_requested: ['fullName', 'panNumber'],
    });

  const verify1 = await request(app)
    .post(`/api/v1/applications/${app1.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'PANCARD-000102' });
  assert.equal(verify1.status, 200);
  assert.equal(verify1.body.data.status, 'complete');

  // 3. Verify NIR Voter ID
  const app2 = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'voter_id_verification' });
  assert.equal(app2.status, 201);

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: app2.body.data.id,
      department: 'national_identity_registry',
      fields_requested: ['fullName', 'epicNumber'],
    });

  const verify2 = await request(app)
    .post(`/api/v1/applications/${app2.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'VOTER-DL-000102' });
  assert.equal(verify2.status, 200);
  assert.equal(verify2.body.data.status, 'complete');
  assert.equal(verify2.body.data.match_confidence, 100);

  // 4. Verify DLJA Vehicle RC
  const app3 = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'vehicle_rc_verification' });
  assert.equal(app3.status, 201);

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: app3.body.data.id,
      department: 'driving_licence_jan_aadhaar',
      fields_requested: ['owner_name', 'vehicle_number'],
    });

  const verify3 = await request(app)
    .post(`/api/v1/applications/${app3.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'RC-7B010002' });
  assert.equal(verify3.status, 200);
  assert.equal(verify3.body.data.status, 'complete');
  assert.equal(verify3.body.data.match_confidence, 100);

  // 5. Inspect Accumulated Documents via GET /api/v1/documents
  const docsRes = await request(app)
    .get('/api/v1/documents')
    .set('Authorization', `Bearer ${token}`);
  assert.equal(docsRes.status, 200);
  const docs = docsRes.body.data;
  assert.equal(docs.length, 3, 'Aditi should have all 3 distinct department documents accumulated');

  const dtrDoc = docs.find((d) => d.department === 'digital_tax_records');
  assert.ok(dtrDoc);
  assert.equal(dtrDoc.department_reference, 'PANCARD-000102');
  assert.equal(dtrDoc.verified, true);

  const nirDoc = docs.find((d) => d.department === 'national_identity_registry');
  assert.ok(nirDoc);
  assert.equal(nirDoc.department_reference, 'VOTER-DL-000102');
  assert.equal(nirDoc.verified, true);

  const dljaDoc = docs.find((d) => d.department === 'driving_licence_jan_aadhaar');
  assert.ok(dljaDoc);
  assert.equal(dljaDoc.department_reference, 'RC-7B010002');
  assert.equal(dljaDoc.verified, true);
});

// ---------------------------------------------------------------------------
// 3. Amitabh Saxena: Cross-Registry Discrepancy Trigger (DOB 1-day difference)
// ---------------------------------------------------------------------------
test('Discrepancy Scenario: Amitabh Saxena triggers cross-registry discrepancy on 1-day DOB difference', async () => {
  const repos = {
    citizenRepository: createInMemoryCitizenRepository(),
    applicationRepository: createInMemoryApplicationRepository(),
    consentRepository: createInMemoryConsentRepository(),
    linkedReferenceRepository: createInMemoryLinkedReferenceRepository(),
    auditRepository: createInMemoryAuditRepository(),
  };

  const mockClients = {
    national_identity_registry: {
      department: 'national_identity_registry',
      fetchFields: async (ref) => ({
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /api/registration/${ref}/fields`,
        durationMs: 35,
        data: {
          reference: ref,
          source_department: 'National Identity Registry',
          verified: true,
          field_names: ['fullName', 'dob'],
          masked_fields: [
            { name: 'fullName', value: 'A*****h S****a' },
            { name: 'dob', value: '****-**-15' },
          ],
          demographics: { fullName: 'Amitabh Saxena', dob: '1984-06-15' },
        },
      }),
    },
    driving_licence_jan_aadhaar: {
      department: 'driving_licence_jan_aadhaar',
      fetchFields: async (ref) => ({
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /api/v1/gateway/vehicle-rc/${ref}`,
        durationMs: 40,
        data: {
          reference: ref,
          source_department: 'Driving Licence & Jan Aadhaar Portal',
          verified: true,
          field_names: ['owner_name', 'dob'],
          masked_fields: [
            { name: 'owner_name', value: 'A*****h S****a' },
            { name: 'dob', value: '****-**-16' },
          ],
          // Deliberate 1-day discrepancy: 1984-06-16 vs 1984-06-15
          demographics: { fullName: 'Amitabh Saxena', dob: '1984-06-16' },
        },
      }),
    },
  };

  const app = createApp({ ...repos, departmentClients: mockClients });

  // 1. Register Amitabh Saxena
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ full_name: 'Amitabh Saxena', email: 'amitabh@example.com', password: 'Password123!' });
  const token = regRes.body.data.token;

  // 2. Verify NIR Identity (baseline)
  const app1 = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'identity_verification' });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: app1.body.data.id,
      department: 'national_identity_registry',
      fields_requested: ['fullName', 'dob'],
    });
  const verify1 = await request(app)
    .post(`/api/v1/applications/${app1.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'NIR-7B010017' });
  assert.equal(verify1.status, 200);
  assert.equal(verify1.body.data.discrepancy, null);

  // 3. Verify DLJA Vehicle RC (contains 1984-06-16 vs NIR 1984-06-15)
  const app2 = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'vehicle_rc_verification' });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: app2.body.data.id,
      department: 'driving_licence_jan_aadhaar',
      fields_requested: ['owner_name', 'dob'],
    });
  const verify2 = await request(app)
    .post(`/api/v1/applications/${app2.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'RC-7B010017' });

  assert.equal(verify2.status, 200);
  assert.equal(verify2.body.data.status, 'complete');
  assert.ok(verify2.body.data.match_confidence !== null);
  // Match confidence reflects the 1-day DOB difference (exact name 100 * 0.7 + same-year DOB 60 * 0.3 = 88%)
  assert.equal(verify2.body.data.match_confidence, 88);

  // 4. Query /documents and confirm match_confidence is saved on the document
  const docsRes = await request(app)
    .get('/api/v1/documents')
    .set('Authorization', `Bearer ${token}`);
  const dljaDoc = docsRes.body.data.find((d) => d.department === 'driving_licence_jan_aadhaar');
  assert.ok(dljaDoc);
  assert.equal(dljaDoc.match_confidence, 88);
});

// ---------------------------------------------------------------------------
// 4. Discrepancy Alert Trigger (< 70% threshold): Citizen 16 Rajesh Kumar Mukherjee
// ---------------------------------------------------------------------------
test('Discrepancy Alert Trigger: Citizen 16 triggers advisory flag on abbreviated name (R. K. Mukherjee vs Rajesh Kumar Mukherjee)', async () => {
  const repos = {
    citizenRepository: createInMemoryCitizenRepository(),
    applicationRepository: createInMemoryApplicationRepository(),
    consentRepository: createInMemoryConsentRepository(),
    linkedReferenceRepository: createInMemoryLinkedReferenceRepository(),
    auditRepository: createInMemoryAuditRepository(),
  };

  const mockClients = {
    digital_tax_records: {
      department: 'digital_tax_records',
      fetchFields: async (ref) => ({
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /pan-card/${ref}/fields`,
        durationMs: 30,
        data: {
          reference: ref,
          source_department: 'Digital Tax Records',
          verified: true,
          field_names: ['fullName', 'panNumber'],
          masked_fields: [{ name: 'fullName', value: 'R. K. Mukherjee' }],
          demographics: { fullName: 'R. K. Mukherjee' },
        },
      }),
    },
    national_identity_registry: {
      department: 'national_identity_registry',
      fetchFields: async (ref) => ({
        outcome: 'success',
        statusCode: 200,
        endpoint: `GET /api/voter-id/${ref}/fields`,
        durationMs: 35,
        data: {
          reference: ref,
          source_department: 'National Identity Registry',
          verified: true,
          field_names: ['fullName', 'epicNumber'],
          masked_fields: [{ name: 'fullName', value: 'Rajesh Kumar Mukherjee' }],
          demographics: { fullName: 'Rajesh Kumar Mukherjee' },
        },
      }),
    },
  };

  const app = createApp({ ...repos, departmentClients: mockClients });

  // 1. Register citizen
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ full_name: 'Rajesh Kumar Mukherjee', email: 'rajesh.mukherjee@example.com', password: 'Password123!' });
  const token = regRes.body.data.token;

  // 2. Verify DTR PAN Card first (baseline: R. K. Mukherjee)
  const app1 = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'pan_card_verification' });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: app1.body.data.id,
      department: 'digital_tax_records',
      fields_requested: ['fullName'],
    });
  const verify1 = await request(app)
    .post(`/api/v1/applications/${app1.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'PANCARD-200016' });
  assert.equal(verify1.status, 200);

  // 3. Verify NIR Voter ID second (Rajesh Kumar Mukherjee -> tokenSortRatio < 0.7)
  const app2 = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'voter_id_verification' });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({
      application_id: app2.body.data.id,
      department: 'national_identity_registry',
      fields_requested: ['fullName'],
    });
  const verify2 = await request(app)
    .post(`/api/v1/applications/${app2.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'VOTER-DL-2016' });

  assert.equal(verify2.status, 200);
  assert.equal(verify2.body.data.status, 'complete');
  assert.ok(verify2.body.data.match_confidence < 70, `Expected < 70, got ${verify2.body.data.match_confidence}`);
  assert.ok(verify2.body.data.discrepancy !== null);
  assert.equal(verify2.body.data.discrepancy.field, 'fullName');
  assert.equal(verify2.body.data.discrepancy.current_value, 'Rajesh Kumar Mukherjee');
  assert.equal(verify2.body.data.discrepancy.previous_value, 'R. K. Mukherjee');

  // 4. Verify DATA_QUALITY_DISCREPANCY audit event logged
  const auditEntries = repos.auditRepository._all();
  const discAudit = auditEntries.find((e) => e.action === 'DATA_QUALITY_DISCREPANCY');
  assert.ok(discAudit, 'Expected DATA_QUALITY_DISCREPANCY audit event in audit log');
  const detail = typeof discAudit.detail === 'string' ? JSON.parse(discAudit.detail) : discAudit.detail;
  assert.equal(detail.conflicting_fields.field, 'fullName');

  // 5. Query /documents and confirm advisory details are surfaced on the NIR card
  const docsRes = await request(app)
    .get('/api/v1/documents')
    .set('Authorization', `Bearer ${token}`);
  const nirDoc = docsRes.body.data.find((d) => d.department === 'national_identity_registry');
  assert.ok(nirDoc);
  assert.ok(nirDoc.discrepancy);
  assert.equal(nirDoc.discrepancy.field, 'fullName');
});
