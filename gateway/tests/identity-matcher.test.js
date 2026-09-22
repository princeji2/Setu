'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const {
  levenshtein,
  tokenSortRatio,
  compareDob,
  compareDemographics,
} = require('../src/utils/identity-matcher');
const { createApp } = require('../src/app');
const { createInMemoryCitizenRepository } = require('../src/citizen-api/repositories/citizen-repository');
const { createInMemoryApplicationRepository } = require('../src/citizen-api/repositories/application-repository');
const { createInMemoryConsentRepository } = require('../src/citizen-api/repositories/consent-repository');
const { createInMemoryLinkedReferenceRepository } = require('../src/citizen-api/repositories/linked-reference-repository');
const { createInMemoryAuditRepository } = require('../src/citizen-api/repositories/audit-repository');

// ------------------------------------------------------------
// Unit Tests: Identity Matcher & Fuzzy String Comparison
// ------------------------------------------------------------
test('Identity Matcher: Levenshtein distance calculations', () => {
  assert.equal(levenshtein('', ''), 0);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('Rajesh', 'Rajesh'), 0);
  assert.equal(levenshtein('Rajesh', 'Rakesh'), 1);
});

test('Identity Matcher: tokenSortRatio handles transposed names and variations', () => {
  // Exact match
  assert.equal(tokenSortRatio('Rajesh Kumar', 'Rajesh Kumar'), 1.0);

  // Transposed words
  assert.equal(tokenSortRatio('Kumar Rajesh', 'Rajesh Kumar'), 1.0);

  // Case & punctuation insensitivity
  assert.equal(tokenSortRatio('rajesh kumar', 'Rajesh Kumar.'), 1.0);

  // Minor typo
  const typoRatio = tokenSortRatio('Rajesh Kumar', 'Rajesh Kumra');
  assert.ok(typoRatio > 0.8, `Expected > 0.8, got ${typoRatio}`);

  // Abbreviated name ("R. Kumar" vs "Rajesh Kumar")
  const abbrevRatio = tokenSortRatio('R. Kumar', 'Rajesh Kumar');
  assert.ok(abbrevRatio < 0.7, `Expected < 0.7 for abbreviation, got ${abbrevRatio}`);
});

test('Identity Matcher: compareDob comparisons', () => {
  // Both missing
  assert.equal(compareDob(null, null), null);

  // Exact match
  assert.equal(compareDob('1980-05-12', '1980-05-12'), 1.0);
  assert.equal(compareDob('12/05/1980', '1980-05-12'), 1.0);

  // Year matches, day/month differs
  assert.equal(compareDob('1980-01-01', '1980-12-31'), 0.6);

  // Year differs
  assert.equal(compareDob('1980-05-12', '1995-05-12'), 0.0);
});

test('Identity Matcher: compareDemographics composite confidence scoring', () => {
  // 1. Exact match (name only)
  const exact = compareDemographics(
    { fullName: 'Rajesh Kumar', department: 'national_identity_registry' },
    { fullName: 'Rajesh Kumar', department: 'digital_tax_records' }
  );
  assert.equal(exact.confidence, 100);
  assert.equal(exact.hasDiscrepancy, false);
  assert.equal(exact.discrepancy, null);

  // 2. Transposed name
  const transposed = compareDemographics(
    { fullName: 'Kumar Rajesh', department: 'driving_licence_jan_aadhaar' },
    { fullName: 'Rajesh Kumar', department: 'national_identity_registry' }
  );
  assert.equal(transposed.confidence, 100);
  assert.equal(transposed.hasDiscrepancy, false);

  // 3. Name abbreviation discrepancy (< 70%)
  const abbrev = compareDemographics(
    { fullName: 'Rajesh Kumar', department: 'national_identity_registry' },
    { fullName: 'R. Kumar', department: 'digital_tax_records' }
  );
  assert.ok(abbrev.confidence < 70, `Expected confidence < 70, got ${abbrev.confidence}`);
  assert.equal(abbrev.hasDiscrepancy, true);
  assert.ok(abbrev.discrepancy);
  assert.equal(abbrev.discrepancy.current_value, 'Rajesh Kumar');
  assert.equal(abbrev.discrepancy.previous_value, 'R. Kumar');
  assert.equal(abbrev.discrepancy.conflicting_department, 'digital_tax_records');

  // 4. Name match + DOB discrepancy
  const dobMismatch = compareDemographics(
    { fullName: 'Rajesh Kumar', dob: '1985-01-01', department: 'national_identity_registry' },
    { fullName: 'Rajesh Kumar', dob: '1950-01-01', department: 'driving_licence_jan_aadhaar' }
  );
  // 70% of 100 + 30% of 0 = 70% (borderline or flagged if < 70)
  assert.equal(dobMismatch.confidence, 70);
});

