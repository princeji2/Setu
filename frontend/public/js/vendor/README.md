# Vendored third-party assets

## gsap.min.js

GSAP core (v3.12.5), core-only build (no plugins — the relay centerpiece
only needs `gsap.timeline()`/`gsap.to()`, no ScrollTrigger/Draggable/etc).

Vendored locally (rather than loaded from a CDN) so the demo has zero
external network dependency — matters for the venue-network contingency
called out in `tasks.md`'s "Demo-day contingency" section and
`product.md`'s reliability concerns. This is the one and only place GSAP
is used in the frontend, per `tech.md`: "Animation: GSAP, reserved for a
live status/relay reveal on the result screen... not used decoratively."

Source: https://gsap.com (GreenSock). Distributed under GSAP's standard
"no charge" license (https://gsap.com/standard-license) — free for this
use case (non-commercial hackathon prototype, client-side animation, no
resale of the library itself). See GSAP's license terms if this project
is ever repackaged commercially.
