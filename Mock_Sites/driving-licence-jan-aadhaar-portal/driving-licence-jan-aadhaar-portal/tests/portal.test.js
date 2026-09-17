'use strict';

/**
 * Comprehensive test suite — 32 tests covering:
 * health, registration (valid + all validation cases), duplicate detection,
 * admin auth, admin endpoints, search, stats, audit logs,
 * SQL injection attempts, XSS attempts, sensitive data masking,
 * API response structure, and Setu Gateway service-to-service auth.
 *
 * The database module is mocked so no live PostgreSQL is required.
 */

require('./setup');

const bcrypt   = require('bcryptjs');
const request  = require('supertest');

// ── Mock the database BEFORE requiring the app ────────────────
jest.mock('../backend/config/db', () => {
  const store = {
    registrations: [],
    admins: [],
    auditLogs: [],
  };

  // Pre-seed a hashed admin password synchronously using a low bcrypt cost
  const bcryptSync = require('bcryptjs');
  const hash = bcryptSync.hashSync('Admin@Test2024!', 4);
  store.admins.push({
    id: 1,
    username: 'admin',
    email: 'admin@portal.local',
    password_hash: hash,
    is_active: true,
    last_login_at: null,
  });

  const mockQuery = jest.fn(async (sql, params) => {
    const s = sql.trim().toUpperCase();

    // Health check
    if (s.startsWith('SELECT 1')) {
      return { rows: [{ '?column?': 1 }], rowCount: 1 };
    }

    // Duplicate check for registrations
    if (s.includes('WHERE LICENCE_NUMBER') || s.includes('WHERE LICENCE_NUMBER = $1')) {
      const [licenceNum, janId] = params || [];
      const dup = store.registrations.find(
        r => r.licence_number === licenceNum || r.jan_aadhaar_id === janId
      );
      return { rows: dup ? [{ registration_reference: dup.registration_reference }] : [], rowCount: dup ? 1 : 0 };
    }

    // INSERT registration
    if (s.startsWith('INSERT INTO REGISTRATIONS')) {
      const reg = {
        id: store.registrations.length + 1,
        registration_reference: params[0],
        licence_number: params[1],
        licence_holder_name: params[2],
        licence_issue_date: params[3],
        licence_valid_from: params[4],
        licence_expiry_date: params[5],
        jan_aadhaar_id: params[6],
        family_members_count: params[7],
        verification_status: params[8],
        verification_provider: params[9],
        verification_notes: params[10],
        submitted_ip: params[11],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      store.registrations.push(reg);
      return {
        rows: [{
          id: reg.id,
          registration_reference: reg.registration_reference,
          verification_status: reg.verification_status,
          created_at: reg.created_at,
        }],
        rowCount: 1,
      };
    }

    // SELECT registration by reference
    if (s.includes('FROM REGISTRATIONS WHERE REGISTRATION_REFERENCE')) {
      const ref = params[0];
      const reg = store.registrations.find(r => r.registration_reference === ref);
      return { rows: reg ? [reg] : [], rowCount: reg ? 1 : 0 };
    }

    // SELECT all registrations (admin)
    if (s.includes('FROM REGISTRATIONS ORDER BY CREATED_AT DESC LIMIT')) {
      return { rows: store.registrations, rowCount: store.registrations.length };
    }

    // COUNT registrations
    if (s.includes('COUNT(*)') && s.includes('FROM REGISTRATIONS') && !s.includes('FILTER')) {
      return { rows: [{ total: String(store.registrations.length) }], rowCount: 1 };
    }

    // Stats query (has FILTER keyword)
    if (s.includes('COUNT(*)') && s.includes('FILTER')) {
      return {
        rows: [{
          total_registrations: String(store.registrations.length),
          format_valid: String(store.registrations.filter(r => r.verification_status === 'FORMAT_VALID').length),
          pending_verification: '0',
          verified: '0',
          verification_failed: '0',
          registrations_last_24h: String(store.registrations.length),
          registrations_last_7d: String(store.registrations.length),
        }],
        rowCount: 1,
      };
    }

    // Recent registrations for stats
    if (s.includes('FROM REGISTRATIONS') && s.includes('LIMIT 5')) {
      return { rows: store.registrations.slice(0, 5), rowCount: Math.min(5, store.registrations.length) };
    }

    // Search registrations
    if (s.includes('ILIKE')) {
      const q = (params[0] || '').replace(/%/g, '').toLowerCase();
      const results = store.registrations.filter(r =>
        r.registration_reference?.toLowerCase().includes(q) ||
        r.licence_holder_name?.toLowerCase().includes(q)
      );
      return { rows: results, rowCount: results.length };
    }

    // Admin login SELECT
    if (s.includes('FROM ADMINS') && s.includes('WHERE USERNAME')) {
      const username = params[0];
      const admin = store.admins.find(a => a.username === username);
      return { rows: admin ? [admin] : [], rowCount: admin ? 1 : 0 };
    }

    // UPDATE admins last_login_at
    if (s.startsWith('UPDATE ADMINS')) {
      return { rows: [], rowCount: 1 };
    }

    // INSERT audit_logs
    if (s.startsWith('INSERT INTO AUDIT_LOGS')) {
      store.auditLogs.push({ id: store.auditLogs.length + 1, event_type: params[0], created_at: new Date().toISOString() });
      return { rows: [], rowCount: 1 };
    }

    // SELECT audit_logs
    if (s.includes('FROM AUDIT_LOGS')) {
      if (s.includes('COUNT(*)')) {
        return { rows: [{ total: String(store.auditLogs.length) }], rowCount: 1 };
      }
      return { rows: store.auditLogs, rowCount: store.auditLogs.length };
    }

    return { rows: [], rowCount: 0 };
  });

  return { query: mockQuery, getClient: jest.fn(), pool: { end: jest.fn() }, _store: store };
});

// ── Load app after mocks ──────────────────────────────────────
const app = require('../backend/server');

// ── Shared test data ──────────────────────────────────────────
const VALID_PAYLOAD = {
  licence_number:       'MH0120231234567',
  licence_holder_name:  'Rajesh Kumar',
  licence_issue_date:   '2023-01-15',
  licence_valid_from:   '2023-01-15',
  licence_expiry_date:  '2043-01-14',
  jan_aadhaar_id:       '1234567890',
  family_members_count: 4,
};

let adminToken = '';

// ============================================================
// TEST 1 — Website loads (static frontend)
// ============================================================
describe('Frontend', () => {
  test('1. GET / returns HTML page', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });
});

