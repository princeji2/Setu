const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/database');
const registrationRoutes = require('./routes/registrationRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { notFoundHandler, globalErrorHandler } = require('./middleware/errorMiddleware');

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || `http://localhost:${PORT}`;
const DEPARTMENT_NAME = process.env.DEPARTMENT_NAME || 'National Identity Registry — Demo Department';

// Parse allowed gateway origins from environment
const rawGatewayOrigins = process.env.GATEWAY_ORIGINS || '';
const gatewayOrigins = rawGatewayOrigins
  .split(',')
  .map((origin) => origin.trim().replace(/\/+$/, ''))
  .filter(Boolean);

// Auto-derive 127.0.0.1 <-> localhost equivalents to prevent local demo cross-origin mismatches
const derivedOrigins = [];
gatewayOrigins.forEach((orig) => {
  if (orig.includes('localhost')) {
    derivedOrigins.push(orig.replace('localhost', '127.0.0.1'));
  } else if (orig.includes('127.0.0.1')) {
    derivedOrigins.push(orig.replace('127.0.0.1', 'localhost'));
  }
});

const allowedOrigins = new Set([
  CLIENT_ORIGIN.replace(/\/+$/, ''),
  `http://localhost:${PORT}`,
  `http://127.0.0.1:${PORT}`,
  ...gatewayOrigins,
  ...derivedOrigins,
]);

// 1. Security Headers via Helmet
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// 2. Controlled CORS Configuration supporting Gateway & Portal Origins
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, or same-origin browser fetches)
      if (!origin) {
        return callback(null, true);
      }
      const normalizedOrigin = origin.replace(/\/+$/, '');
      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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
  })
);

// 3. Request Parsing & Size Guarding
app.use(express.json({ limit: '15kb' }));
app.use(express.urlencoded({ extended: true, limit: '15kb' }));

// 4. Static Frontend Assets Serving
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath));

// 5. System Health Check Endpoint
app.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.status(dbStatus.connected ? 200 : 503).json({
    status: dbStatus.connected ? 'healthy' : 'degraded',
    service: DEPARTMENT_NAME,
    timestamp: new Date().toISOString(),
    database: {
      engine: dbStatus.engine || 'PostgreSQL 18.6',
      connected: dbStatus.connected,
      error: dbStatus.connected ? null : 'Database unreachable',
    },
  });
});

// 6. API Route Mounting
app.use('/api/registration', registrationRoutes);
app.use('/api/admin', adminRoutes);

const { getVoterIdFields, getBirthCertificateFields } = require('./controllers/registrationController');
const gatewayAuthMiddleware = require('./middleware/gatewayAuthMiddleware');
app.get('/api/voter-id/:voterReference/fields', gatewayAuthMiddleware, getVoterIdFields);
app.get('/api/birth-certificate/:birthReference/fields', gatewayAuthMiddleware, getBirthCertificateFields);


// Fallback HTML navigation routes
app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

app.get('/registration', (req, res) => {
  res.sendFile(path.join(frontendPath, 'registration.html'));
});

app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin-login.html'));
});

app.get('/admin-dashboard', (req, res) => {
  res.sendFile(path.join(frontendPath, 'admin-dashboard.html'));
});

// 7. 404 & Global Error Handling
app.use(notFoundHandler);
app.use(globalErrorHandler);

// 8. Server Initialization
let server;
if (process.env.NODE_ENV !== 'test') {
  server = app.listen(PORT, async () => {
    console.log('================================================================');
    console.log(`[DEPARTMENT] ${DEPARTMENT_NAME}`);
    console.log(`[SERVER] Running at: http://localhost:${PORT}`);
    console.log(`[FRONTEND] Serving static files from: ${frontendPath}`);
    console.log(`[API] Base endpoints ready at: http://localhost:${PORT}/api/`);
    console.log('================================================================');

    // Verify PostgreSQL connection at launch
    const dbTest = await testConnection();
    if (!dbTest.connected) {
      console.warn('[SERVER WARNING] PostgreSQL is not yet reachable. Please start the PostgreSQL service.');
    }
  });
}

module.exports = { app, server };
