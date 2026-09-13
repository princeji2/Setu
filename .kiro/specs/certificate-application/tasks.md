# Tasks — Certificate Application Flow

Deadline: **30 September 2026**. Each task references the requirement(s)
it satisfies (see `requirements.md`).

## Phase 0 — Design (complete)
- [x] Define the one citizen journey → `product.md`
- [x] Design 3 mock schemas + canonical schema + API contracts → `tech.md`
- [x] Write user stories + acceptance criteria → `requirements.md`
- [x] Sketch architecture + screens + states → `design.md`

## Phase 1 — Mock department services
- [ ] Scaffold `/services/land-records`: `GET /land-records/:khasra_no`,
      API-key auth check, 200/404/401 responses per `tech.md` §1a
      (satisfies Story 3)
- [ ] Scaffold `/services/certificate-issuance`: `POST
      /certificates/issue`, JWT auth check, 201/rejection responses per
      `tech.md` §1b (satisfies Story 4)
- [ ] Scaffold `/services/grievance`: single stub endpoint, session
      cookie auth — minimal, not part of the demoed flow (satisfies the
      "3rd heterogeneous schema" claim in `product.md`)
- [ ] Seed each service with a deterministic test citizen (same
      `khasra_no` / `applicant_id` works every demo run — do not rely on
      random data during a live demo)
- [ ] Seed at least one intentionally-invalid `khasra_no` for the
      failure-path demo (Story 7)
- [ ] Confirm each service runs independently with no shared DB
      (structure.md rule 1)

## Phase 2 — Gateway layer
- [ ] Build `auth-federation.ts`: maps an authenticated Supabase session
      to the correct credential per downstream service (Story 1)
- [ ] Build `land-records-adapter.ts`: translate raw response into
      canonical `land_record` shape (`tech.md` §2)
- [ ] Build `certificate-issuance-adapter.ts`: translate raw response
      into canonical `certificate` shape
- [ ] Build `POST /api/apply-certificate` route: call Land Records →
      short-circuit on failure → call Certificate Issuance → return
      `steps[]` (Stories 3, 4; structure.md rule 3)
- [ ] Write audit log row after every downstream call, success or
      failure (Story 6; structure.md rule 2)
- [ ] Build `GET /api/audit-log/:citizen_uid` route
- [ ] Test the failure path explicitly: invalid `khasra_no` →
      Certificate Issuance never called → audit log shows exactly one
      `failed` row (Story 3, Story 7)

## Phase 3 — Citizen dashboard
- [ ] Login screen (Supabase Auth)
- [ ] Apply for Certificate form — no file upload field (Story 2)
- [ ] Live status view: sequential status lines wired to the gateway's
      `steps[]` response, GSAP reveal animation (Story 5)
- [ ] Success state: certificate ID + link to audit trail
- [ ] Failure state: plain-language rejection reason + link to audit
      trail (Story 7)
- [ ] Audit Log screen: table pulling from `GET /api/audit-log/:uid`
      (Story 6)

## Phase 4 — Failure handling + polish
- [ ] Confirm the full failure path renders correctly on the dashboard,
      not just in the API response
- [ ] Confirm a network-level failure (service down) renders as a
      distinct state from a business-level rejection (design.md, error
      handling section)
- [ ] Visual polish pass, in priority order: status view > audit log >
      login/dashboard (design.md)

## Phase 5 — Pitch assets
- [ ] PPT: problem → before/after → architecture diagram → live demo →
      scalability note (how this attaches to real Maharashtra systems
      without touching their backends)
- [ ] Record a 2–3 min backup demo video, both happy path and failure
      path
- [ ] Full rehearsal, out loud, once — time it against the 60-second
      success criterion in `product.md`

## Demo-day contingency (do not skip)
- [ ] Decide now, not on the day: are the 3 mock services deployed
      (Railway/Render) or run locally? Whichever you choose, test it on
      the actual venue wifi/hotspot beforehand if at all possible.
- [ ] If a mock service becomes unreachable mid-demo, the fallback is
      the backup video — not live debugging in front of judges. Know
      which screen of the video corresponds to "resume from here."
- [ ] Keep a terminal tab open with all 3 services + gateway already
      running before you're called up — do not start them from cold
      during your slot.
- [ ] Have one screenshot of a populated audit log saved locally, in
      case the live audit screen fails to load — a judge can still see
      the evidence even if the UI hiccups.