// ============================================================
// TEST 2 — Health endpoint
// ============================================================
describe('Health', () => {
  test('2. GET /api/v1/health returns service info', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.service).toBeDefined();
    expect(res.body.database).toBeDefined();
  });
});

// ============================================================
// TESTS 3–16 — Registration validation & success
// ============================================================
describe('Registration', () => {

  test('3. Valid registration succeeds with 201 and reference', async () => {
    const res = await request(app).post('/api/v1/registrations').send(VALID_PAYLOAD);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.registration_reference).toMatch(/^REG-[A-F0-9]{8}$/);
    expect(res.body.data.verification_status).toBe('FORMAT_VALID');
  });

  test('4. Missing licence number returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, licence_number: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'licence_number')).toBe(true);
  });

  test('5. Invalid licence number format returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, licence_number: 'INVALID123' });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'licence_number')).toBe(true);
  });

  test('6. Missing licence holder name returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, licence_holder_name: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'licence_holder_name')).toBe(true);
  });

  test('7. Invalid name (digits only) returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, licence_number: 'MH0120231234568', jan_aadhaar_id: '1234567891', licence_holder_name: '12345' });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'licence_holder_name')).toBe(true);
  });

  test('8. Missing issue date returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, licence_issue_date: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'licence_issue_date')).toBe(true);
  });

  test('9. validity_from before issue_date returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations').send({
      ...VALID_PAYLOAD,
      licence_number: 'MH0120231234569',
      jan_aadhaar_id: '1234567892',
      licence_issue_date:  '2023-06-01',
      licence_valid_from:  '2023-01-01',   // before issue date
      licence_expiry_date: '2043-01-01',
    });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'licence_valid_from')).toBe(true);
  });

  test('10. expiry_date before valid_from returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations').send({
      ...VALID_PAYLOAD,
      licence_number: 'MH0120231234560',
      jan_aadhaar_id: '1234567893',
      licence_issue_date:  '2023-01-01',
      licence_valid_from:  '2023-06-01',
      licence_expiry_date: '2022-01-01',   // before valid_from
    });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'licence_expiry_date')).toBe(true);
  });

  test('11. Missing Jan Aadhaar ID returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, jan_aadhaar_id: '' });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'jan_aadhaar_id')).toBe(true);
  });

  test('12. Jan Aadhaar ID wrong length returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, jan_aadhaar_id: '12345' }); // only 5 digits
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'jan_aadhaar_id')).toBe(true);
  });

  test('13. Family members = 0 returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, family_members_count: 0 });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'family_members_count')).toBe(true);
  });

  test('14. Negative family members returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, family_members_count: -1 });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'family_members_count')).toBe(true);
  });

  test('15. Decimal family members returns 400', async () => {
    const res = await request(app).post('/api/v1/registrations')
      .send({ ...VALID_PAYLOAD, family_members_count: 2.5 });
    expect(res.status).toBe(400);
    expect(res.body.fields.some(f => f.field === 'family_members_count')).toBe(true);
  });

  test('16. Duplicate registration returns 409', async () => {
    // First submission already done in test 3 — same payload = duplicate
    const res = await request(app).post('/api/v1/registrations').send(VALID_PAYLOAD);
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already registered/i);
  });
});

