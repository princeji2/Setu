'use strict';

/**
 * Express app factory for the Setu gateway.
 * Returns a configured app WITHOUT calling listen() — so supertest can
 * drive it in-process and server.js can bind a port separately.
 *
 * All data access is injected via repositories so tests can pass
 * in-memory stores and never touch a real database. In production the
 * default PostgreSQL-backed repositories are used.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/env');

// Repositories (pg defaults)
const { pgCitizenRepository } = require('./citizen-api/repositories/citizen-repository');
const { pgApplicationRepository } = require('./citizen-api/repositories/application-repository');
const { pgConsentRepository } = require('./citizen-api/repositories/consent-repository');
const { pgLinkedReferenceRepository } = require('./citizen-api/repositories/linked-reference-repository');
const { pgAuditRepository } = require('./citizen-api/repositories/audit-repository');
const { pgAdminRepository } = require('./citizen-api/repositories/admin-repository');

// Services
const { createAuthService } = require('./citizen-api/services/auth-service');
const { createApplicationService } = require('./citizen-api/services/application-service');
const { createConsentService } = require('./citizen-api/services/consent-service');
const { createDocumentsService } = require('./citizen-api/services/documents-service');
const { createRelayService } = require('./citizen-api/services/relay-service');
const { createAdminService } = require('./citizen-api/services/admin-service');

// Department clients (Layer 2)
const { createDigitalTaxRecordsClient } = require('./department-clients/digital-tax-records-client');
const { createNationalIdentityRegistryClient } = require('./department-clients/national-identity-registry-client');
const { createDrivingLicenceJanAadhaarClient } = require('./department-clients/driving-licence-jan-aadhaar-client');

// Routers
const { createAuthRouter } = require('./citizen-api/routes/auth');
const { createApplicationsRouter } = require('./citizen-api/routes/applications');
const { createConsentRouter } = require('./citizen-api/routes/consent');
const { createDocumentsRouter } = require('./citizen-api/routes/documents');
const { createAdminRouter } = require('./citizen-api/routes/admin');

function createApp({
  citizenRepository = pgCitizenRepository,
  applicationRepository = pgApplicationRepository,
  consentRepository = pgConsentRepository,
  linkedReferenceRepository = pgLinkedReferenceRepository,
  auditRepository = pgAuditRepository,
  adminRepository = pgAdminRepository,
  // Layer 2 clients registry, keyed by department. Injectable so tests can
  // supply a fake client (e.g. to simulate a department being down).
  departmentClients = {
    digital_tax_records: createDigitalTaxRecordsClient(),
    national_identity_registry: createNationalIdentityRegistryClient(),
    driving_licence_jan_aadhaar: createDrivingLicenceJanAadhaarClient(),
  },
} = {}) {
  const app = express();

  // Security headers (API-only; no inline HTML served here).
  app.use(helmet());

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // curl / server-to-server
      if (config.cors.origins.includes(origin)) return callback(null, true);
      return callback(new Error('Not allowed by CORS'));
    },
    methods: ['GET', 'POST', 'OPTIONS'],
    // X-Admin-Key is the officials-console credential (Phase B). Browsers
    // preflight it as a non-simple header, so it must be allowed here or the
    // console's cross-origin fetch (3000 -> 4000) is blocked. Additive; does
    // not affect any citizen-facing call.
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'X-Admin-Key'],
    credentials: true,
  }));

  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // Health check
  app.get('/api/v1/health', (req, res) => {
    res.json({ success: true, data: { service: 'setu-gateway', status: 'ok' }, error: null });
  });

  // ------------------------------------------------------------
  // Layer 1 — citizen-facing API
  // ------------------------------------------------------------
  const authService = createAuthService(citizenRepository);
  const applicationService = createApplicationService({ applicationRepository, auditRepository });
  const consentService = createConsentService({ consentRepository, applicationRepository, auditRepository });
  const documentsService = createDocumentsService({ linkedReferenceRepository });
  const relayService = createRelayService({
    clients: departmentClients,
    applicationRepository,
    consentRepository,
    linkedReferenceRepository,
    auditRepository,
  });

  app.use('/api/v1/auth', createAuthRouter(authService));
  app.use('/api/v1/applications', createApplicationsRouter(applicationService, relayService));
  app.use('/api/v1/consent', createConsentRouter(consentService));
  app.use('/api/v1/documents', createDocumentsRouter(documentsService));

  // ------------------------------------------------------------
  // Officials/admin read console (Phase A) — cross-citizen, read-only,
  // gated by X-Admin-Key (requireAdmin), NOT the citizen JWT. Fully
  // additive to Layer 1; touches no citizen route or department client.
  // ------------------------------------------------------------
  const adminService = createAdminService({ adminRepository });
  app.use('/api/v1/admin', createAdminRouter(adminService));

  // 404 for unknown API paths
  app.use((req, res) => {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    });
  });

  return app;
}

module.exports = { createApp };
