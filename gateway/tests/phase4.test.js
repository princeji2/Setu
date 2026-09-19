'use strict';

/**
 * Phase 4 — cross-cutting relay consistency.
 *
 * phase3a/3b/3c each proved ONE department's relay path in isolation. This
 * suite proves the relay treats all THREE departments IDENTICALLY, by running
 * the same assertions parameterized over every department. If a future change
 * makes one department behave differently from the others (status codes,
 * consent enforcement, call/audit logging, the 200-with-status:failed
 * convention, honest-failure invariants), exactly one row here breaks and
 * names the offender — instead of the divergence hiding in three separate
 * files that drifted apart.
 *
 * These use FAKE injected clients so outcomes are deterministic and need no
 * DB or running mock service. Live proof against the real services (all three
 * up, one stopped) is the separate walkthrough in Phase 4's step 3, backed by
 * the existing tests/*.e2e.test.js scripts.
 *
 * Coverage gap this closes (from the consistency audit): phase3a asserted the
 * failure body carries no `verified` key and that success rows record
 * status_code 200; phase3b/3c omitted both. Here every department gets both
 * invariants, so the honest-failure guarantee is enforced uniformly.
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

// ------------------------------------------------------------
// The three departments, each with its real-world quirks captured:
//   - a distinct application `type` (relay's TYPE_TO_DEPARTMENT mapping)
//   - a distinct endpoint string shape (proves per-department client wiring)
//   - a distinct reference format (SYNPAN- / TESTAADHAAR / REG-)
//   - a distinct "could not reach" message (honest, department-named)
// Everything else about the relay must be identical — that is what we assert.
// ------------------------------------------------------------
const DEPARTMENTS = [
  {
    label: 'Digital Tax Records',
    department: 'digital_tax_records',
    type: 'pan_verification',
    reference: 'SYNPAN-000123',
    endpoint: (ref) => `GET /pan/${ref}/fields`,
    endpointRe: /^GET \/pan\/SYNPAN-000123\/fields$/,
    unreachableRe: /could not reach digital tax records/i,
    fieldNames: ['fullName', 'filingStatus'],
    fieldsRequested: ['fullName', 'filingStatus'],
    successData: (ref) => ({
      reference: ref,
      source_department: 'DTR',
      verified: true,
      field_names: ['fullName', 'filingStatus'],
    }),
  },
  {
    label: 'National Identity Registry',
    department: 'national_identity_registry',
    type: 'identity_verification',
    reference: 'TESTAADHAAR0001',
    endpoint: (ref) => `GET /api/registration/${ref}/fields`,
    endpointRe: /^GET \/api\/registration\/TESTAADHAAR0001\/fields$/,
    unreachableRe: /could not reach national identity registry/i,
    fieldNames: ['fullName', 'dob', 'gender', 'address'],
    fieldsRequested: ['fullName', 'dob'],
    successData: (ref) => ({
      reference: ref,
      source_department: 'NIR',
      verified: true,
      field_names: ['fullName', 'dob', 'gender', 'address'],
    }),
  },
  {
    label: 'Driving Licence & Jan Aadhaar',
    department: 'driving_licence_jan_aadhaar',
    type: 'driving_licence_registration',
    reference: 'REG-4C3978A0',
    endpoint: (ref) => `GET /api/v1/gateway/registrations/${ref}`,
    endpointRe: /^GET \/api\/v1\/gateway\/registrations\/REG-4C3978A0$/,
    unreachableRe: /could not reach driving licence/i,
    fieldNames: ['registration_reference', 'licence_holder_name', 'verification_status'],
    fieldsRequested: ['licence_holder_name', 'verification_status'],
    // DLJA has no fields[] array natively; the client derives verified from
    // verification_status. The translated shape the relay sees is still the
    // common one, plus verification_status.
    successData: (ref) => ({
      reference: ref,
      source_department: 'Driving Licence & Jan Aadhaar Portal',
      verified: true,
      verification_status: 'FORMAT_VALID',
      field_names: ['registration_reference', 'licence_holder_name', 'verification_status'],
    }),
  },
];

// ---- Fake client builders (typed-outcome contract, department-agnostic) ----
function successClient(dept) {
  return {
    department: dept.department,
    async fetchFields(ref) {
      return {
        outcome: 'success',
        statusCode: 200,
        endpoint: dept.endpoint(ref),
        durationMs: 6,
        data: dept.successData(ref),
        error: null,
      };
    },
  };
}

function failureClient(dept, { outcome, statusCode, error }) {
  return {
    department: dept.department,
    async fetchFields(ref) {
      return {
        outcome,
        statusCode,
        endpoint: dept.endpoint(ref),
        durationMs: outcome === 'timeout' ? 5000 : 9,
        data: null,
        error,
      };
    },
  };
}

// ---- Harness / helpers (shared shape across all departments) ----
function buildHarness(dept, client) {
  const repos = {
    citizenRepository: createInMemoryCitizenRepository(),
    applicationRepository: createInMemoryApplicationRepository(),
    consentRepository: createInMemoryConsentRepository(),
    linkedReferenceRepository: createInMemoryLinkedReferenceRepository(),
    auditRepository: createInMemoryAuditRepository(),
  };
  const app = createApp({ ...repos, departmentClients: { [dept.department]: client } });
  return { app, ...repos };
}

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function setup(app, dept, { withConsent = true } = {}) {
  const reg = await request(app).post('/api/v1/auth/register').send({
    full_name: 'Asha Kulkarni',
    email: `asha+${Math.random().toString(36).slice(2)}@example.com`,
    password: 'correct-horse-battery',
  });
  const token = reg.body.data.token;

  const appRes = await request(app).post('/api/v1/applications').set(auth(token))
    .send({ type: dept.type });
  const applicationId = appRes.body.data.id;

  if (withConsent) {
    await request(app).post('/api/v1/consent').set(auth(token)).send({
      application_id: applicationId,
      department: dept.department,
      fields_requested: dept.fieldsRequested,
    });
  }
  return { token, applicationId };
}

// ------------------------------------------------------------
// Parameterized suite: the SAME four assertions per department.
// ------------------------------------------------------------
for (const dept of DEPARTMENTS) {
  test(`[${dept.department}] no consent -> 403 CONSENT_REQUIRED, zero department calls, refusal audited`, async () => {
    let called = false;
    const spy = {
      department: dept.department,
      async fetchFields(ref) { called = true; return successClient(dept).fetchFields(ref); },
    };
    const { app, applicationRepository, auditRepository } = buildHarness(dept, spy);
    const { token, applicationId } = await setup(app, dept, { withConsent: false });

    const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
      .set(auth(token)).send({ reference: dept.reference });

    assert.equal(res.status, 403);
    assert.equal(res.body.success, false);
    assert.equal(res.body.error.code, 'CONSENT_REQUIRED');
    assert.equal(called, false, 'the department must NOT be called without a consent row');
    assert.equal((await applicationRepository.findCallsByApplication(applicationId)).length, 0);
    assert.ok(auditRepository._all().some((e) => e.action === 'department_call_refused'));
  });

  test(`[${dept.department}] success -> 200 complete, one succeeded call row (status 200), audit trail, verified document`, async () => {
    const { app, applicationRepository, auditRepository } = buildHarness(dept, successClient(dept));
    const { token, applicationId } = await setup(app, dept);

    const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
      .set(auth(token)).send({ reference: dept.reference });

    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'complete');
    assert.equal(res.body.data.department, dept.department);
    assert.equal(res.body.data.verified, true);

    // Persisted status is complete.
    const byId = await request(app).get(`/api/v1/applications/${applicationId}`).set(auth(token));
    assert.equal(byId.body.data.status, 'complete');

    // Exactly one department-call row, succeeded, status 200, correct endpoint.
    // (status_code 200 was only asserted for DTR before — now enforced for all.)
    const calls = await applicationRepository.findCallsByApplication(applicationId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].succeeded, true);
    assert.equal(calls[0].status_code, 200);
    assert.equal(calls[0].department, dept.department);
    assert.match(calls[0].endpoint_called, dept.endpointRe);

    // Audit trail carries the department_call and a status change.
    const actions = auditRepository._all().map((e) => e.action);
    assert.ok(actions.includes('department_call'));
    assert.ok(actions.includes('application_status_change'));

    // Document now shows verified for this department.
    const docs = await request(app).get('/api/v1/documents').set(auth(token));
    assert.equal(docs.body.data.length, 1);
    assert.equal(docs.body.data[0].department, dept.department);
    assert.equal(docs.body.data[0].verified, true);
  });

  test(`[${dept.department}] unreachable -> 200 failed, honest named message, no verified key, failed call row (null status)`, async () => {
    const client = failureClient(dept, {
      outcome: 'unreachable', statusCode: null, error: `Could not reach ${dept.label}.`,
    });
    const { app, applicationRepository } = buildHarness(dept, client);
    const { token, applicationId } = await setup(app, dept);

    const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
      .set(auth(token)).send({ reference: dept.reference });

    // Department-side failure is a completed request -> 200, not a 4xx/5xx.
    assert.equal(res.status, 200);
    assert.equal(res.body.success, true);
    assert.equal(res.body.data.status, 'failed');
    assert.equal(res.body.data.outcome, 'unreachable');
    assert.match(res.body.data.message, dept.unreachableRe);
    // Honest-failure invariant (was DTR-only before): never a verified result.
    assert.ok(!('verified' in res.body.data), 'must not report a verified result on failure');

    const calls = await applicationRepository.findCallsByApplication(applicationId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].succeeded, false);
    assert.equal(calls[0].status_code, null);
  });

  test(`[${dept.department}] timeout -> 200 failed, timeout message, no verified key, failed call row`, async () => {
    const client = failureClient(dept, {
      outcome: 'timeout', statusCode: null, error: `${dept.label} did not respond in time.`,
    });
    const { app, applicationRepository } = buildHarness(dept, client);
    const { token, applicationId } = await setup(app, dept);

    const res = await request(app).post(`/api/v1/applications/${applicationId}/verify`)
      .set(auth(token)).send({ reference: dept.reference });

    assert.equal(res.status, 200);
    assert.equal(res.body.data.status, 'failed');
    assert.equal(res.body.data.outcome, 'timeout');
    assert.match(res.body.data.message, /did not respond in time/i);
    assert.ok(!('verified' in res.body.data), 'must not report a verified result on failure');

    const calls = await applicationRepository.findCallsByApplication(applicationId);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].succeeded, false);
  });
}

// ------------------------------------------------------------
// Masked-but-real response_summary (Phase 4 → 4b decision).
//
// The summary now carries real field VALUES, not just names — so the masking
// guarantee needs a real test. We drive each department client's actual
// translate() over the payloads captured live from the running services, then
// build the summary exactly as relay-service does, and assert:
//   - sensitive values (names, DOB, full address) are masked, and the raw
//     value never appears verbatim in the summary;
//   - coarse/categorical values (filing status, income bracket, gender,
//     verification_status) are preserved — that's the demo-legible proof;
//   - identifier fields the client does not surface (DLJA licence/jan_aadhaar,
//     already masked at source) stay out of the summary entirely.
// ------------------------------------------------------------
const { translate: translateDtr } = require('../src/department-clients/digital-tax-records-client');
const { translate: translateNir } = require('../src/department-clients/national-identity-registry-client');
const { translate: translateDlja } = require('../src/department-clients/driving-licence-jan-aadhaar-client');
const { summarizeFields } = require('../src/utils/mask');

// summarizeCall in relay-service is private; reproduce its exact contract here
// (prefers masked_fields) so the test tracks what actually gets persisted.
const summaryOf = (data) => summarizeFields(data.verified, data.masked_fields);

test('[mask] DTR: name masked, coarse tax fields preserved, no raw PII in summary', () => {
  const data = translateDtr({
    reference: 'SYNPAN-000123',
    sourceDepartment: 'Digital Tax Records — Demo Department',
    fields: [
      { name: 'fullName', value: 'User Alpha', verified: true },
      { name: 'filingStatus', value: 'FILED', verified: true },
      { name: 'incomeBracket', value: '5-10L', verified: true },
      { name: 'assessmentYear', value: '2024-25', verified: true },
    ],
  });
  const summary = summaryOf(data);

  assert.ok(!summary.includes('User Alpha'), 'raw full name must not appear');
  assert.match(summary, /fullName=U\*+ A\*+/); // masked, first letters kept
  assert.match(summary, /filingStatus=FILED/);
  assert.match(summary, /incomeBracket=5-10L/);
  assert.match(summary, /assessmentYear=2024-25/);
  assert.match(summary, /^verified=true;/);
});

test('[mask] NIR: name/dob/address masked (year & pincode kept), gender preserved', () => {
  const data = translateNir({
    identityReference: 'TESTAADHAAR0001',
    sourceDepartment: 'National Identity Registry — Demo Department',
    fields: [
      { name: 'fullName', value: 'Aarav Sharma', verified: true },
      { name: 'dob', value: '1980-12-16', verified: true },
      { name: 'gender', value: 'Female', verified: true },
      { name: 'address', value: 'Synthetic Address #195, Test Block, Demo District, New Delhi - 110001', verified: true },
    ],
  });
  const summary = summaryOf(data);

  assert.ok(!summary.includes('Aarav Sharma'), 'raw name must not appear');
  assert.ok(!summary.includes('1980-12-16'), 'raw DOB must not appear');
  assert.ok(!summary.includes('Test Block'), 'raw address body must not appear');
  assert.match(summary, /dob=1980-\*\*-\*\*/); // year kept, month/day hidden
  assert.match(summary, /address=\*+ 110001/); // pincode kept
  assert.match(summary, /gender=Female/); // non-identifying, preserved
});