// ============================================================
// TESTS 17–18 — Admin authentication
// ============================================================
describe('Admin Login', () => {
  test('17. Valid admin login returns JWT token', async () => {
    const res = await request(app).post('/api/v1/admin/login')
      .send({ username: 'admin', password: 'Admin@Test2024!' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(typeof res.body.token).toBe('string');
    adminToken = res.body.token; // save for subsequent tests
  });

  test('18. Wrong password returns 401', async () => {
    const res = await request(app).post('/api/v1/admin/login')
      .send({ username: 'admin', password: 'wrongpassword' });
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    // Error message must not reveal which field was wrong
    expect(res.body.error).not.toMatch(/username/i);
  });
});

// ============================================================
// TESTS 19–22 — Admin protected endpoints
// ============================================================
describe('Admin Protected Endpoints', () => {
  test('19. Accessing admin registrations without token returns 401', async () => {
    const res = await request(app).get('/api/v1/admin/registrations');
    expect(res.status).toBe(401);
  });

  test('20. Search registrations with token succeeds', async () => {
    const res = await request(app)
      .get('/api/v1/admin/registrations/search?q=Rajesh')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.registrations)).toBe(true);
  });

  test('21. Dashboard stats returns numeric counts', async () => {
    const res = await request(app)
      .get('/api/v1/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.total_registrations).toBe('number');
    expect(typeof res.body.data.format_valid).toBe('number');
    expect(typeof res.body.data.pending_verification).toBe('number');
  });

  test('22. Audit logs endpoint returns array', async () => {
    const res = await request(app)
      .get('/api/v1/admin/audit-logs')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.audit_logs)).toBe(true);
  });
});

