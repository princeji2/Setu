# Structure — SIH26129

## Repo layout
```
/services
  /land-records            — mock service, API-key auth
  /certificate-issuance     — mock service, JWT auth
  /grievance                 — mock service stub, session-cookie auth
/gateway
  /adapters                 — one schema-translation adapter per service
  /routes                   — apply-certificate.ts, audit-log.ts
  auth-federation.ts         — maps Supabase session -> per-service credentials
/app                          — Next.js dashboard (citizen-facing)
  /login
  /apply
  /status
  /audit-log
.kiro
  /steering                 — product.md, tech.md, structure.md (this set)
  /specs
    /certificate-application — requirements.md, design.md, tasks.md
README.md
```

## Naming conventions
- Mock services: kebab-case folder names matching their service_name in
  the audit log (`land-records`, not `LandRecords` or `land_records`).
- Gateway adapters: `<service-name>-adapter.ts`, one file per service,
  each exporting a single `translate(rawResponse) -> canonicalShape`
  function. Keep translation logic out of the route handlers.
- API routes: match the contracts in `tech.md` exactly — do not rename
  fields or endpoints without updating that file first.

## Hard rules (do not deviate without updating steering docs first)
1. **The 3 mock services must not share a database, a schema, or an auth
   method.** This heterogeneity is the entire premise of the project.
   "Simplifying" by merging them defeats the demo.
2. **Every gateway call to a downstream service must write an audit log
   row**, success or failure. No silent calls — the audit log is a
   judged feature, not an afterthought.
3. **The gateway must short-circuit on failure.** If Land Records
   verification fails, Certificate Issuance must never be called. Don't
   build a version that calls both regardless of outcome.
4. **Build only the one journey** in
   `.kiro/specs/certificate-application/`. If a new screen, endpoint, or
   service starts to feel necessary, stop and update `product.md`'s
   scope section first — don't let scope grow silently mid-build.
5. **No mock service should be aware of the others.** Each one should
   be codeable and testable in total isolation from the gateway and
   from each other — the gateway is the only thing that knows about all
   three.

## When something isn't covered here
Add a short note under the relevant steering file rather than solving it
silently — these files should stay an accurate reflection of what the
codebase actually does, not a plan frozen from day one.

## Keeping docs truthful (drift discipline)
These files describe a system before most of it exists. The moment code
diverges from a contract in `tech.md` or a sequence in `design.md`, that
file becomes actively misleading rather than just stale — worse than no
doc at all. Rule: if you change an endpoint, field name, or the
call sequence while coding, update the relevant steering/spec file in
the SAME sitting, not "later." Use the `tasks.md` checkboxes as the
forcing function — don't check a task off until the doc it touches
matches what you actually built.