test('[mask] DLJA: holder name masked, source-masked ids pass through, status preserved', () => {
  const data = translateDlja({
    registration_reference: 'REG-6C9E5AB5',
    licence_number: 'XXXXXXXXXXX6572',
    licence_holder_name: 'Demo Driver',
    licence_issue_date: '2023-01-14T18:30:00.000Z',
    licence_valid_from: '2023-01-14T18:30:00.000Z',
    licence_expiry_date: '2043-01-13T18:30:00.000Z',
    jan_aadhaar_id: 'XXXXXX6572',
    family_members_count: 3,
    verification_status: 'FORMAT_VALID',
  });
  const summary = summaryOf(data);

  assert.ok(!summary.includes('Demo Driver'), 'raw holder name must not appear');
  assert.match(summary, /licence_holder_name=D\*+ D\*+/);
  assert.match(summary, /verification_status=FORMAT_VALID/);
  assert.match(summary, /registration_reference=REG-6C9E5AB5/); // public handle, kept
  assert.match(summary, /family_members_count=3/); // coarse, preserved
  // The DLJA client's curated NON_SENSITIVE_FIELD_NAMES intentionally does NOT
  // surface licence_number / jan_aadhaar_id into the summary at all — even
  // though they arrive already masked from source. Not surfacing an identifier
  // is stricter than masking it, so assert they're absent rather than present.
  assert.ok(!/jan_aadhaar_id=/.test(summary), 'identifier fields are not surfaced into the summary');
  assert.ok(!/licence_number=/.test(summary), 'identifier fields are not surfaced into the summary');
});