// ------------------------------------------------------------
// Integration Tests: Cross-Registry Matching in Relay Flow
// ------------------------------------------------------------
test('Cross-Registry Matching: flags discrepancy below 70% and emits DATA_QUALITY_DISCREPANCY audit event', async () => {
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
      async fetchFields(reference) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint: `GET /pan/${reference}/fields`,
          durationMs: 5,
          data: {
            reference,
            verified: true,
            field_names: ['fullName', 'filingStatus'],
            demographics: { fullName: 'R. Kumar' }, // Abbreviated name in DTR
          },
          error: null,
        };
      },
    },
    national_identity_registry: {
      department: 'national_identity_registry',
      async fetchFields(reference) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint: `GET /api/registration/${reference}/fields`,
          durationMs: 7,
          data: {
            reference,
            verified: true,
            field_names: ['fullName', 'dob'],
            demographics: { fullName: 'Rajesh Kumar', dob: '1980-05-12' }, // Full name in NIR
          },
          error: null,
        };
      },
    },
    driving_licence_jan_aadhaar: {
      department: 'driving_licence_jan_aadhaar',
      async fetchFields(reference) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint: `GET /api/v1/gateway/registrations/${reference}`,
          durationMs: 6,
          data: {
            reference,
            verified: true,
            field_names: ['licence_holder_name', 'verification_status'],
            demographics: { fullName: 'Rajesh Kumar' },
          },
          error: null,
        };
      },
    },
  };

  const app = createApp({ ...repos, departmentClients: mockClients });

  // 1. Register and login citizen
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ full_name: 'Rajesh Kumar', email: 'rajesh@example.com', password: 'Password123!' });
  const token = regRes.body.data.token;
  const citizenId = regRes.body.data.citizen.id;

  // 2. Verify DTR first (returns "R. Kumar")
  const app1Res = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'pan_verification' });
  const app1Id = app1Res.body.data.id;

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: app1Id, department: 'digital_tax_records', fields_requested: ['fullName'] });

  const verify1Res = await request(app)
    .post(`/api/v1/applications/${app1Id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'SYNPAN-000123' });

  assert.equal(verify1Res.status, 200);
  assert.equal(verify1Res.body.data.status, 'complete');
  // First verification has no prior department to compare with -> match_confidence is null
  assert.equal(verify1Res.body.data.match_confidence, null);

  // 3. Verify NIR second (returns "Rajesh Kumar")
  const app2Res = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'identity_verification' });
  const app2Id = app2Res.body.data.id;

  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: app2Id, department: 'national_identity_registry', fields_requested: ['fullName'] });

  const verify2Res = await request(app)
    .post(`/api/v1/applications/${app2Id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'TESTAADHAAR0001' });

  assert.equal(verify2Res.status, 200);
  assert.equal(verify2Res.body.data.status, 'complete');

  // Match confidence should be below 70% because "Rajesh Kumar" vs "R. Kumar" is ~58%
  const conf = verify2Res.body.data.match_confidence;
  assert.ok(conf !== null, 'Expected match_confidence on verification result');
  assert.ok(conf < 70, `Expected match_confidence < 70, got ${conf}`);
  assert.ok(verify2Res.body.data.discrepancy, 'Expected discrepancy on verification result');
  assert.equal(verify2Res.body.data.discrepancy.current_value, 'Rajesh Kumar');
  assert.equal(verify2Res.body.data.discrepancy.previous_value, 'R. Kumar');

  // 4. Verify DATA_QUALITY_DISCREPANCY was recorded in audit_log
  const auditEntries = repos.auditRepository._all();
  const discrepancyEvent = auditEntries.find((e) => e.action === 'DATA_QUALITY_DISCREPANCY');
  assert.ok(discrepancyEvent, 'Expected DATA_QUALITY_DISCREPANCY event in audit log');
  assert.equal(discrepancyEvent.citizen_id, citizenId);
  const detail = JSON.parse(discrepancyEvent.detail);
  assert.equal(detail.department, 'national_identity_registry');
  assert.equal(detail.compared_department, 'digital_tax_records');
  assert.equal(detail.match_confidence, conf);

  // 5. Verify GET /api/v1/documents returns the discrepancy on the document card
  const docsRes = await request(app)
    .get('/api/v1/documents')
    .set('Authorization', `Bearer ${token}`);

  assert.equal(docsRes.status, 200);
  const nirDoc = docsRes.body.data.find((d) => d.department === 'national_identity_registry');
  assert.ok(nirDoc, 'NIR document must exist');
  assert.equal(nirDoc.verified, true);
  assert.equal(nirDoc.match_confidence, conf);
  assert.ok(nirDoc.discrepancy, 'NIR document should carry discrepancy details for advisory badge');
  assert.equal(nirDoc.discrepancy.current_value, 'Rajesh Kumar');
  assert.equal(nirDoc.discrepancy.previous_value, 'R. Kumar');
});

