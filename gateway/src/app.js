'use strict';

/**
 * Express app factory for the Setu gateway.
 * Returns a configured app WITHOUT calling listen() — so supertest can
 * drive it in-process and server.js can bind a port separately.
 *
 * Dependencies (the citizen repository) are injected so tests can pass an
 * in-memory store and never touch a real database. In production the
 * default PostgreSQL-backed repository is used.
 */

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const config = require('./config/env');
const { pgCitizenRepository } = require('./citizen-api/repositories/citizen-repository');
const { createAuthService } = require('./citizen-api/services/auth-service');
const { createAuthRouter } = require('./citizen-api/routes/auth');

function createApp({ citizenRepository = pgCitizenRepository } = {}) {
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
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    credentials: true,
  }));

  app.use(express.json({ limit: '10kb' }));
  app.use(express.urlencoded({ extended: false, limit: '10kb' }));

  // Health check
  app.get('/api/v1/health', (req, res) => {
    res.json({ success: true, data: { service: 'setu-gateway', status: 'ok' }, error: null });
  });

  // Layer 1 — citizen-facing API
  const authService = createAuthService(citizenRepository);
  app.use('/api/v1/auth', createAuthRouter(authService));

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