// ------------------------------------------------------------
// Data-quality flags (structural checks at translate()). These assert the
// SUCCESS-branch translate() attaches data_quality_flags: [] on clean
// payloads and the expected flag string on malformed ones. They never touch
// the relay's pass/fail resolution — a flagged call is still a success.
// Reuses the same translateDtr/Nir/Dlja imports declared above.
// ------------------------------------------------------------

// --- DTR / NIR (fields[] shape via flagFieldArray) ---
test('[dq] DTR clean payload -> empty data_quality_flags', () => {
  const data = translateDtr({
    reference: 'SYNPAN-000123',
    sourceDepartment: 'Digital Tax Records — Demo Department',
    fields: [
      { name: 'fullName', value: 'User Alpha', verified: true },
      { name: 'filingStatus', value: 'FILED', verified: true },
    ],
  });
  assert.deepEqual(data.data_quality_flags, []);
});

test('[dq] DTR missing reference -> missing_reference flag', () => {
  const data = translateDtr({
    reference: '',
    sourceDepartment: 'Digital Tax Records — Demo Department',
    fields: [{ name: 'fullName', value: 'User Alpha', verified: true }],
  });
  assert.ok(data.data_quality_flags.includes('missing_reference'));
});

test('[dq] DTR empty fields -> empty_fields flag', () => {
  const data = translateDtr({
    reference: 'SYNPAN-000123',
    sourceDepartment: 'Digital Tax Records — Demo Department',
    fields: [],
  });
  assert.ok(data.data_quality_flags.includes('empty_fields'));
});

