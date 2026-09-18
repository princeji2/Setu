# Product — SIH26129 (Setu Gateway)

## Problem statement (as given)
"System integration and interoperability among government digital
platforms, resulting in fragmented service delivery" — Govt of
Maharashtra, Category: Software, Theme: Miscellaneous.

In plain terms: state and central government services (tax/PAN records,
identity registries, driving licence and Jan Aadhaar portals, and many
more) live on separate platforms — different departments, different
eras, different tech stacks, different logins, different data formats. A
citizen whose task touches two departments has to manually fetch a
document from portal A and re-upload it to portal B. Nothing talks to
anything else.

## Who this is for
A citizen who needs to prove or reuse data that lives across multiple
government departments — for example verifying a PAN/tax reference, an
identity-registry reference, or a driving-licence registration — without
logging into each department separately and shuffling documents by hand.
Setu gives them one login and one place to authorize and track those
cross-department data pulls.

## The one journey this prototype proves out
A citizen logs into Setu once, starts an application that needs data
from a department, consents to exactly which fields are shared, and the
gateway fetches and verifies that data live from the department on their
behalf — every step logged. The real payoff is reuse: a second
application needing the same department's data skips straight past
re-entry. Full step-by-step sequence lives in `appflow.md` and
`.kiro/specs/certificate-application/requirements.md`.

## Why this journey and not a broader platform
"Government interoperability" is an enormous real-world problem. A
hackathon prototype that tries to be a generic platform for "all
government services" will be shallow everywhere and convincing nowhere.
One journey, built solidly enough to survive judge questioning, is the
better bet — the architecture (gateway + schema translation + auth
federation + consent + audit) is what generalizes, not the number of
services wired up.

## The three real departments (source of truth: `Mock_Sites/`)
These are the three heterogeneous backends the gateway integrates. They
already exist, run independently, and are NOT built by the gateway team:

1. **Digital Tax Records** — `UIDAI_Backend_Digital_Tax_Records`
   (FastAPI + SQLite). PAN-style references, e.g. `SYNPAN-000123`.
2. **National Identity Registry** — `Independent Identity Registration
   Portal` (Node/Express + PostgreSQL). Identity-registry references;
   known quirk: short-lived tokens on some flows.
3. **Driving Licence & Jan Aadhaar Portal** —
   `driving-licence-jan-aadhaar-portal` (Node/Express + PostgreSQL).
   Registration references.

Exact endpoints, headers, and response shapes are in `api.md` Part 2 and
`Mock_Sites/HOW_GATEWAY_CONNECTS_TO_MOCK_SITES.md`.

## In scope
- 3 mock department services with genuinely different data shapes (this
  heterogeneity is the point — it's what proves the gateway can handle
  real-world interoperability, not just call one API). All three
  currently authenticate the gateway via an `X-Gateway-Key` header, but
  with independent per-department key values and differing error wording
  and response shapes.
- A gateway/integration layer: its own citizen identity (hand-rolled),
  consent enforcement, schema translation, request orchestration, and
  audit logging.
- A citizen-facing frontend for the journey above (separate app that
  calls the gateway's citizen-facing API — not coupled into the gateway
  backend).
- An audit/log view showing which backend services were called, in what
  order, with what result, for a given citizen request.

## Explicitly out of scope
- Any department beyond the three above.
- Real integration with any actual government system — these are mock
  departments.
- Admin panels, multi-department dashboards, or anything not needed to
  demo the one journey. (Citizen registration/login IS in scope — the
  gateway owns its own `citizens` identity; see `database-schema.md`.)
- Production-grade security (this is a prototype — auth federation and
  citizen auth should be real enough to demonstrate the concept, not
  hardened).

## Success criteria (what "done" means for the demo)
1. The full journey (login → apply → consent → gateway relay → department
   verify → complete → audit trail) runs live, end to end, without manual
   intervention, in under 60 seconds.
2. The failure path (a department stopped/unreachable) produces a clear,
   honest error state and is still recorded in the audit log and
   `application_department_calls` — this is what proves the system is
   engineered, not scripted.
3. A judge can look at the audit log and independently see that 2+
   backend services with different response shapes were actually called
   over real HTTP — not simulated with a single hardcoded response.
4. The reuse story (verify once, reuse across future applications without
   re-entry) is demonstrated live.
5. The before/after story (many portals + manual upload vs. one Setu
   login) is stated clearly in under 30 seconds during the pitch.

## Pitch framing (say this early in the demo)
"Today, a citizen needing data from two departments logs into each
portal separately, downloads a document from one, and re-uploads it to
the other. With Setu they log in once, approve exactly what's shared,
and the gateway fetches and verifies it live — and every step is logged
for accountability." Then run the live demo, including a second
application that reuses an already-verified department reference.
