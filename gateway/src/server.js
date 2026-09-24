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

    // Keep-alive heartbeat: ping department services every 7 minutes so Render
    // free-tier instances never spin down / sleep due to inactivity.
    startKeepAlive();
  });
}

function startKeepAlive() {
  const targets = [
    config.departments.digital_tax_records?.baseUrl,
    config.departments.national_identity_registry?.baseUrl ? `${config.departments.national_identity_registry.baseUrl.replace(/\/+$/, '')}/health` : null,
    config.departments.driving_licence_jan_aadhaar?.baseUrl,
    'https://setu-gateway.onrender.com/api/v1/health',
  ].filter(Boolean);

  async function ping() {
    for (const url of targets) {
      if (url.includes('localhost') || url.includes('127.0.0.1')) continue;
      try {
        await fetch(url, { signal: AbortSignal.timeout(8000) });
      } catch {
        // silent keepalive catch
      }
    }
  }

  // Ping immediately after boot, then every 7 minutes
  setTimeout(ping, 5000);
  const timer = setInterval(ping, 7 * 60 * 1000);
  if (timer.unref) timer.unref();
}

module.exports = app;
