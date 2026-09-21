'use strict';

/**
 * Officials/admin read service (Phase A). Validates and normalises query
 * filters, then delegates to adminRepository. READ-ONLY — no writes, no
 * audit entries (reading the console is not itself a notable gateway action
 * for the demo, and writing one on every poll would just add noise).
 *
 * All three endpoints are cross-citizen by design; the requireAdmin
 * middleware is what authorises that, so nothing here is citizen-scoped.
 *
 * Errors: VALIDATION -> 400 (bad filter value). Follows the same small
 * typed-error pattern as ConsentError / RelayError.
 */

const {
  DEPARTMENTS,
  APPLICATION_STATUSES,
  DEFAULT_TREND_HOURS,
  MAX_TREND_HOURS,
} = require('../repositories/admin-repository');

const DEPARTMENT_SET = new Set(DEPARTMENTS);
const STATUS_SET = new Set(APPLICATION_STATUSES);

// Bound on how many audit rows one call can return. Keeps the console
// responsive and the payload sane even as the log grows. Client can request
// fewer via ?limit=, but not more.
const DEFAULT_AUDIT_LIMIT = 100;
const MAX_AUDIT_LIMIT = 500;

class AdminError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'AdminError';
    this.code = code;
  }
}

function createAdminService({ adminRepository }) {
  return {
    async getStats() {
      return adminRepository.stats();
    },

    async getTrend({ hours } = {}) {
      let parsedHours = DEFAULT_TREND_HOURS;
      if (hours != null && hours !== '') {
        parsedHours = parseInt(hours, 10);
        if (!Number.isInteger(parsedHours) || parsedHours < 1) {
          throw new AdminError('VALIDATION', 'hours must be a positive integer.');
        }
        parsedHours = Math.min(parsedHours, MAX_TREND_HOURS);
      }
      return adminRepository.trend({ hours: parsedHours });
    },

    async listApplications({ status, department } = {}) {
      if (status != null && !STATUS_SET.has(status)) {
        throw new AdminError(
          'VALIDATION',
          `status must be one of: ${APPLICATION_STATUSES.join(', ')}.`
        );
      }
      if (department != null && !DEPARTMENT_SET.has(department)) {
        throw new AdminError(
          'VALIDATION',
          `department must be one of: ${DEPARTMENTS.join(', ')}.`
        );
      }
      return adminRepository.listApplications({
        status: status || null,
        department: department || null,
      });
    },

    async listAuditLog({ action, citizenId, limit } = {}) {
      let parsedLimit = DEFAULT_AUDIT_LIMIT;
      if (limit != null && limit !== '') {
        parsedLimit = parseInt(limit, 10);
        if (!Number.isInteger(parsedLimit) || parsedLimit < 1) {
          throw new AdminError('VALIDATION', 'limit must be a positive integer.');
        }
        parsedLimit = Math.min(parsedLimit, MAX_AUDIT_LIMIT);
      }
      return adminRepository.listAuditLog({
        action: action || null,
        citizenId: citizenId || null,
        limit: parsedLimit,
      });
    },

    async deleteTestCitizens({ emailPrefix = 'prod_user_' } = {}) {
      return adminRepository.deleteTestCitizens({ emailPrefix });
    },
  };
}

module.exports = {
  createAdminService,
  AdminError,
  DEFAULT_AUDIT_LIMIT,
  MAX_AUDIT_LIMIT,
  DEFAULT_TREND_HOURS,
  MAX_TREND_HOURS,
};
