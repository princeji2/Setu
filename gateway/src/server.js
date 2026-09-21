'use strict';

/**
 * Setu gateway server entrypoint.
 * Binds the app (with the real PostgreSQL-backed repository) to a port.
 * Kept separate from app.js so tests can import the app without listening.
 */

const config = require('./config/env');
const { createApp } = require('./app');
const { migrate } = require('./db/migrate');

const app = createApp();

if (require.main === module) {
  app.listen(config.port, async () => {
    console.log(`[server] Setu gateway running on http://localhost:${config.port}`);
    console.log(`[server] Environment : ${config.env}`);
    console.log(`[server] API base    : http://localhost:${config.port}/api/v1`);

    // Ensure database tables exist on boot (idempotent CREATE TABLE IF NOT EXISTS)
    try {
      await migrate();
    } catch (err) {
      console.warn('[server] Notice: Auto-migration did not run on boot:', err.message);
    }
  });
}

module.exports = app;