test('[dq] DTR verified field with blank value -> empty_verified_value flag', () => {
  const data = translateDtr({
    reference: 'SYNPAN-000123',
    sourceDepartment: 'Digital Tax Records — Demo Department',
    fields: [
      { name: 'fullName', value: '', verified: true },
      { name: 'filingStatus', value: 'FILED', verified: true },
    ],
  });
  assert.ok(data.data_quality_flags.some((f) => f.startsWith('empty_verified_value:')));
  assert.ok(data.data_quality_flags.some((f) => f.includes('fullName')));
});

test('[dq] NIR clean payload -> empty data_quality_flags', () => {
  const data = translateNir({
    identityReference: 'TESTAADHAAR0001',
    sourceDepartment: 'National Identity Registry — Demo Department',
    fields: [
      { name: 'fullName', value: 'Aarav Sharma', verified: true },
      { name: 'gender', value: 'Female', verified: true },
    ],
  });
  assert.deepEqual(data.data_quality_flags, []);
});

test('[dq] NIR empty fields -> empty_fields flag', () => {
  const data = translateNir({
    identityReference: 'TESTAADHAAR0001',
    sourceDepartment: 'National Identity Registry — Demo Department',
    fields: [],
  });
  assert.ok(data.data_quality_flags.includes('empty_fields'));
});

