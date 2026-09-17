process.env.NODE_ENV = 'test';
process.env.GATEWAY_API_KEY = 'test_gateway_secret_key_123';
process.env.GATEWAY_ORIGINS = 'http://localhost:5173,http://localhost:3000';
process.env.DEPARTMENT_NAME = 'National Identity Registry — Demo Department';

const request = require('supertest');
const { app } = require('../backend/server');
const RegistrationService = require('../backend/services/registrationService');
const AuditService = require('../backend/services/auditService');

describe('Setu Gateway Integration & Department API Tests', () => {
  const VALID_KEY = 'test_gateway_secret_key_123';
  const INVALID_KEY = 'invalid_secret_key_999';

  describe('1. CORS Gateway Whitelist', () => {
    it('allows requests originating from GATEWAY_ORIGINS (http://localhost:5173)', async () => {
      const res = await request(app)
        .options('/api/registration/check')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    });

    it('allows requests originating from GATEWAY_ORIGINS (http://localhost:3000)', async () => {
      const res = await request(app)
        .options('/api/registration/check')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBe('http://localhost:3000');
    });

    it('allows X-Gateway-Key in CORS allowed headers', async () => {
      const res = await request(app)
        .options('/api/registration/check')
        .set('Origin', 'http://localhost:5173')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'X-Gateway-Key');

      expect(res.headers['access-control-allow-headers']).toMatch(/x-gateway-key/i);
    });

    it('rejects origins not in whitelist or CLIENT_ORIGIN', async () => {
      const res = await request(app)
        .get('/health')
        .set('Origin', 'http://malicious-site.example.com');

      expect(res.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('2. Service-to-Service Auth (gatewayAuthMiddleware)', () => {
    it('rejects GET /api/registration/:id/fields without X-Gateway-Key header with 401', async () => {
      const res = await request(app).get('/api/registration/TESTAADHAAR0001/fields');

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: expect.stringMatching(/missing x-gateway-key/i),
      });
    });

    it('rejects GET /api/registration/:id/fields with invalid X-Gateway-Key with 401', async () => {
      const res = await request(app)
        .get('/api/registration/TESTAADHAAR0001/fields')
        .set('X-Gateway-Key', INVALID_KEY);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: expect.stringMatching(/invalid x-gateway-key/i),
      });
    });
  });

  describe('3. Field-Returning Endpoint: GET /api/registration/:identityReference/fields', () => {
    let mockGetFields;
    let mockLogEvent;

    beforeEach(() => {
      mockGetFields = jest.spyOn(RegistrationService, 'getFieldsByIdentityReference');
      mockLogEvent = jest.spyOn(AuditService, 'logEvent').mockImplementation(async () => {});
    });

    afterEach(() => {
      mockGetFields.mockRestore();
      mockLogEvent.mockRestore();
    });

    it('returns synthetic demographic fields for registered ID with standardized shape', async () => {
      const mockRecord = {
        id: 1,
        identity_reference: 'TESTAADHAAR0001',
        status: 'REGISTERED',
        fields: [
          { name: 'fullName', value: 'Test Citizen One', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
          { name: 'dob', value: '1998-04-12', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
          { name: 'gender', value: 'Male', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
          { name: 'address', value: 'Synthetic Address, Test District, New Delhi - 110001', verified: true, lastUpdated: '2026-09-16T17:13:09.250Z' },
        ],
      };

      mockGetFields.mockResolvedValueOnce(mockRecord);

      const res = await request(app)
        .get('/api/registration/TESTAADHAAR0001/fields')
        .set('X-Gateway-Key', VALID_KEY)
        .set('X-Gateway-Client', 'Setu-Consent-Gateway');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          identityReference: 'TESTAADHAAR0001',
          fields: expect.arrayContaining([
            expect.objectContaining({ name: 'fullName', verified: true }),
            expect.objectContaining({ name: 'dob', verified: true }),
            expect.objectContaining({ name: 'gender', verified: true }),
            expect.objectContaining({ name: 'address', verified: true }),
          ]),
          sourceDepartment: 'National Identity Registry — Demo Department',
        },
        error: null,
      });

      // Verify audit logging
      expect(mockLogEvent).toHaveBeenCalledWith(
        'FIELDS_ACCESSED',
        expect.objectContaining({
          identity_reference: 'TESTAADHAAR0001',
          service_client: 'Setu-Consent-Gateway',
          fields_requested: expect.arrayContaining(['fullName', 'dob', 'gender', 'address']),
          department: 'National Identity Registry — Demo Department',
        }),
        expect.any(String)
      );
    });

    it('returns 404 with standardized shape when identity reference is not registered', async () => {
      mockGetFields.mockResolvedValueOnce(null);

      const res = await request(app)
        .get('/api/registration/UNREGISTERED999/fields')
        .set('X-Gateway-Key', VALID_KEY);

      expect(res.status).toBe(404);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: expect.stringMatching(/not found/i),
      });
    });

    it('returns 400 when attempting to query real 12-digit ID', async () => {
      const res = await request(app)
        .get('/api/registration/123456789012/fields')
        .set('X-Gateway-Key', VALID_KEY);

      expect(res.status).toBe(400);
      expect(res.body).toEqual({
        success: false,
        data: null,
        error: expect.stringMatching(/real 12-digit numbers are strictly forbidden/i),
      });
    });
  });

  describe('4. Standardized Response Shape on POST /api/registration/check', () => {
    let mockCheckAndRegister;
    let mockLogEvent;

    beforeEach(() => {
      mockCheckAndRegister = jest.spyOn(RegistrationService, 'checkAndRegister');
      mockLogEvent = jest.spyOn(AuditService, 'logEvent').mockImplementation(async () => {});
    });

    afterEach(() => {
      mockCheckAndRegister.mockRestore();
      mockLogEvent.mockRestore();
    });

    const validRegistrationPayload = {
      identityReference: 'SYNTHETIC-001',
      name: 'Test Citizen',
      mobileNumber: '9876543210',
      address: 'Synthetic Address, Test District, New Delhi - 110001',
      fatherName: 'Test Father',
      captchaToken: 'DEMO_CAPTCHA_TOKEN',
      captchaAnswer: 'DEMO123',
    };

    it('returns standardized shape for new registration', async () => {
      mockCheckAndRegister.mockResolvedValueOnce({
        isNew: true,
        record: {
          identity_reference: 'SYNTHETIC-001',
          status: 'REGISTERED',
          created_at: '2026-09-16T17:13:09.250Z',
        },
      });

      const res = await request(app)
        .post('/api/registration/check')
        .send(validRegistrationPayload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          identityReference: 'SYNTHETIC-001',
          registered: false,
          status: 'REGISTERED',
          createdAt: '2026-09-16T17:13:09.250Z',
          message: 'Registered Successfully',
        },
        error: null,
      });
    });

    it('returns standardized shape for existing registration', async () => {
      mockCheckAndRegister.mockResolvedValueOnce({
        isNew: false,
        record: {
          identity_reference: 'SYNTHETIC-001',
          status: 'REGISTERED',
          created_at: '2026-09-16T17:13:09.250Z',
        },
      });

      const res = await request(app)
        .post('/api/registration/check')
        .send(validRegistrationPayload);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({
        success: true,
        data: {
          identityReference: 'SYNTHETIC-001',
          registered: true,
          status: 'REGISTERED',
          registeredAt: '2026-09-16T17:13:09.250Z',
          createdAt: '2026-09-16T17:13:09.250Z',
          message: 'Already Registered',
        },
        error: null,
      });
    });

    it('returns standardized shape for validation errors', async () => {
      const res = await request(app)
        .post('/api/registration/check')
        .send({ identityReference: '123456789012' }); // Real 12-digit ID

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.data).toBeNull();
      expect(res.body.error).toMatch(/real 12-digit numbers are strictly forbidden/i);
    });
  });

  describe('5. Health Endpoint Branding', () => {
    it('returns National Identity Registry — Demo Department service identity', async () => {
      const res = await request(app).get('/health');
      expect([200, 503]).toContain(res.status);
      expect(res.body.service).toBe('National Identity Registry — Demo Department');
    });
  });
});
