# Design — Certificate Application Flow

## Architecture
```
Citizen Dashboard (Next.js, Supabase Auth)
        │  POST /api/apply-certificate
        ▼
   Gateway (Next.js API layer)
        │
        ├─ auth-federation.ts ──► attaches correct credential per service
        │
        ├─► Land Records service     (GET, API-key auth)
        │       └─ land-records-adapter.ts ──► canonical shape
        │
        ├─► Certificate Issuance     (POST, JWT auth) [only if verified]
        │       └─ certificate-issuance-adapter.ts ──► canonical shape
        │
        └─► audit_log table (Supabase Postgres) ──► one row per call
```

## Sequence of calls (happy path)
1. Dashboard → Gateway: `POST /api/apply-certificate`
2. Gateway → Land Records: `GET /land-records/:khasra_no`
3. Land Records → Gateway: `verified: true`
4. Gateway writes audit row (`land-records`, `success`)
5. Gateway → Certificate Issuance: `POST /certificates/issue`
6. Certificate Issuance → Gateway: `status: issued`, `certificate_id`
7. Gateway writes audit row (`certificate-issuance`, `success`)
8. Gateway → Dashboard: final response with `certificate_id` + `steps[]`

## Sequence of calls (failure path)
1–2. same as above
3. Land Records → Gateway: 404 `record_not_found`
4. Gateway writes audit row (`land-records`, `failed`)
5. Gateway → Dashboard: `status: rejected`, `reason:
   land_record_not_found`, Certificate Issuance is never called

---

## Screens (3 total)

### 1. Dashboard / Login
- Supabase Auth login form.
- Post-login: citizen name + a single "Apply for Certificate" CTA.
- Deliberately no department menu — the absence of a portal list is
  itself the design statement being made.

### 2. Apply for Certificate
- Fields: certificate type (dropdown: caste / income / residence),
  land parcel reference (`khasra_no`, text input).
- No file-upload field, per Story 2's acceptance criteria.
- Submit transitions in-place to the status view (same page, no reload).

### 3. Status / Result view
- Two sequential status lines, each resolving live via the gateway's
  step-by-step response:
  - "Verifying land record..." → ✅ success / ❌ failed
  - "Issuing certificate..." → ✅ success / (skipped entirely if step 1
    failed — do not show this line as failed, omit it, since it was
    never attempted)
- Final state:
  - Success: certificate ID shown + "View audit trail" link
  - Failure: reason shown in plain language ("Land record not found —
    please check your parcel reference") + "View audit trail" link

### 4. Audit Log
- Table: service name, status, timestamp, request reference.
- Pulled from `GET /api/audit-log/:citizen_uid`.
- Deliberately plain — a legible table, not a dashboard-style widget
  layout. This screen's credibility comes from being obviously real
  data, not from visual flourish.

## States to handle on every screen
- Loading
- Success
- Error (network/service unreachable — distinct from a business-level
  rejection like "record not found")

## Visual direction
- Stack: shadcn/ui components, Tailwind, light GSAP limited to the
  status-line reveal animation.
- Tone: clean, trustworthy, govtech — muted palette, generous
  whitespace, no gradients or glow effects. This is not a consumer
  startup product; visual restraint reads as credibility to judges
  evaluating a government-facing tool.
- If time runs short, prioritize in this order: status view animation
  (this is what sells the "automatic, real-time" claim) > audit log
  clarity > login/dashboard polish.

## Error handling design
- Business-level rejection (e.g. record not found) is a normal, expected
  response from the gateway — not an HTTP error. The dashboard should
  render it as a calm, informative state, not a crash or a red banner
  screaming "ERROR."
- Network/infrastructure failure (a mock service is down) is a distinct
  state — show a "something went wrong, please retry" message, and this
  too must be logged to the audit trail with `status: failed`.
