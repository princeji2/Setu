'use strict';

/**
 * Admin gate for the officials/console read endpoints (Phase A), mounted
 * under /api/v1/admin. This is a DELIBERATELY SEPARATE credential from the
 * citizen JWT handled by require-auth.js:
 *
 *   - require-auth.js verifies a citizen's JWT and scopes every query to
 *     that one citizen (req.citizen.id). That is the exact OPPOSITE of what
 *     an officials view needs (a cross-citizen read).
 *   - This middleware verifies a single shared secret sent as the
 *     `X-Admin-Key` header against config.admin.key. It attaches nothing to
 *     req and never touches citizen auth.
 *
 * Keeping the two apart preserves the clean layer separation the project
 * insists on (structure.md) — the officials surface never rides on citizen
 * auth, and nothing here can widen a citizen token's scope.
 *
 * Prototype-grade per product.md (real enough to demonstrate the concept,
 * not hardened). Failure shape matches the rest of the API:
 *   401 { success:false, error:{ code:'UNAUTHENTICATED', message } }  (no key)
 *   403 { success:false, error:{ code:'FORBIDDEN', message } }        (wrong key)
 */

const crypto = require('crypto');
const config = require('../../config/env');

/**
 * Constant-time string compare that also tolerates length differences
 * (crypto.timingSafeEqual throws if the buffers differ in length). Avoids a
 * trivial timing side-channel on the shared secret. Not security-critical
 * for a prototype, but it costs nothing to do correctly.
 */
function safeEqual(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function requireAdmin(req, res, next) {
  const expected = config.admin.key;

  // If no ADMIN_KEY is configured, the console is effectively disabled —
  // fail closed rather than allowing unauthenticated cross-citizen reads.
  if (!expected) {
    return res.status(403).json({
      success: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Admin console is not configured on this gateway.',
      },
    });
  }

  const provided = req.headers['x-admin-key'];

  if (!provided) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHENTICATED', message: 'Missing X-Admin-Key header.' },
    });
  }

  if (!safeEqual(provided, expected)) {
    return res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Invalid admin key.' },
    });
  }

  return next();
}

module.exports = { requireAdmin };
