# Setu Gateway — App Flow

This describes the end-to-end citizen journey through Setu, and what
the gateway is doing behind the scenes at each step. This is the
document to walk a judge through when they ask "show me what actually
happens."

## 1. Citizen logs in

Citizen creates a Setu account or logs in (`POST /api/v1/auth/login`).
This is a Setu-only credential — it has no relationship to any
department's own login system. At this point the citizen has no
`linked_references` yet unless they've used Setu before.

## 2. Citizen starts an application

Citizen picks a service from "Find a service" (e.g. "PAN
verification", "Identity verification", "Driving licence
registration"). This creates a row in `applications` with
`status = submitted`.

## 3. Consent

Before the gateway contacts the relevant department, the citizen sees
the consent modal: exactly which fields will be requested, from which
department, and why. Approving this writes a `consent_grants` row.
**The gateway must check for this row before making the department
call — this is a real authorization check in the backend, not just a
frontend confirmation dialog.**

## 4. Gateway relay

`application.status` moves to `gateway_relay`. The gateway looks up
(or creates) the citizen's `linked_references` row for that
department, then makes the actual outbound call using that
department's contract (see `api.md`, Part 2) — with the correct
`X-Gateway-Key`, correct endpoint, correct reference.

Every call, success or failure, is written to
`application_department_calls` and summarized in `audit_log`.

## 5. Department verifying

`application.status` moves to `department_verifying` while waiting on
the department's response. For departments with quirks (e.g. National
Identity Registry's short-lived tokens), this is where a retry may
happen transparently to the citizen — they should see "still
verifying," not an error, if the gateway successfully retries.

## 6. Complete (or failed)

- **Success:** the department returned verified data. The gateway
  updates `linked_references.verified = true` for that department,
  sets `application.status = complete`, and the citizen sees the
  result (e.g. their masked PAN fields) reflected in "My documents"
  and the application tracker.
- **Failure:** if the department is unreachable, times out, or
  rejects the request even after any built-in retry, `application.status
  = failed`. The citizen sees a clear, honest message (e.g. "couldn't
  reach Digital Tax Records — try again shortly") — never a silently
  substituted fake result.

## 7. Reuse (the actual point of the whole project)

Once a document is verified once (an entry exists in
`linked_references` with `verified = true`), any *future* application
that needs data from that same department does not need to repeat
steps 3-6 for that department — the gateway already has a live
reference and can go straight to a fresh data fetch (still logged,
still respecting a fresh consent grant per application) without asking
the citizen to re-enter anything.

This is the moment to make vivid in a demo: start a second
application that needs the same department's data as the first, and
show it skip straight past re-entry.

**How it works (implemented, Phase 4b).** `POST /api/v1/applications/:id/verify`
takes `reference` as *optional*. When it's omitted, the gateway looks up the
citizen's verified `linked_references` row for that application's department
(repository `findVerified`) and uses the stored `department_reference`. If
there's nothing verified yet and no reference is supplied, it returns `400`
(genuinely first-time — nothing to reuse). Reuse skips **only** the re-entry:
consent is still enforced per application (a fresh `consent_grants` row is
still required — reuse never bypasses Story 3), the fetch is still a live HTTP
call (reuse re-fetches, never serves cached department data), and the call is
still written to `application_department_calls` + `audit_log`. The reuse is
tagged `reused_reference: true` in the `department_call` audit entry, and the
verify response carries `reused: true`, so the skip is provable to a judge,
not inferred from timing.

Live proof: `node scripts/phase4b-reuse-walkthrough.js` (needs Postgres + DTR
up) verifies once with a reference, then runs a second application with NO
reference and prints the real `linked_references`, `application_department_calls`,
and `audit_log` rows showing the reuse.

## Failure-mode walkthrough (for demo Q&A)

A judge is likely to ask "what if a department is down?" Be ready to
show, not just describe:

1. Stop one of the three mock services.
2. Start an application that needs that department.
3. Show the gateway's honest failure message to the citizen.
4. Show the corresponding `failed` row in `application_department_calls`
   and the matching `audit_log` entry -- proving the failure was
   handled, not swallowed.

## What this flow deliberately does NOT do

- It does not let one department see another department's data. The
  gateway is the only party that ever holds more than one department's
  reference for a given citizen.
- It does not cache or store a department's raw response beyond what's
  needed to answer the current application -- see the open question in
  `database-schema.md` about `response_summary`.