test('Cross-Registry Matching: matching demographics scores 100% and emits no discrepancy', async () => {
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
      async fetchFields(reference) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint: `GET /api/registration/${reference}/fields`,
          durationMs: 5,
          data: {
            reference,
            verified: true,
            field_names: ['fullName'],
            demographics: { fullName: 'Priya Sharma' },
          },
          error: null,
        };
      },
    },
    driving_licence_jan_aadhaar: {
      department: 'driving_licence_jan_aadhaar',
      async fetchFields(reference) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint: `GET /api/v1/gateway/registrations/${reference}`,
          durationMs: 5,
          data: {
            reference,
            verified: true,
            field_names: ['licence_holder_name'],
            demographics: { fullName: 'Priya Sharma' },
          },
          error: null,
        };
      },
    },
  };

  const app = createApp({ ...repos, departmentClients: mockClients });

  // Register citizen
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ full_name: 'Priya Sharma', email: 'priya@example.com', password: 'Password123!' });
  const token = regRes.body.data.token;

  // 1. Verify NIR
  const app1Res = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'identity_verification' });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: app1Res.body.data.id, department: 'national_identity_registry', fields_requested: ['fullName'] });
  await request(app)
    .post(`/api/v1/applications/${app1Res.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'TESTAADHAAR0002' });

  // 2. Verify DLJA (same name)
  const app2Res = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'driving_licence_registration' });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: app2Res.body.data.id, department: 'driving_licence_jan_aadhaar', fields_requested: ['licence_holder_name'] });
  const verify2Res = await request(app)
    .post(`/api/v1/applications/${app2Res.body.data.id}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({ reference: 'REG-A3F7C291' });

  assert.equal(verify2Res.status, 200);
  assert.equal(verify2Res.body.data.match_confidence, 100);
  assert.equal(verify2Res.body.data.discrepancy, null);

  // Verify NO DATA_QUALITY_DISCREPANCY in audit log
  const auditEntries = repos.auditRepository._all();
  const discrepancyEvent = auditEntries.find((e) => e.action === 'DATA_QUALITY_DISCREPANCY');
  assert.equal(discrepancyEvent, undefined, 'No discrepancy event should be emitted on match');
});

test('Cross-Registry Matching: operates within composite workflow when demographic data conflicts between chained steps', async () => {
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
      async fetchFields(reference) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint: `GET /api/registration/${reference}/fields`,
          durationMs: 5,
          data: {
            reference,
            verified: true,
            field_names: ['fullName', 'dob'],
            demographics: { fullName: 'Vikram Singh', dob: '1960-01-01' },
          },
          error: null,
        };
      },
    },
    driving_licence_jan_aadhaar: {
      department: 'driving_licence_jan_aadhaar',
      async fetchFields(reference) {
        return {
          outcome: 'success',
          statusCode: 200,
          endpoint: `GET /api/v1/gateway/registrations/${reference}`,
          durationMs: 6,
          data: {
            reference,
            verified: true,
            field_names: ['licence_holder_name', 'verification_status'],
            demographics: { fullName: 'V. Singh', dob: '1975-01-01' }, // Conflicting name and DOB
          },
          error: null,
        };
      },
    },
  };

  const app = createApp({ ...repos, departmentClients: mockClients });

  // 1. Register citizen
  const regRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ full_name: 'Vikram Singh', email: 'vikram@example.com', password: 'Password123!' });
  const token = regRes.body.data.token;
  const citizenId = regRes.body.data.citizen.id;

  // 2. Create composite application
  const appRes = await request(app)
    .post('/api/v1/applications')
    .set('Authorization', `Bearer ${token}`)
    .send({ type: 'senior_citizen_transport_concession' });
  const appId = appRes.body.data.id;

  // 3. Grant consent for both chained departments
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: appId, department: 'national_identity_registry', fields_requested: ['fullName', 'dob'] });
  await request(app)
    .post('/api/v1/consent')
    .set('Authorization', `Bearer ${token}`)
    .send({ application_id: appId, department: 'driving_licence_jan_aadhaar', fields_requested: ['licence_holder_name'] });

  // 4. Verify composite workflow with references for both steps
  const verifyRes = await request(app)
    .post(`/api/v1/applications/${appId}/verify`)
    .set('Authorization', `Bearer ${token}`)
    .send({
      references: {
        nir_reference: 'TESTAADHAAR9999',
        dlja_reference: 'REG-VSINGH-01',
      },
    });

  assert.equal(verifyRes.status, 200);
  assert.equal(verifyRes.body.data.status, 'complete');
  assert.equal(verifyRes.body.data.composite, true);
  assert.equal(verifyRes.body.data.steps.length, 2);

  // Step 1 had no prior department on file
  assert.equal(verifyRes.body.data.steps[0].match_confidence, null);

  // Step 2 matched against Step 1, detecting "Vikram Singh" vs "V. Singh"
  const step2 = verifyRes.body.data.steps[1];
  assert.ok(step2.match_confidence !== null);
  assert.ok(step2.match_confidence < 70, `Expected match_confidence < 70, got ${step2.match_confidence}`);
  assert.ok(step2.discrepancy, 'Step 2 should flag discrepancy');

  // Verify DATA_QUALITY_DISCREPANCY was audited
  const auditEntries = repos.auditRepository._all();
  const discrepancyEvent = auditEntries.find((e) => e.action === 'DATA_QUALITY_DISCREPANCY');
  assert.ok(discrepancyEvent, 'DATA_QUALITY_DISCREPANCY event must be logged');
  assert.equal(discrepancyEvent.citizen_id, citizenId);
});

