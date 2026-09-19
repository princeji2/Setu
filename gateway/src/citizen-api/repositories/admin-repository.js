'use strict';

/**
 * Data access for the officials/admin read console (Phase A). This is the
 * ONE place cross-citizen reads live — every other repository is scoped to a
 * single citizen_id on purpose. Keeping the cross-citizen queries isolated
 * here means the citizen-scoped methods can never accidentally leak across
 * accounts.
 *
 * READ-ONLY. Nothing here writes. All queries are plain SELECT/COUNT/GROUP BY
 * over tables the citizen flow already populates (applications,
 * application_department_calls, consent_grants, audit_log, citizens) — Phase A
 * records no new data, it only reads what's already there.
 *
 * Two implementations behind one interface (same pattern as the other
 * repositories): pg for production/dev, in-memory for tests.
 */

const { query } = require('../../db/pool');

const DEPARTMENTS = [
  'digital_tax_records',
  'national_identity_registry',
  'driving_licence_jan_aadhaar',
];

const APPLICATION_STATUSES = [
  'submitted',
  'gateway_relay',
  'department_verifying',
  'complete',
  'failed',
];

// ------------------------------------------------------------
// PostgreSQL-backed
// ------------------------------------------------------------
const pgAdminRepository = {
  /**
   * Aggregate numbers for the stats strip. One object, computed server-side
   * so the frontend does no math. Success rate is over COMPLETED work only
   * (complete + failed) — in-flight applications don't count for or against
   * it, which is the honest denominator.
   */
  async stats() {
    const [
      totalCitizens,
      totalApplications,
      statusCounts,
      deptCalls,
      consentGrants,
      reuseCount,
      last24h,
    ] = await Promise.all([
      query('SELECT COUNT(*)::int AS n FROM citizens'),
      query('SELECT COUNT(*)::int AS n FROM applications'),
      query(
        `SELECT status, COUNT(*)::int AS n
         FROM applications
         GROUP BY status`
      ),
      query(
        `SELECT department,
                COUNT(*)::int AS calls,
                COUNT(*) FILTER (WHERE succeeded)::int AS succeeded,
                COALESCE(ROUND(AVG(duration_ms))::int, 0) AS avg_duration_ms
         FROM application_department_calls
         GROUP BY department`
      ),
      query('SELECT COUNT(*)::int AS n FROM consent_grants'),
      query(
        `SELECT COUNT(*)::int AS n
         FROM audit_log
         WHERE action = 'department_call'
           AND detail::jsonb ->> 'reused_reference' = 'true'`
      ),
      // Rolling 24h window over the SAME application_department_calls table
      // the all-time department breakdown uses — a second aggregation, not a
      // different source. Turns the snapshot into a "recent activity" pulse
      // without changing any of the all-time numbers above.
      query(
        `SELECT COUNT(*)::int AS calls,
                COUNT(*) FILTER (WHERE NOT succeeded)::int AS failed
         FROM application_department_calls
         WHERE called_at > now() - interval '24 hours'`
      ),
    ]);

    return shapeStats({
      totalCitizens: totalCitizens.rows[0].n,
      totalApplications: totalApplications.rows[0].n,
      statusRows: statusCounts.rows,
      deptRows: deptCalls.rows,
      consentGrants: consentGrants.rows[0].n,
      reuseCount: reuseCount.rows[0].n,
      last24hCalls: last24h.rows[0].calls,
      last24hFailures: last24h.rows[0].failed,
    });
  },

  /**
   * All applications across all citizens, joined to the owning citizen's
   * display name + email, newest first. Optional status/department filters.
   * `department` filters to applications that made at least one call to that
   * department (applications themselves have no department column — the
   * department lives on the calls).
   */
  async listApplications({ status = null, department = null } = {}) {
    const clauses = [];
    const params = [];

    if (status) {
      params.push(status);
      clauses.push(`a.status = $${params.length}`);
    }
    if (department) {
      params.push(department);
      clauses.push(
        `EXISTS (SELECT 1 FROM application_department_calls c
                 WHERE c.application_id = a.id AND c.department = $${params.length})`
      );
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const res = await query(
      `SELECT a.id, a.type, a.status, a.created_at, a.updated_at,
              a.citizen_id, c.full_name AS citizen_name, c.email AS citizen_email
       FROM applications a
       JOIN citizens c ON c.id = a.citizen_id
       ${where}
       ORDER BY a.created_at DESC`,
      params
    );
    return res.rows;
  },

  /**
   * The audit trail, newest first. Optional action / citizen_id filters and
   * a bounded limit (default 100, capped in the service). detail is parsed
   * from JSON text to an object for the caller.
   */
  async listAuditLog({ action = null, citizenId = null, limit = 100 } = {}) {
    const clauses = [];
    const params = [];

    if (action) {
      params.push(action);
      clauses.push(`action = $${params.length}`);
    }
    if (citizenId) {
      params.push(citizenId);
      clauses.push(`citizen_id = $${params.length}`);
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    params.push(limit);
    const res = await query(
      `SELECT id, citizen_id, action, detail, occurred_at
       FROM audit_log
       ${where}
       ORDER BY occurred_at DESC
       LIMIT $${params.length}`,
      params
    );
    return res.rows.map(parseDetail);
  },
};

// ------------------------------------------------------------
// Shared shaping helpers (used by both implementations so the API contract
// is identical whether backed by pg or the in-memory store).
// ------------------------------------------------------------

function shapeStats({
  totalCitizens,
  totalApplications,
  statusRows,
  deptRows,
  consentGrants,
  reuseCount,
  last24hCalls = 0,
  last24hFailures = 0,
}) {
  // Applications by status — always emit every known status (0 when absent)
  // so the frontend can render a stable set of buckets.
  const byStatus = Object.fromEntries(APPLICATION_STATUSES.map((s) => [s, 0]));
  for (const row of statusRows) {
    if (row.status in byStatus) byStatus[row.status] = Number(row.n);
  }

  const completed = byStatus.complete;
  const failed = byStatus.failed;
  const resolved = completed + failed;
  // Success rate over resolved work only; null (not 0) when nothing has
  // resolved yet, so the UI can show "—" rather than a misleading 0%.
  const successRate = resolved > 0 ? Math.round((completed / resolved) * 1000) / 10 : null;

  // Per-department breakdown — always emit every department (0s when absent).
  const byDeptMap = Object.fromEntries(
    DEPARTMENTS.map((d) => [d, { department: d, calls: 0, succeeded: 0, failed: 0, success_rate: null, avg_duration_ms: 0 }])
  );
  for (const row of deptRows) {
    if (!(row.department in byDeptMap)) continue;
    const calls = Number(row.calls);
    const succeeded = Number(row.succeeded);
    byDeptMap[row.department] = {
      department: row.department,
      calls,
      succeeded,
      failed: calls - succeeded,
      success_rate: calls > 0 ? Math.round((succeeded / calls) * 1000) / 10 : null,
      avg_duration_ms: Number(row.avg_duration_ms) || 0,
    };
  }

  return {
    total_citizens: Number(totalCitizens),
    total_applications: Number(totalApplications),
    applications_by_status: byStatus,
    success_rate: successRate,
    consent_grants: Number(consentGrants),
    reuse_count: Number(reuseCount),
    // Additive rolling-window pulse alongside the all-time totals above.
    // Never replaces them — turns the snapshot into "recent activity" too.
    last_24h: {
      calls: Number(last24hCalls) || 0,
      failures: Number(last24hFailures) || 0,
    },
    departments: DEPARTMENTS.map((d) => byDeptMap[d]),
  };
}

function parseDetail(row) {
  let detail = null;
  if (row.detail != null) {
    try {
      detail = typeof row.detail === 'string' ? JSON.parse(row.detail) : row.detail;
    } catch {
      detail = row.detail; // leave as-is if it isn't valid JSON
    }
  }
  return {
    id: row.id,
    citizen_id: row.citizen_id,
    action: row.action,
    detail,
    occurred_at: row.occurred_at,
  };
}

// ------------------------------------------------------------
// In-memory (tests). Accepts references to the in-memory stores used by the
// other repositories so it reads the same rows the citizen flow wrote.
// Kept intentionally simple — mirrors the pg shaping via the shared helpers.
// ------------------------------------------------------------
function createInMemoryAdminRepository({ citizens = [], applications = [], calls = [], consents = [], audit = [] } = {}) {
  const get = {
    citizens: typeof citizens === 'function' ? citizens : () => citizens,
    applications: typeof applications === 'function' ? applications : () => applications,
    calls: typeof calls === 'function' ? calls : () => calls,
    consents: typeof consents === 'function' ? consents : () => consents,
    audit: typeof audit === 'function' ? audit : () => audit,
  };

  return {
    async stats() {
      const apps = get.applications();
      const callRows = get.calls();
      const auditRows = get.audit();

      const statusRows = APPLICATION_STATUSES.map((s) => ({
        status: s,
        n: apps.filter((a) => a.status === s).length,
      }));

      const deptRows = DEPARTMENTS.map((d) => {
        const dc = callRows.filter((c) => c.department === d);
        const succeeded = dc.filter((c) => c.succeeded).length;
        const durations = dc.map((c) => c.duration_ms).filter((n) => typeof n === 'number');
        const avg = durations.length
          ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
          : 0;
        return { department: d, calls: dc.length, succeeded, avg_duration_ms: avg };
      });

      const reuseCount = auditRows.filter((r) => {
        if (r.action !== 'department_call') return false;
        try {
          const detail = typeof r.detail === 'string' ? JSON.parse(r.detail) : r.detail;
          return detail && detail.reused_reference === true;
        } catch {
          return false;
        }
      }).length;

      // Same rolling 24h window as the pg query, computed in JS for parity.
      // Rows without a parseable called_at are treated as outside the window.
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const recent = callRows.filter((c) => {
        const t = c.called_at ? new Date(c.called_at).getTime() : NaN;
        return Number.isFinite(t) && t > cutoff;
      });
      const last24hCalls = recent.length;
      const last24hFailures = recent.filter((c) => !c.succeeded).length;

      return shapeStats({
        totalCitizens: get.citizens().length,
        totalApplications: apps.length,
        statusRows,
        deptRows,
        consentGrants: get.consents().length,
        reuseCount,
        last24hCalls,
        last24hFailures,
      });
    },

    async listApplications({ status = null, department = null } = {}) {
      const citizenById = new Map(get.citizens().map((c) => [c.id, c]));
      const callRows = get.calls();
      return get.applications()
        .filter((a) => (status ? a.status === status : true))
        .filter((a) =>
          department
            ? callRows.some((c) => c.application_id === a.id && c.department === department)
            : true
        )
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .map((a) => {
          const c = citizenById.get(a.citizen_id) || {};
          return {
            id: a.id,
            type: a.type,
            status: a.status,
            created_at: a.created_at,
            updated_at: a.updated_at,
            citizen_id: a.citizen_id,
            citizen_name: c.full_name || null,
            citizen_email: c.email || null,
          };
        });
    },

    async listAuditLog({ action = null, citizenId = null, limit = 100 } = {}) {
      return get.audit()
        .filter((r) => (action ? r.action === action : true))
        .filter((r) => (citizenId ? r.citizen_id === citizenId : true))
        .sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : -1))
        .slice(0, limit)
        .map(parseDetail);
    },
  };
}

module.exports = {
  pgAdminRepository,
  createInMemoryAdminRepository,
  DEPARTMENTS,
  APPLICATION_STATUSES,
};
