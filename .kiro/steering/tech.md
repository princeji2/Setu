# Tech — SIH26129

## Stack (locked — do not suggest alternatives mid-build)
- **Frontend**: Next.js (App Router), shadcn/ui components, Tailwind
- **Auth**: Supabase Auth (single citizen identity)
- **Database**: Supabase Postgres (audit log + mock service seed data)
- **Mock services**: standalone Node/Express APIs (or Next.js API routes
  if time-pressed) — one per department, deployed/run separately
- **Animation**: GSAP, used only for the live status-line reveal on the
  result screen — not used decoratively elsewhere
- **Gateway**: a dedicated Next.js API layer (or lightweight standalone
  service) — see structure.md for where this lives in the repo

## Why this stack
Everything here is something already in active use — no new tools are
being learned mid-hackathon. The one deliberate constraint is service
separation: the 3 mock services must run and store data independently,
because proving the gateway can reconcile *genuinely* different systems
is the whole point of an "interoperability" problem statement. Merging
them into one shared schema would demo a CRUD app, not an integration
layer.

---

## 1. Mock Department Services

Each service is intentionally different in field naming AND auth
mechanism. Do not harmonize these — the mismatch is deliberate.

### 1a. Land Records Service
- **Auth**: static API key, sent as `x-api-key` header
- **Endpoint**: `GET /land-records/:khasra_no`
- **Success response (200)**:
```json
{
  "khasra_no": "MH-2024-88231",
  "owner_name": "Ramesh Patil",
  "village": "Wagholi",
  "district": "Pune",
  "land_type": "agricultural",
  "verified": true,
  "last_updated": "2024-11-02T00:00:00Z"
}
```
- **Not found (404)**:
```json
{ "error": "record_not_found", "khasra_no": "MH-2024-99999" }
```
- **Auth failure (401)**: `{ "error": "invalid_api_key" }`

### 1b. Certificate Issuance Service
- **Auth**: JWT bearer token (`Authorization: Bearer <token>`)
- **Endpoint**: `POST /certificates/issue`
- **Request**:
```json
{
  "applicant_id": "string",
  "cert_type": "caste | income | residence",
  "supporting_ref": "string"
}
```
- **Success response (201)**:
```json
{
  "certificate_id": "CERT-2026-004521",
  "status": "issued",
  "issued_on": "2026-09-13T10:22:00Z"
}
```
- **Rejected (200, business-level rejection, not an HTTP error)**:
```json
{ "certificate_id": null, "status": "rejected", "reason": "unverified_supporting_ref" }
```

### 1c. Grievance Service (stub — not in the demoed flow)
- **Auth**: session cookie
- **Endpoint**: `POST /grievance/ticket`
- **Purpose**: exists solely to prove a 3rd, differently-shaped,
  differently-authenticated system can also sit behind the same gateway.
  Build it minimally — one endpoint, one seed record — do not build a
  full grievance workflow.
```json
{
  "ticket_ref": "GRV-88231",
  "citizen_uid": "string",
  "subject": "string",
  "status": "open | closed"
}
```

---

## 2. Canonical Schema (internal, gateway-side only)

Every downstream response is translated into this shape before it
reaches the dashboard or the audit log. The dashboard and audit log
should never need to know a department's native field names.

```json
{
  "citizen": {
    "uid": "string",
    "name": "string"
  },
  "land_record": {
    "ref": "string",          // maps from khasra_no
    "verified": "boolean",
    "source_service": "land-records"
  },
  "certificate": {
    "id": "string | null",
    "type": "string",
    "status": "issued | rejected | pending",
    "source_service": "certificate-issuance"
  }
}
```

---

## 3. Gateway API (what the dashboard actually calls)

### `POST /api/apply-certificate`
Orchestrates: Land Records lookup → (if verified) Certificate Issuance
→ audit log write for every step, regardless of outcome.

**Request**:
```json
{
  "citizen_uid": "string",
  "cert_type": "caste | income | residence",
  "khasra_no": "string"
}
```

**Success response**:
```json
{
  "certificate_id": "CERT-2026-004521",
  "status": "issued",
  "steps": [
    { "service": "land-records", "status": "success", "timestamp": "2026-09-13T10:21:40Z" },
    { "service": "certificate-issuance", "status": "success", "timestamp": "2026-09-13T10:22:00Z" }
  ]
}
```

**Failure response (land record not found)** — this is the one failure
path the demo must show:
```json
{
  "certificate_id": null,
  "status": "rejected",
  "reason": "land_record_not_found",
  "steps": [
    { "service": "land-records", "status": "failed", "timestamp": "2026-09-13T10:21:40Z" }
  ]
}
```
Note: Certificate Issuance is never called if Land Records fails — the
gateway must short-circuit, not call downstream services blindly.

### `GET /api/audit-log/:citizen_uid`
Returns full step history for a citizen, most recent first, read from
the `audit_log` table below.

---

## 4. Auth Federation (how one login covers 3 different auth styles)

Citizen authenticates once via Supabase Auth. The gateway holds the
credentials/tokens each mock service needs (API key for Land Records,
service-level JWT for Certificate Issuance, session cookie for
Grievance) and attaches the correct one per downstream call. The citizen
never sees or handles any of these — that's the "unified identity"
claim in the pitch. For the prototype, these downstream credentials can
be static/service-level (not per-citizen) since the mock services don't
need real per-user auth — what's being demonstrated is that the gateway
handles the *translation*, not that each citizen has a real account on
each legacy system.

---

## 5. Audit Log Table (Supabase Postgres)

| column         | type          | notes                              |
|----------------|---------------|-------------------------------------|
| id             | uuid, pk      |                                      |
| citizen_uid    | text          |                                      |
| service_name   | text          | `land-records` \| `certificate-issuance` |
| status         | text          | `success` \| `failed`               |
| request_ref    | text          | khasra_no or applicant_id, for traceability |
| timestamp      | timestamptz   | default `now()`                     |

## Open questions to resolve during build
- [ ] Exact JWT signing approach for the Certificate Issuance mock (can
      be a fixed shared secret for prototype purposes)
- [ ] Whether mock services are deployed separately or run as 3
      processes locally for the demo — decide based on demo-day
      internet reliability
