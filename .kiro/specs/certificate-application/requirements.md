# Requirements — Certificate Application Flow

Feature: a citizen applies for a certificate (caste/income/residence)
that requires land-record verification, without manually handling any
documents themselves.

---

## Story 1 — Unified login
As a citizen, I want to log in once, so that I don't need separate
credentials for each government service involved in my request.

**Acceptance criteria**
- WHEN a citizen submits valid credentials THE SYSTEM SHALL authenticate
  them via Supabase Auth and grant access to the dashboard.
- WHEN a citizen is authenticated THE SYSTEM SHALL NOT prompt for any
  additional login for Land Records, Certificate Issuance, or the
  Grievance service — those credentials are held and used by the
  gateway, not the citizen.
- IF authentication fails THEN THE SYSTEM SHALL show a clear error and
  SHALL NOT grant dashboard access.

## Story 2 — Apply for a certificate
As a citizen, I want to submit one form with my certificate type and
land parcel reference, so that I don't need to fetch or upload any
supporting documents myself.

**Acceptance criteria**
- WHEN a citizen submits the apply form THE SYSTEM SHALL send
  `citizen_uid`, `cert_type`, and `khasra_no` to
  `POST /api/apply-certificate`.
- THE SYSTEM SHALL NOT present any file-upload field on this form — the
  absence of manual document handling is a core requirement, not an
  oversight.
- WHEN the form is submitted THE SYSTEM SHALL transition to the live
  status view without a full page reload.

## Story 3 — Automatic land-record verification
As a citizen, I want my land record verified automatically, so that I
don't have to visit a separate portal to fetch it myself.

**Acceptance criteria**
- WHEN the gateway receives an apply-certificate request THE SYSTEM
  SHALL call the Land Records service with the provided `khasra_no`.
- WHEN the Land Records service returns `verified: true` THE SYSTEM
  SHALL proceed to certificate issuance (Story 4).
- WHEN the Land Records service returns a 404 (record not found) THE
  SYSTEM SHALL mark the request as rejected with reason
  `land_record_not_found` AND SHALL NOT call Certificate Issuance.
- WHEN the Land Records call completes (success or failure) THE SYSTEM
  SHALL write a corresponding row to the audit log.

## Story 4 — Automatic certificate issuance
As a citizen, I want my certificate issued automatically once my land
record is verified, so that the two-step process is invisible to me.

**Acceptance criteria**
- WHEN Land Records verification succeeds THE SYSTEM SHALL call the
  Certificate Issuance service with `applicant_id`, `cert_type`, and the
  verified `supporting_ref`.
- WHEN Certificate Issuance returns `status: issued` THE SYSTEM SHALL
  return the `certificate_id` to the dashboard and mark the request
  complete.
- WHEN the Certificate Issuance call completes THE SYSTEM SHALL write a
  corresponding row to the audit log.

## Story 5 — Live status visibility
As a citizen, I want to see each verification step happening in real
time, so that I trust the system is actually doing the work, not just
returning a black-box result.

**Acceptance criteria**
- WHEN the apply request is in flight THE SYSTEM SHALL display
  sequential status lines ("Verifying land record...", "Issuing
  certificate...") that resolve to a success or failure state as each
  step completes.
- WHEN the final result is available THE SYSTEM SHALL display the
  certificate ID (on success) or a clear rejection reason (on failure).

## Story 6 — Audit trail
As a citizen (and as a judge evaluating the system), I want to see
which backend services were called for a given request, so that the
integration is verifiable rather than asserted.

**Acceptance criteria**
- WHEN a citizen opens the audit log view THE SYSTEM SHALL display, for
  their most recent request, each service called, its status, and a
  timestamp, sourced from `GET /api/audit-log/:citizen_uid`.
- THE SYSTEM SHALL log an entry for every downstream call regardless of
  success or failure — a failed request must still be fully traceable.

## Story 7 — Graceful failure
As a citizen, I want a clear explanation if my application can't be
processed, so that I'm not left with a crashed page or silence.

**Acceptance criteria**
- IF the Land Records service returns a 404 THEN THE SYSTEM SHALL
  display "Land record not found — please check your parcel reference"
  on the dashboard, not a generic error or a blank state.
- IF any downstream service is unreachable THEN THE SYSTEM SHALL
  display a retry-safe error state and SHALL still write an audit log
  entry marked `failed`.

---

## Explicitly not covered by this spec
Grievance ticket submission, multi-certificate applications, citizen
registration/onboarding, and any admin-facing views. See
`.kiro/steering/product.md` for full scope boundaries.
