# Setu Gateway — Database Schema

This is the schema for the **gateway's own database** — not any
department's database. The gateway does not share storage with
Digital Tax Records, the National Identity Registry, or the Driving
Licence & Jan Aadhaar Portal. It only stores what it needs to
orchestrate calls to them and prove (via audit log) that it did.

Keep this intentionally small. This is a hackathon demo, not a
production identity system — don't add tables you don't have a
concrete use for yet.

## Tables

### `citizens`
The Setu-ID — one row per citizen using the gateway.

| Column         | Type      | Notes                                      |
|----------------|-----------|---------------------------------------------|
| id             | UUID (PK) | Setu's own internal citizen ID              |
| full_name      | text      | Display name only — not a source of truth   |
| email          | text      | Login credential                            |
| password_hash  | text      | bcrypt/argon2, never plaintext               |
| created_at     | timestamp |                                              |

Do **not** store PAN, Aadhaar-style identity numbers, or driving
licence numbers here — those live only in the department that issued
them. This table just needs enough to authenticate the citizen to
Setu itself.

### `linked_references`
Maps a citizen to their reference/ID at each department. This is the
join table that lets the gateway know *which* PAN reference, identity
registry reference, and driving licence reference belong to a given
citizen — without copying the underlying data.

| Column          | Type      | Notes                                                        |
|-----------------|-----------|----------------------------------------------------------------|
| id              | UUID (PK) |                                                                  |
| citizen_id      | UUID (FK → citizens.id) |                                                |
| department      | text      | one of: `digital_tax_records`, `national_identity_registry`, `driving_licence_jan_aadhaar` |
| department_reference | text | the reference string that department uses (e.g. `SYNPAN-000123`, `REG-A3F7C291`) |
| linked_at       | timestamp |                                                                  |
| verified        | boolean   | true once the gateway has successfully fetched this reference at least once |

One citizen can have at most one `linked_references` row per
department (unique constraint on `citizen_id, department`).

### `applications`
A citizen-initiated request that requires the gateway to pull data
from one or more departments.

| Column        | Type      | Notes                                                         |
|---------------|-----------|------------------------------------------------------------------|
| id            | UUID (PK) |                                                                    |
| citizen_id    | UUID (FK) |                                                                    |
| type          | text      | e.g. `pan_verification`, `identity_verification`, `driving_licence_registration` |
| status        | text      | `submitted`, `gateway_relay`, `department_verifying`, `complete`, `failed` |
| created_at    | timestamp |                                                                    |
| updated_at    | timestamp |                                                                    |

### `application_department_calls`
One row per outbound call the gateway makes to a department while
processing an application. This is the detail behind `applications` —
lets you show "here's exactly what the gateway asked each department
for, and what came back."

| Column          | Type      | Notes                                                    |
|-----------------|-----------|-----------------------------------------------------------|
| id              | UUID (PK) |                                                             |
| application_id  | UUID (FK) |                                                             |
| department      | text      | same enum as `linked_references.department`               |
| endpoint_called | text      | e.g. `GET /pan/SYNPAN-000123/fields`                       |
| status_code     | integer   | HTTP status the department returned                        |
| succeeded       | boolean   |                                                             |
| response_summary| text      | short, non-sensitive summary — not the raw payload         |
| called_at       | timestamp |                                                             |
| duration_ms     | integer   |                                                             |

### `consent_grants`
Records that the citizen approved a specific data share before it
happened — this is what your consent-modal UI is actually backing.

| Column           | Type      | Notes                                                        |
|------------------|-----------|-----------------------------------------------------------------|
| id               | UUID (PK) |                                                                   |
| citizen_id       | UUID (FK) |                                                                   |
| application_id   | UUID (FK) |                                                                   |
| department       | text      | which department's data this consent covers                     |
| fields_requested | text (JSON array) | e.g. `["PAN number", "identity match"]`                 |
| granted_at       | timestamp |                                                                   |

### `audit_log`
The append-only trail — every notable gateway action, not just
department calls. This is the table you'd point a judge at.

| Column      | Type      | Notes                                                          |
|-------------|-----------|-------------------------------------------------------------------|
| id          | UUID (PK) |                                                                     |
| citizen_id  | UUID (FK, nullable) | null for system-level events                             |
| action      | text      | e.g. `consent_granted`, `department_call`, `application_status_change` |
| detail      | text (JSON) | free-form structured detail for that action type                 |
| occurred_at | timestamp |                                                                     |

## What's deliberately NOT in this schema

- No raw PAN numbers, Aadhaar-style identity numbers, or driving
  licence numbers stored anywhere in the gateway's own database —
  those stay in their department of origin. The gateway only ever
  holds *references* to them.
- No department-specific fields duplicated into gateway tables (e.g.
  no `income_bracket` column here) — if the gateway needs that data
  for the current request, it fetches it live and either passes it
  through or discards it; it doesn't become gateway-owned state.

## Resolved — `response_summary` content (decided Phase 4 → 4b)

**Decision: masked-but-real field values, NOT metadata-only.**
`application_department_calls.response_summary` on a successful call
carries real fetched values in a masked form, e.g.
`verified=true; fullName=U*** A****, filingStatus=FILED,
incomeBracket=5-10L, dob=1980-**-**, address=*** 110001`.

Rationale: the reuse-path demo is the centrepiece, and an audit log
proving the gateway fetched *actual* data (then reused it without
re-asking) is a far stronger judge moment than a summary that only says
"a call happened." Masking preserves the same protection we already
apply to sensitive values while keeping the proof convincing.

Masking is centralised in `gateway/src/utils/mask.js` (single source of
truth) and applied inside each department client's `translate()` — the
raw sensitive value never leaves the client, so only masked forms reach
Postgres. Rules: personal names → initials (`U*** A****`); DOB → year
only (`1980-**-**`); address → trailing pincode only (`*** 110001`);
coarse/categorical values (filing status, income bracket, gender,
assessment year, verification_status, counts) kept verbatim; the
reference/public handle kept verbatim (it already appears in
`endpoint_called`); values already masked at source pass through
unchanged; unknown fields default to masked. On failure,
`response_summary` is the honest error string (no field content).