test('[dq] NIR missing reference -> missing_reference flag', () => {
  const data = translateNir({
    identityReference: '',
    sourceDepartment: 'National Identity Registry — Demo Department',
    fields: [{ name: 'fullName', value: 'Aarav Sharma', verified: true }],
  });
  assert.ok(data.data_quality_flags.includes('missing_reference'));
});

test('[dq] NIR field name/count mismatch -> field_names_mismatch flag', () => {
  // A raw field with no `name` maps to `undefined` in the client's
  // field_names (kept), but is filtered out of rawNames — so the counts
  // diverge and translate() should surface the mismatch.
  const data = translateNir({
    identityReference: 'TESTAADHAAR0001',
    sourceDepartment: 'National Identity Registry — Demo Department',
    fields: [
      { name: 'fullName', value: 'Aarav Sharma', verified: true },
      { value: 'Female', verified: true },
    ],
  });
  assert.ok(data.data_quality_flags.includes('field_names_mismatch'));
});

// --- DLJA (verification_status shape via flagRegistration) ---
test('[dq] DLJA clean payload -> empty data_quality_flags', () => {
  const data = translateDlja({
    registration_reference: 'REG-6C9E5AB5',
    licence_holder_name: 'Demo Driver',
    verification_status: 'FORMAT_VALID',
    family_members_count: 3,
  });
  assert.deepEqual(data.data_quality_flags, []);
});

test('[dq] DLJA unknown verification_status -> unknown_verification_status flag', () => {
  const data = translateDlja({
    registration_reference: 'REG-6C9E5AB5',
    licence_holder_name: 'Demo Driver',
    verification_status: 'WEIRD_STATUS',
    family_members_count: 3,
  });
  assert.ok(data.data_quality_flags.some((f) => f === 'unknown_verification_status:WEIRD_STATUS'));
});

test('[dq] DLJA missing reference -> missing_reference flag', () => {
  const data = translateDlja({
    registration_reference: '',
    licence_holder_name: 'Demo Driver',
    verification_status: 'FORMAT_VALID',
  });
  assert.ok(data.data_quality_flags.includes('missing_reference'));
});
