'use strict';

/**
 * Pre-auth landing page (Phase 4). The entry screen for unauthenticated
 * visitors: fixed blurred nav, hero with dual CTA, a feature grid of the
 * app's REAL capabilities, and a minimal footer. Light theme per
 * dashboard.png; solid near-black CTAs (no gradient buttons — gradient
 * TEXT on the headline is allowed per lock screen 1.txt / hero1.txt).
 *
 * References: hero1.txt (hero: headline/subtext/dual CTA/preview with
 * fade + staggered entrance), lock screen 1.txt (fixed blurred nav,
 * centered gradient headline, Get started CTA, dashboard-preview image),
 * feature1.txt (eyebrow + heading + card grid, per-card icon/title/desc,
 * staggered scroll reveal). scrolanimation.png for motion feel.
 *
 * CONTENT ACCURACY — every claim below is grounded in real project facts:
 *   - The three departments are the gateway's real integrations, confirmed
 *     against gateway application-service.js KNOWN_TYPES + relay-service.js
 *     TYPE_TO_DEPARTMENT: pan_verification -> digital_tax_records,
 *     identity_verification -> national_identity_registry,
 *     driving_licence_registration -> driving_licence_jan_aadhaar.
 *   - Features describe capabilities actually built this session (consent
 *     gating, live HTTP relay, verify-once-reuse, call-history/audit
 *     visibility, honest failure). NO stats, testimonials, or user counts
 *     are used — none exist to ground them.
 *
 * Motion: GSAP (the locked library, same as the relay reveal), staggered
 * entrance + scroll reveal. Fully honours prefers-reduced-motion (no
 * tweens; everything is visible in its final state).
 *
 * Routing: mountLanding(root, { onLogin, onRegister }) is a pure-addition
 * view. It does NOT know about session state — app.js decides when to show
 * it (unauthenticated only). CTAs call the callbacks app.js passes in,
 * which route into the Phase-3 auth screen.
 */

import { brandMarkSvg, netmapSvg } from '../netmap.js';
import { departmentArtHtml } from '../util.js';

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The three REAL departments (see file header for source). Copy is
   descriptive of what each integration verifies — nothing invented. */
const DEPARTMENTS = [
  {
    department: 'digital_tax_records',
    label: 'Digital Tax Records',
    kind: 'PAN verification',
    blurb: 'Confirm a PAN reference against tax records — fetched live, never re-uploaded.',
  },
  {
    department: 'national_identity_registry',
    label: 'National Identity Registry',
    kind: 'Identity verification',
    blurb: 'Match identity details against the registry through a single consented request.',
  },
  {
    department: 'driving_licence_jan_aadhaar',
    label: 'Driving Licence & Jan Aadhaar Portal',
    kind: 'Licence registration',
    blurb: 'Verify a driving licence and Jan Aadhaar registration together in one call.',
  },
];

/* Features grounded in what the app actually does (built this session). */
const FEATURES = [
  {
    icon: iconKey(),
    title: 'One login for every department',
    desc: 'A single Setu ID reaches all three connected departments — no separate portal logins to juggle.',
  },
  {
    icon: iconShield(),
    title: 'Consent before every share',
    desc: 'The gateway records your approval and refuses to call a department without a matching consent grant — a real backend check, not just a dialog.',
  },
  {
    icon: iconRelay(),
    title: 'Verified live over the wire',
    desc: 'Each request is a real HTTP call to the department, relayed by the gateway with its own key — the result you see is the department’s actual response.',
  },
  {
    icon: iconReuse(),
    title: 'Verify once, reuse everywhere',
    desc: 'Once a department reference is verified, later applications reuse it automatically — no re-entering the same details.',
  },
  {
    icon: iconLog(),
    title: 'Every call is on the record',
    desc: 'Each department call — success or failure — is written to an audit trail you can inspect per application, endpoint and outcome.',
  },
  {
    icon: iconHonest(),
    title: 'Honest when something fails',
    desc: 'If a department is unreachable or rejects a request, you get a clear, calm failure state — never a silently faked result.',
  },
];

