# Requirements — Setu Gateway (cross-department verification)

Feature: a citizen logs into Setu once and requests data that lives in a
government department (Digital Tax Records, National Identity Registry,
or Driving Licence & Jan Aadhaar Portal). The gateway fetches and
verifies that data live on their behalf, only after explicit consent,
and logs every step — so nothing is manually shuffled between portals
and every action is provable.

> Naming note: this spec folder is still called `certificate-application`
> for historical reasons. The project was reframed from a
> land-record/certificate flow to the three real departments above; the
> folder name is kept only to avoid breaking references. Treat the
> department list here as authoritative.

---

## Story 1 — Unified login (gateway-owned identity)
As a citizen, I want to log in once to Setu, so that I don't need
separate credentials for each government department.

**Acceptance criteria**
- WHEN a citizen registers with an email and password THE SYSTEM SHALL
  create a `citizens` row with a bcrypt `password_hash` and SHALL NOT
  store the password in plaintext.
- WHEN a citizen submits valid credentials THE SYSTEM SHALL authenticate
  them against the `citizens` table and return a gateway-scoped JWT.
- WHEN a citizen is authenticated THE SYSTEM SHALL NOT prompt for any
  additional login for any department — the department gateway keys are
  held and used by the gateway, not the citizen.
- IF authentication fails THEN THE SYSTEM SHALL return a clear error and
  SHALL NOT issue a token.

## Story 2 — Start an application
As a citizen, I want to start an application for a service that needs
department data, so that the gateway can fetch it for me.

**Acceptance criteria**
- WHEN a citizen submits a new application THE SYSTEM SHALL create an
  `applications` row with `status = submitted` and the application
  `type`.
- THE SYSTEM SHALL NOT present any file-upload field — the absence of
  manual document handling is a core requirement, not an oversight.

## Story 3 — Consent before any department call
As a citizen, I want to approve exactly which fields are shared and with
which department, before anything is fetched, so that I stay in control.

**Acceptance criteria**
- WHEN a citizen approves a consent prompt THE SYSTEM SHALL write a
  `consent_grants` row recording the department and fields requested.
- WHEN the gateway is about to call a department THE SYSTEM SHALL verify
  a matching `consent_grants` row exists first — this is a real backend
  authorization check, not just a frontend dialog.
- IF no matching consent exists THEN THE SYSTEM SHALL refuse the
  department call.

## Story 4 — Gateway relay + verification
As a citizen, I want my department data fetched and verified
automatically, so that I don't visit each portal myself.

**Acceptance criteria**
- WHEN consent is granted THE SYSTEM SHALL move the application to
  `gateway_relay`, look up/create the citizen's `linked_references` row
  for that department, and make the real outbound HTTP call using that
  department's contract (see `api.md` Part 2) with the correct
  `X-Gateway-Key`.
- WHEN awaiting the department THE SYSTEM SHALL move the application to
  `department_verifying`.
- WHEN the department returns verified data THE SYSTEM SHALL set
  `linked_references.verified = true` and the application to `complete`.
- WHEN a department call completes (success or failure) THE SYSTEM SHALL
  write a row to `application_department_calls` AND a summary to
  `audit_log`.

## Story 5 — Live status visibility
As a citizen, I want to see each step happening in real time, so that I
trust the system is actually doing the work, not returning a black box.

**Acceptance criteria**
- WHEN an application is in flight THE SYSTEM SHALL expose its current
  status (`submitted → gateway_relay → department_verifying →
  complete`/`failed`) and its `application_department_calls` history via
  `GET /api/v1/applications/:id`.

## Story 6 — Audit trail
As a citizen (and as a judge evaluating the system), I want to see which
backend services were called for a request, so that the integration is
verifiable rather than asserted.

**Acceptance criteria**
- THE SYSTEM SHALL log an entry for every department call regardless of
  success or failure — a failed request must still be fully traceable.
- WHEN a citizen views their documents THE SYSTEM SHALL show their
  `linked_references` (which departments are verified) via
  `GET /api/v1/documents`.

## Story 7 — Graceful failure
As a citizen, I want a clear explanation if a department can't be
reached, so that I'm not left with a crashed page or silence.

**Acceptance criteria**
- IF a department is unreachable, times out, or rejects the request
  (after any built-in retry, e.g. the National Identity Registry
  short-lived-token retry) THEN THE SYSTEM SHALL set the application to
  `failed`, show a clear honest message, and SHALL still write a
  `failed` row to `application_department_calls` and `audit_log`.
- THE SYSTEM SHALL never silently substitute fake data for a failed
  department call.

## Story 8 — Reuse (the actual point)
As a returning citizen, I want a department I've already verified to be
reusable, so that a second application doesn't make me re-enter anything.

**Acceptance criteria**
- WHEN a `linked_references` row already exists with `verified = true`
  for a department THE SYSTEM SHALL, for a future application needing
  that department, skip re-entry and go straight to a fresh (still
  consented, still logged) data fetch.

---

## Explicitly not covered by this spec
Admin-facing views, multi-department dashboards beyond the citizen's own
applications, and any department beyond the three above. See
`.kiro/steering/product.md` for full scope boundaries and `appflow.md`
for the end-to-end sequence.
