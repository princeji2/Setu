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

// A department is flagged `degraded` when its success rate over the rolling
// 24h window drops below this percentage. Windowed (not all-time) on purpose:
// an all-time rate is slow to trip and slow to clear, so it wouldn't reflect
// "degraded right now". Non-blocking, purely visible — same spirit as the
// data-quality flags: the gateway shows it actively watches, it doesn't act.
const DEGRADED_SUCCESS_RATE_THRESHOLD = 50.0;

// Default / max span for the hourly trend endpoint. Hourly buckets over the
// current session populate live during a demo (no backdated seed needed).
const DEFAULT_TREND_HOURS = 24;
const MAX_TREND_HOURS = 168; // 7 days of hourly buckets, hard ceiling

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
      deptCalls24h,
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
      // Per-department 24h window — feeds the windowed `degraded` flag. Same
      // table, same window as last_24h above, grouped by department so each
      // department's recent success rate can be judged on its own.
      query(
        `SELECT department,
                COUNT(*)::int AS calls,
                COUNT(*) FILTER (WHERE succeeded)::int AS succeeded
         FROM application_department_calls
         WHERE called_at > now() - interval '24 hours'
         GROUP BY department`
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
      dept24hRows: deptCalls24h.rows,
    });
  },

  /**
   * Hourly time-series of department calls over the last `hours` hours,
   * computed on-the-fly from application_department_calls.called_at — no new
   * table, no scheduled sampler, no migration. Every individual call is
   * already stored with a timestamp, so a GROUP BY reconstructs any bucket
   * after the fact.
   *
   * Buckets are zero-filled and contiguous (one per hour, oldest→newest) so
   * an empty hour renders as a 0 bar rather than vanishing and misrepresenting
   * the spacing. success_rate is null (not 0) on hours with zero calls.
   */
  async trend({ hours = DEFAULT_TREND_HOURS } = {}) {
    // date_trunc('hour', ...) collapses each call onto the start of its hour.
    // We only pull hours that actually have calls; shapeTrend zero-fills the
    // rest against a clock generated in JS, so the query stays trivial.
    const res = await query(
      `SELECT date_trunc('hour', called_at) AS hour,
              COUNT(*)::int AS calls,
              COUNT(*) FILTER (WHERE NOT succeeded)::int AS failures
       FROM application_department_calls
       WHERE called_at > now() - ($1::int * interval '1 hour')
       GROUP BY 1
       ORDER BY 1`,
      [hours]
    );
    return shapeTrend({ hours, rows: res.rows });
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
      `SELECT a.id, a.type, a.status, a.composite_workflow_id, a.created_at, a.updated_at,
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

  async deleteTestCitizens({ emailPrefix = 'prod_user_' } = {}) {
    const pattern = `${emailPrefix.toLowerCase()}%`;
    const res = await query(
      `DELETE FROM citizens
       WHERE lower(email) LIKE $1
       RETURNING id, full_name, email, created_at`,
      [pattern]
    );
    return res.rows;
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
  dept24hRows = [],
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

  // Per-department 24h success rate — the basis for the windowed `degraded`
  // flag. Kept separate from the all-time numbers so it can't skew them.
  const dept24hRate = Object.fromEntries(DEPARTMENTS.map((d) => [d, null]));
  for (const row of dept24hRows) {
    if (!(row.department in dept24hRate)) continue;
    const calls = Number(row.calls);
    const succeeded = Number(row.succeeded);
    dept24hRate[row.department] =
      calls > 0 ? Math.round((succeeded / calls) * 1000) / 10 : null;
  }

  // Per-department breakdown — always emit every department (0s when absent).
  const byDeptMap = Object.fromEntries(
    DEPARTMENTS.map((d) => [d, { department: d, calls: 0, succeeded: 0, failed: 0, success_rate: null, avg_duration_ms: 0, degraded: false }])
  );
  for (const row of deptRows) {
    if (!(row.department in byDeptMap)) continue;
    const calls = Number(row.calls);
    const succeeded = Number(row.succeeded);
    // `degraded` is windowed: it reflects the last-24h rate, NOT the all-time
    // success_rate on this same object. A department with no calls in the
    // window is not degraded (null rate → false) — absence of recent activity
    // is not a failure signal.
    const recentRate = dept24hRate[row.department];
    byDeptMap[row.department] = {
      department: row.department,
      calls,
      succeeded,
      failed: calls - succeeded,
      success_rate: calls > 0 ? Math.round((succeeded / calls) * 1000) / 10 : null,
      avg_duration_ms: Number(row.avg_duration_ms) || 0,
      degraded: recentRate !== null && recentRate < DEGRADED_SUCCESS_RATE_THRESHOLD,
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

/**
 * Turn sparse hourly rows (only hours that had calls) into a contiguous,
 * zero-filled series of exactly `hours` buckets, oldest→newest, ending at the
 * current hour. Shared by pg + in-memory so the contract is identical.
 *
 * Each bucket: { hour: ISO-8601 (start of hour, UTC), calls, failures,
 * success_rate }. success_rate is null on zero-call hours (render "—"), a
 * percentage otherwise. `hour` is the truncated hour start so buckets align
 * to clock hours regardless of when the request lands.
 */
function shapeTrend({ hours = DEFAULT_TREND_HOURS, rows = [] } = {}) {
  const n = Math.max(1, Number(hours) || DEFAULT_TREND_HOURS);

  // Index the rows we got by their hour-start epoch for O(1) lookup.
  const byHour = new Map();
  for (const row of rows) {
    const t = row.hour ? new Date(row.hour).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    const hourStart = Math.floor(t / 3600000) * 3600000;
    const calls = Number(row.calls) || 0;
    const failures = Number(row.failures) || 0;
    // Fold in case two source rows land in the same hour (shouldn't with
    // date_trunc, but the in-memory path groups in JS).
    const prev = byHour.get(hourStart) || { calls: 0, failures: 0 };
    byHour.set(hourStart, { calls: prev.calls + calls, failures: prev.failures + failures });
  }

  // Generate the contiguous clock: the current hour back through n-1 prior
  // hours, then emit oldest→newest.
  const currentHourStart = Math.floor(Date.now() / 3600000) * 3600000;
  const buckets = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const hourStart = currentHourStart - i * 3600000;
    const hit = byHour.get(hourStart) || { calls: 0, failures: 0 };
    const calls = hit.calls;
    const failures = hit.failures;
    const succeeded = calls - failures;
    buckets.push({
      hour: new Date(hourStart).toISOString(),
      calls,
      failures,
      // null (not 0) on hours with zero calls — no calls means no rate.
      success_rate: calls > 0 ? Math.round((succeeded / calls) * 1000) / 10 : null,
    });
  }

  return { window_hours: n, buckets };
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

      // Per-department 24h rows for the windowed `degraded` flag — same window
      // and grouping the pg query does, computed in JS for parity.
      const dept24hRows = DEPARTMENTS.map((d) => {
        const dc = recent.filter((c) => c.department === d);
        return {
          department: d,
          calls: dc.length,
          succeeded: dc.filter((c) => c.succeeded).length,
        };
      });

      return shapeStats({
        totalCitizens: get.citizens().length,
        totalApplications: apps.length,
        statusRows,
        deptRows,
        consentGrants: get.consents().length,
        reuseCount,
        last24hCalls,
        last24hFailures,
        dept24hRows,
      });
    },

    async trend({ hours = DEFAULT_TREND_HOURS } = {}) {
      const n = Math.max(1, Number(hours) || DEFAULT_TREND_HOURS);
      const cutoff = Date.now() - n * 60 * 60 * 1000;
      // Group calls within the window onto their hour start, mirroring the pg
      // date_trunc('hour', ...); shapeTrend zero-fills the contiguous clock.
      const grouped = new Map();
      for (const c of get.calls()) {
        const t = c.called_at ? new Date(c.called_at).getTime() : NaN;
        if (!Number.isFinite(t) || t <= cutoff) continue;
        const hourStart = Math.floor(t / 3600000) * 3600000;
        const prev = grouped.get(hourStart) || { calls: 0, failures: 0 };
        grouped.set(hourStart, {
          calls: prev.calls + 1,
          failures: prev.failures + (c.succeeded ? 0 : 1),
        });
      }
      const rows = [...grouped.entries()].map(([hourStart, v]) => ({
        hour: new Date(hourStart).toISOString(),
        calls: v.calls,
        failures: v.failures,
      }));
      return shapeTrend({ hours: n, rows });
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
            composite_workflow_id: a.composite_workflow_id || null,
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

    async deleteTestCitizens({ emailPrefix = 'prod_user_' } = {}) {
      return [];
    },
  };
}

module.exports = {
  pgAdminRepository,
  createInMemoryAdminRepository,
  DEPARTMENTS,
  APPLICATION_STATUSES,
  DEGRADED_SUCCESS_RATE_THRESHOLD,
  DEFAULT_TREND_HOURS,
  MAX_TREND_HOURS,
};