function landingHtml() {
  return `
  <div class="landing" id="landing">
    <div class="landing-bg" id="landingBg"></div>

    <header class="lp-nav" id="lpNav">
      <div class="lp-nav-inner">
        <div class="brand">
          <div class="mark">${brandMarkSvg()}</div>
          <div class="word">Setu<span>.</span></div>
        </div>
        <div class="lp-nav-actions">
          <button class="btn btn-ghost btn-sm" data-lp="login">Log in</button>
          <button class="btn btn-primary btn-sm" data-lp="register">Create account</button>
        </div>
      </div>
    </header>

    <section class="lp-hero">
      <div class="lp-hero-inner">
        <div class="lp-hero-copy">
          <div class="lp-kicker" data-reveal>Smart India Hackathon &middot; SIH26129</div>
          <h1 class="lp-headline" data-reveal>One login, three departments,<br><span class="lp-grad">verified through a gateway.</span></h1>
          <p class="lp-sub" data-reveal>Setu links Digital Tax Records, the National Identity Registry and the Driving Licence &amp; Jan Aadhaar Portal behind a single citizen login — so a document verified once doesn’t need to be uploaded again.</p>
          <div class="lp-cta" data-reveal>
            <button class="btn btn-primary" data-lp="register">Get started</button>
            <button class="btn btn-ghost" data-lp="how">See how it works</button>
          </div>
          <div class="lp-trust" data-reveal>
            <span class="lp-trust-label">Connected departments</span>
            <div class="lp-trust-row">
              ${DEPARTMENTS.map((d) => `<span class="lp-trust-item">${d.label}</span>`).join('')}
            </div>
          </div>
        </div>
        <div class="lp-hero-visual" data-reveal>
          <div class="lp-preview-card">
            <div class="lp-preview-net">${netmapSvg('paper')}</div>
            <div class="lp-preview-arts">
              ${DEPARTMENTS.map((d) => `
                <div class="lp-preview-art ${d.department === 'digital_tax_records' ? 'theme-tax' : d.department === 'national_identity_registry' ? 'theme-identity' : 'theme-licence'}">
                  ${departmentArtHtml(d.department, 'sm')}
                  <span>${d.kind}</span>
                </div>`).join('')}
            </div>
            <div class="lp-preview-caption">Your Setu ID at the centre; each department a consented, logged request away.</div>
          </div>
        </div>
      </div>
    </section>

    <section class="lp-features" id="lpHow">
      <div class="lp-features-inner">
        <div class="lp-eyebrow" data-reveal>What Setu does</div>
        <h2 class="lp-h2" data-reveal>Interoperability, with consent and a paper trail.</h2>
        <div class="lp-feature-grid">
          ${FEATURES.map((f) => `
            <div class="lp-feature" data-reveal>
              <div class="lp-feature-icon">${f.icon}</div>
              <h3>${f.title}</h3>
              <p>${f.desc}</p>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="lp-depts">
      <div class="lp-depts-inner">
        <div class="lp-eyebrow" data-reveal>Connected departments</div>
        <h2 class="lp-h2" data-reveal>Three real systems, three different shapes.</h2>
        <div class="lp-dept-grid">
          ${DEPARTMENTS.map((d) => `
            <div class="lp-dept" data-reveal>
              <div class="lp-dept-head">
                <div class="lp-dept-titles">
                  <div class="lp-dept-kind">${d.kind}</div>
                  <h3>${d.label}</h3>
                </div>
                ${departmentArtHtml(d.department, 'lg')}
              </div>
              <p>${d.blurb}</p>
            </div>`).join('')}
        </div>
      </div>
    </section>

    <section class="lp-final">
      <div class="lp-final-inner" data-reveal>
        <h2 class="lp-h2">Ready to verify once and reuse everywhere?</h2>
        <div class="lp-cta">
          <button class="btn btn-primary" data-lp="register">Create your Setu ID</button>
          <button class="btn btn-ghost" data-lp="login">Log in</button>
        </div>
      </div>
    </section>

    <footer class="lp-footer">
      <div class="lp-footer-inner">
        <div class="brand">
          <div class="mark">${brandMarkSvg()}</div>
          <div class="word">Setu<span>.</span></div>
        </div>
        <div class="lp-footer-note">A consent-based interoperability gateway. Built for SIH26129 — a prototype, not a production government system.</div>
      </div>
    </footer>
  </div>`;
}

/* ---- inline icons (stroke, currentColor) ---- */
function svg(inner) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
function iconKey() { return svg('<circle cx="8" cy="15" r="4"/><path d="m10.8 12.2 8.2-8.2M17 6l2 2M15 8l1.5 1.5"/>'); }
function iconShield() { return svg('<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="m9 12 2 2 4-4"/>'); }
function iconRelay() { return svg('<circle cx="5" cy="12" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="19" cy="18" r="2"/><path d="M7 12h4M13 12l4-5M13 12l4 5"/>'); }
function iconReuse() { return svg('<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8M20 4v4h-4"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 16M4 20v-4h4"/>'); }
function iconLog() { return svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'); }
function iconHonest() { return svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>'); }

/**
 * @param {HTMLElement} root
 * @param {{ onLogin: () => void, onRegister: () => void }} handlers
 */
function mountLanding(root, { onLogin, onRegister }) {
  root.innerHTML = landingHtml();

  // Nav gets a solid/blurred treatment once the hero scrolls under it.
  const nav = document.getElementById('lpNav');
  const landing = document.getElementById('landing');
  const onScroll = () => {
    if (!nav.isConnected) { landing.removeEventListener('scroll', onScroll); return; }
    nav.classList.toggle('scrolled', landing.scrollTop > 24);
  };
  landing.addEventListener('scroll', onScroll, { passive: true });

  // CTA wiring — every button routes somewhere real.
  root.querySelectorAll('[data-lp]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.lp;
      if (action === 'login') onLogin();
      else if (action === 'register') onRegister();
      else if (action === 'how') {
        document.getElementById('lpHow')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
      }
    });
  });

  animateEntrance();
}

/**
 * Entrance + scroll reveals via GSAP (locked library). Hero items stagger
 * in on load; later sections reveal as they enter the viewport. If GSAP
 * isn't present or reduced-motion is set, everything is simply left in its
 * final visible state — no motion is load-bearing.
 */
function animateEntrance() {
  const reveals = Array.from(document.querySelectorAll('[data-reveal]'));
  const gsapReady = typeof window.gsap !== 'undefined';

  if (!gsapReady || prefersReducedMotion()) {
    reveals.forEach((el) => { el.style.opacity = '1'; el.style.transform = 'none'; });
    return;
  }

  const g = window.gsap;
  const landing = document.getElementById('landing');

  // Hero cluster (first 5 reveals) staggers in immediately.
  const hero = reveals.slice(0, 5);
  g.set(reveals, { opacity: 0, y: 18 });
  g.to(hero, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', stagger: 0.08, delay: 0.05 });

  // The rest reveal when scrolled into view, using a plain
  // IntersectionObserver (no ScrollTrigger plugin needed — that isn't
  // vendored, and this keeps the dependency surface to core GSAP only).
  const rest = reveals.slice(5);
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        g.to(entry.target, { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out' });
        io.unobserve(entry.target);
      }
    });
  }, { root: landing, threshold: 0.15 });
  rest.forEach((el) => io.observe(el));
}

export { mountLanding };
