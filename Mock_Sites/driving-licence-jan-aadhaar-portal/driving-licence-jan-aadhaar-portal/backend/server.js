'use strict';

require('dotenv').config();

const express = require('express');
const helmet  = require('helmet');
const cors    = require('cors');
const path    = require('path');

const config        = require('./config/env');
const { apiLimiter } = require('./middleware/rateLimiting');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Routes
const healthRoutes        = require('./routes/health');
const registrationRoutes  = require('./routes/registrations');
const adminRoutes         = require('./routes/admin');
const gatewayRoutes       = require('./routes/gateway');

const app = express();

// ============================================================
// Security middleware
// ============================================================
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc:  ["'self'"],
      scriptSrc:   ["'self'", "'unsafe-inline'"],   // inline scripts needed for vanilla JS pages
      styleSrc:    ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:     ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:      ["'self'", 'data:'],
      connectSrc:  ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (Postman, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (config.cors.origins.includes(origin)) return callback(null, true);
    return callback(new Error('Not allowed by CORS'));
  },
  methods:     ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Gateway-Key',
    'x-gateway-key',
    'X-Gateway-Client',
    'x-gateway-client',
    'Accept',
    'X-Requested-With',
  ],
  credentials: true,
}));

// ============================================================
// Body parsing
// ============================================================
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// ============================================================
// Global rate limiter
// ============================================================
app.use('/api', apiLimiter);

// ============================================================
// Serve static frontend
// ============================================================
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// ============================================================
// API routes — versioned under /api/v1
// ============================================================
app.use('/api/v1/health',        healthRoutes);
app.use('/api/v1/registrations', registrationRoutes);
app.use('/api/v1/gateway',       gatewayRoutes);
app.use('/api/v1/admin',         adminRoutes);

// Legacy/convenience unversioned aliases
app.use('/api/health',  healthRoutes);
app.use('/api/gateway', gatewayRoutes);

// ============================================================
// SPA fallback — serve index.html for unknown GET paths
// (keeps frontend navigation working without a separate web server)
// ============================================================
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

// ============================================================
// Error handling (must be last)
// ============================================================
app.use(notFoundHandler);
app.use(errorHandler);

// ============================================================
// Start server
// ============================================================
if (require.main === module) {
  app.listen(config.port, () => {
    console.log(`[server] Driving Licence & Jan Aadhaar Portal running on http://localhost:${config.port}`);
    console.log(`[server] Environment : ${config.env}`);
    console.log(`[server] Database    : ${config.db.name} @ ${config.db.host}:${config.db.port}`);
    console.log(`[server] API base    : http://localhost:${config.port}/api/v1`);
  });
}

module.exports = app;   // exported for testing with supertest
