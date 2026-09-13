# SIH26129 — Unified Interoperability Layer for Government Digital Platforms

> Govt of Maharashtra · Category: Software · Theme: Miscellaneous

## The problem
State and central government services — land records, certificates,
ration cards, grievance redressal, tax portals — live on separate
digital platforms, each built by a different department at a different
time with a different tech stack, login system, and data format. A
citizen whose task touches two departments has to manually fetch a
document from one portal and re-upload it to another.

## What this prototype demonstrates
A gateway layer that lets independently-built, schema-incompatible
department systems behave as one coherent system to the citizen —
**without rewriting the underlying department systems**, mirroring how
real government IT modernization actually happens: integration around
legacy systems, not replacement of them.

The demoed journey: a citizen applies for a certificate (caste / income
/ residence) that requires a verified land record. Today that's two
portals and a manual upload. Here, it's one form — the gateway silently
verifies the land record and issues the certificate, and every backend
call is logged for accountability.

Full spec: [`.kiro/specs/certificate-application/`](.kiro/specs/certificate-application)

## Architecture
```
Citizen Dashboard (Next.js + Supabase Auth)
        │
        ▼
   Gateway Layer  ──►  Land Records service        (API-key auth)
   (orchestration, ──►  Certificate Issuance service (JWT auth)
    schema         ──►  Grievance service            (session-cookie auth, stub)
    translation,
    audit log)
```

Each department service is deliberately built with a different data
shape and a different authentication method — that heterogeneity is
what the gateway is proving it can reconcile. See
[`.kiro/steering/tech.md`](.kiro/steering/tech.md) for full schemas and
API contracts.

## Why this approach
Rather than attempt a generic platform for "all government services" —
an unrealistic scope for a hackathon and a poor demo of depth — this
prototype builds one citizen journey end to end, including its failure
path, so the integration claim is verifiable rather than asserted. The
audit log lets anyone confirm that multiple, genuinely different backend
systems were actually called for a given request.

## Project docs
- [`.kiro/steering/product.md`](.kiro/steering/product.md) — problem, scope, success criteria
- [`.kiro/steering/tech.md`](.kiro/steering/tech.md) — stack, schemas, API contracts
- [`.kiro/steering/structure.md`](.kiro/steering/structure.md) — repo layout and build rules
- [`.kiro/specs/certificate-application/requirements.md`](.kiro/specs/certificate-application/requirements.md) — user stories & acceptance criteria
- [`.kiro/specs/certificate-application/design.md`](.kiro/specs/certificate-application/design.md) — architecture & UI design
- [`.kiro/specs/certificate-application/tasks.md`](.kiro/specs/certificate-application/tasks.md) — build checklist

## Running locally
_(fill in once services + gateway are running)_
```bash
# TODO: install steps, env vars, start commands per service + gateway
```

## Team
_(fill in)_
