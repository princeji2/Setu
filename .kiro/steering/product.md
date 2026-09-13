# Product — SIH26129

## Problem statement (as given)
"System integration and interoperability among government digital
platforms, resulting in fragmented service delivery" — Govt of
Maharashtra, Category: Software, Theme: Miscellaneous.

In plain terms: state and central government services (land records,
certificates, ration cards, grievance redressal, tax portals) live on
separate platforms — different departments, different eras, different
tech stacks, different logins, different data formats. A citizen whose
task touches two departments has to manually fetch a document from
portal A and re-upload it to portal B. Nothing talks to anything else.

## Who this is for
A citizen applying for a government certificate (caste / income /
residence) that legally requires a verified land record as supporting
evidence — currently a two-portal, manual-document-shuffling process.

## The one journey this prototype proves out
Certificate application that requires land-record verification, handled
end-to-end through a single login and a single form, with the
verification happening automatically behind the scenes. Full step-by-step
sequence lives in `.kiro/specs/certificate-application/requirements.md`.

## Why this journey and not a broader platform
"Government interoperability" is an enormous real-world problem. A
hackathon prototype that tries to be a generic platform for "all
government services" will be shallow everywhere and convincing nowhere.
One journey, built solidly enough to survive judge questioning, is the
better bet — the architecture (gateway + schema translation + auth
federation) is what generalizes, not the number of services wired up.

## In scope
- 3 mock department services with genuinely different data shapes and
  auth methods (this heterogeneity is the point — it's what proves the
  gateway can handle real-world interoperability, not just call APIs)
- A gateway/integration layer: unified auth, schema translation, request
  orchestration, audit logging
- A citizen-facing dashboard for the one journey above
- An audit/log view showing which backend services were called, in what
  order, with what result, for a given citizen request

## Explicitly out of scope
- Any government service beyond Land Records + Certificate Issuance in
  the main flow (Grievance service exists as a stub to demonstrate a
  3rd heterogeneous schema, but is not part of the demoed journey)
- Real integration with any actual Maharashtra government system
- User/citizen registration flows, admin panels, multi-department
  dashboards, or anything not needed to demo the one journey
- Production-grade security (this is a prototype — auth federation
  should be real enough to demonstrate the concept, not hardened)

## Success criteria (what "done" means for the demo)
1. The full journey (login → apply → verify → issue → audit trail) runs
   live, end to end, without manual intervention, in under 60 seconds.
2. The failure path (invalid land record) produces a clear error state
   and is still recorded in the audit log — this is what proves the
   system is engineered, not scripted.
3. A judge can look at the audit log and independently see that 2+
   backend services with different auth/schema were actually called —
   not simulated with a single hardcoded response.
4. The before/after story (2 portals + manual upload vs. 1 form) is
   stated clearly in under 30 seconds during the pitch.

## Pitch framing (say this early in the demo)
"Today, a citizen needing this certificate visits one portal to get
their land record, downloads it, then uploads it to a second portal.
Here, they fill one form — everything else happens automatically, and
every step is logged for accountability." Then run the live demo.