// ============================================================
// TESTS 23–24 — Injection & XSS attempts
// ============================================================
describe('Security', () => {
  test('23. SQL injection in licence number is rejected by validation', async () => {
    const res = await request(app).post('/api/v1/registrations').send({
      ...VALID_PAYLOAD,
      licence_number: "' OR 1=1; DROP TABLE registrations; --",
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  test('24. XSS payload in holder name is rejected by validation', async () => {
    const res = await request(app).post('/api/v1/registrations').send({
      ...VALID_PAYLOAD,
      licence_holder_name: '<script>alert("xss")</script>',
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ============================================================
// TEST 25 — Sensitive data masking
// ============================================================
describe('Sensitive Data Masking', () => {
  test('25. GET /api/v1/registrations/:ref returns masked identifiers', async () => {
    // Get the reference from test 3's submission
    const db    = require('../backend/config/db');
    const store = db._store;
    const reg   = store.registrations[0];
    expect(reg).toBeDefined();

    const res = await request(app).get(`/api/v1/registrations/${reg.registration_reference}`);
    expect(res.status).toBe(200);

    const data = res.body.data;
    // Raw licence number should NOT appear
    expect(data.licence_number).not.toBe(reg.licence_number);
    expect(data.licence_number).toMatch(/X/);   // contains mask chars
    // Raw Jan Aadhaar should NOT appear
    expect(data.jan_aadhaar_id).not.toBe(reg.jan_aadhaar_id);
    expect(data.jan_aadhaar_id).toMatch(/X/);
  });
});

// ============================================================
// TEST 26 — Sensitive data not in 201 response
// ============================================================
describe('Response Privacy', () => {
  test('26. Registration success response does not include raw licence or aadhaar', async () => {
    const payload = {
      ...VALID_PAYLOAD,
      licence_number: 'MH0120231234511',
      jan_aadhaar_id: '9876543210',
    };
    const res = await request(app).post('/api/v1/registrations').send(payload);
    expect(res.status).toBe(201);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('MH0120231234511');
    expect(body).not.toContain('9876543210');
  });
});

// ============================================================
// TEST 27 — API response structure consistency
// ============================================================
describe('API Response Structure', () => {
  test('27. All API responses include success boolean and appropriate data/error fields', async () => {
    const healthRes = await request(app).get('/api/v1/health');
    expect(healthRes.body).toHaveProperty('success');
    expect(typeof healthRes.body.success).toBe('boolean');

    const badRes = await request(app).post('/api/v1/registrations').send({});
    expect(badRes.body).toHaveProperty('success', false);
    expect(badRes.body).toHaveProperty('error');

    const notFound = await request(app).get('/api/v1/registrations/REG-NOTEXIST');
    expect(notFound.body).toHaveProperty('success', false);
    expect(notFound.status).toBe(404);
  });
});

// ============================================================
// TEST 28 — Admin registrations list
// ============================================================
describe('Admin Registrations List', () => {
  test('28. GET /api/v1/admin/registrations returns paginated list with masked data', async () => {
    const res = await request(app)
      .get('/api/v1/admin/registrations?page=1&limit=10')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.registrations)).toBe(true);
    expect(res.body.data.pagination).toBeDefined();
    expect(typeof res.body.data.pagination.total).toBe('number');

    // Every record should have masked identifiers
    res.body.data.registrations.forEach(reg => {
      if (reg.licence_number) {
        expect(reg.licence_number).toMatch(/X/);
      }
    });
  });
});

// ============================================================
// TESTS 29–32 — Gateway Service Authentication (Setu Gateway)
// ============================================================
describe('Gateway Service Authentication', () => {
  const VALID_KEY   = 'test_gateway_secret_key_123';
  const INVALID_KEY = 'invalid_gateway_key_999';

  test('29. GET /api/v1/gateway/registrations/:reference without X-Gateway-Key returns 401', async () => {
    const db    = require('../backend/config/db');
    const store = db._store;
    const reg   = store.registrations[0];
    expect(reg).toBeDefined();

    const res = await request(app).get(`/api/v1/gateway/registrations/${reg.registration_reference}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: 'Access denied: Missing X-Gateway-Key header for gateway service authentication.',
    });
  });

  test('30. GET /api/v1/gateway/registrations/:reference with invalid X-Gateway-Key returns 401', async () => {
    const db    = require('../backend/config/db');
    const store = db._store;
    const reg   = store.registrations[0];
    expect(reg).toBeDefined();

    const res = await request(app)
      .get(`/api/v1/gateway/registrations/${reg.registration_reference}`)
      .set('X-Gateway-Key', INVALID_KEY);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: 'Access denied: Invalid X-Gateway-Key provided.',
    });
  });

  test('31. GET /api/v1/gateway/registrations/:reference with valid X-Gateway-Key returns 200 with masked data', async () => {
    const db    = require('../backend/config/db');
    const store = db._store;
    const reg   = store.registrations[0];
    expect(reg).toBeDefined();

    const res = await request(app)
      .get(`/api/v1/gateway/registrations/${reg.registration_reference}`)
      .set('X-Gateway-Key', VALID_KEY)
      .set('X-Gateway-Client', 'Setu-Consent-Gateway');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const data = res.body.data;
    expect(data.registration_reference).toBe(reg.registration_reference);
    // Sensitive fields must be masked
    expect(data.licence_number).not.toBe(reg.licence_number);
    expect(data.licence_number).toMatch(/X/);
    expect(data.jan_aadhaar_id).not.toBe(reg.jan_aadhaar_id);
    expect(data.jan_aadhaar_id).toMatch(/X/);
    expect(data.licence_holder_name).toBe(reg.licence_holder_name);
  });

  test('32. GET /api/v1/gateway/registrations/:reference with valid X-Gateway-Key but unknown reference returns 404', async () => {
    const res = await request(app)
      .get('/api/v1/gateway/registrations/REG-NONEXIST')
      .set('X-Gateway-Key', VALID_KEY);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      success: false,
      data: null,
      error: 'Registration not found.',
    });
  });
});
