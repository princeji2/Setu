'use strict';

const express = require('express');
const router  = express.Router();
const db      = require('../config/db');
const config  = require('../config/env');

/**
 * GET /api/v1/health
 * Public health-check endpoint.
 * Returns DB connectivity status without exposing sensitive config.
 */
router.get('/', async (req, res) => {
  let dbStatus = 'ok';
  let dbLatencyMs = null;

  try {
    const start  = Date.now();
    await db.query('SELECT 1');
    dbLatencyMs = Date.now() - start;
  } catch {
    dbStatus = 'error';
  }

  const status = dbStatus === 'ok' ? 200 : 503;

  return res.status(status).json({
    success:   dbStatus === 'ok',
    service:   'Driving Licence & Jan Aadhaar Registration Portal',
    version:   '1.0.0',
    env:       config.env,
    timestamp: new Date().toISOString(),
    database: {
      status:    dbStatus,
      latencyMs: dbLatencyMs,
    },
  });
});

module.exports = router;
