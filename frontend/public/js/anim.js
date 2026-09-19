'use strict';

/**
 * Small entrance-animation helper for the neumorphic re-skin.
 *
 * Uses window.gsap (loaded as a classic script in index.html). The GSAP
 * stagger preset here is the one verified via ui-ux-pro-max-full
 * (motion: "Stagger List" — opacity/scale/y in, back.out easing), applied
 * as a page-load reveal on card grids and list items.
 *
 * ACCESSIBILITY: prefers-reduced-motion is honoured — when the user asks
 * for reduced motion we do NOTHING (elements are already in their final,
 * visible state in the DOM), so there is no flash-of-hidden-content and no
 * motion. GSAP animating FROM a state never leaves content hidden if GSAP
 * is missing either, because we only touch elements once and always land
 * on the natural state.
 */

const prefersReducedMotion = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Staggered entrance for a set of sibling cards/rows.
 * @param {string|Element|NodeList} targets - selector or elements
 * @param {object} [opts]
 */
function revealStagger(targets, opts = {}) {
  const gsap = window.gsap;
  if (!gsap || prefersReducedMotion()) return; // final state already in DOM
  const els = typeof targets === 'string' ? document.querySelectorAll(targets) : targets;
  if (!els || (els.length === 0)) return;
  // Calm, trust-first motion (design-taste public-sector dials: low
  // MOTION_INTENSITY). Gentle rise + fade, no scale bounce, short travel.
  const list = Array.from(els);
  gsap.from(list, {
    opacity: 0,
    y: 10,
    duration: 0.4,
    stagger: { each: 0.05, from: 'start' },
    ease: 'power2.out',
    clearProps: 'transform,opacity', // hand control back to CSS after
    // If a re-render kills this tween mid-flight, GSAP skips clearProps and
    // leaves inline transform/opacity on the nodes — which is exactly the
    // "cards scattered / overlapping" distortion. Clear it ourselves on
    // interrupt so an interrupted entrance never leaves displaced boxes.
    onInterrupt() { list.forEach((el) => { if (el && el.style) { el.style.transform = ''; el.style.opacity = ''; } }); },
    ...opts,
  });
}

/**
 * A gentler single-element reveal (headers, hero, panels) — no scale
 * overshoot, just a soft rise + fade.
 */
function revealRise(targets, opts = {}) {
  const gsap = window.gsap;
  if (!gsap || prefersReducedMotion()) return;
  const els = typeof targets === 'string' ? document.querySelectorAll(targets) : targets;
  if (!els || (els.length === 0)) return;
  const list = Array.from(els);
  gsap.from(list, {
    opacity: 0,
    y: 14,
    duration: 0.45,
    stagger: 0.08,
    ease: 'power3.out',
    clearProps: 'transform,opacity',
    onInterrupt() { list.forEach((el) => { if (el && el.style) { el.style.transform = ''; el.style.opacity = ''; } }); },
    ...opts,
  });
}

/**
 * One-shot "just verified" reveal for the single card/badge whose
 * department flipped from Not linked -> Verified in the relay that just
 * completed (see just-verified.js for why the element is brand-new rather
 * than a persistent node we could transition).
 *
 * Deliberately CSS-first (no GSAP): it toggles a `.just-verified` class
 * and forces one reflow so the animation replays reliably even if the same
 * card is re-tagged on a rapid second relay. The actual motion — the badge
 * settling to green, a check-mark drawing in, and a single gentle pulse —
 * lives in app.css keyframes, which collapse to an instant, movement-free
 * state under prefers-reduced-motion. So this helper does NOTHING
 * motion-specific itself; if the element is missing it's a safe no-op.
 *
 * @param {Element|null} el  the status badge/chip element to reveal
 */
function playJustVerified(el) {
  if (!el) return;
  el.classList.remove('just-verified');
  // Force a reflow so remove + re-add restarts the CSS animation.
  void el.offsetWidth;
  el.classList.add('just-verified');
  // Clean the class up after the animation window so it never lingers to
  // replay on an unrelated layout change. Generous timeout (well past the
  // ~900ms reveal); harmless if the node is gone by then.
  window.setTimeout(() => { if (el && el.classList) el.classList.remove('just-verified'); }, 1400);
}

export { revealStagger, revealRise, prefersReducedMotion, playJustVerified };
