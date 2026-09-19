'use strict';

/**
 * The hub-and-spoke network diagram: citizen at the center, the three real
 * departments as spokes. This is the one visual motif carried across
 * screens (dashboard hero, landing hero preview, brand mark in the
 * topbar/nav/footer) per design.md — the visual thesis of the project.
 *
 * COLOR SOURCING (Phase 5 recolor): this module returns SVG *strings*, so
 * it can't use var() directly inside the markup. Instead it resolves the
 * relevant design tokens from :root at call time via getComputedStyle,
 * with hardcoded fallbacks that match the current token values. This keeps
 * tokens.css the single source of truth (change a token, the diagram
 * follows) while degrading gracefully if called before the stylesheet has
 * applied (SSR-style / very early boot) — in which case the fallbacks,
 * which equal the current tokens, are used. The old hardcoded indigo and
 * terracotta hexes are gone; colors now track the light system's
 * near-black primary and blue accent tokens.
 */

/** Read a CSS custom property off :root, trimming, with a fallback. */
function token(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

/** Resolve the palette the diagram needs from tokens (fallbacks = current token values). */
function palette() {
  return {
    primary: token('--primary', '#111317'),   // near-black (center hub)
    accent: token('--accent', '#2E6BFF'),      // blue (accent node stroke + link)
    card: token('--card', '#FFFFFF'),
    line: token('--line-strong', '#DDE1E6'),
    ink: token('--ink', '#101317'),
    inkSoft: token('--ink-soft', '#5A6069'),
    success: token('--success', '#1F9254'),    // verified/identity node stroke
    onColor: token('--on-color', '#FFFFFF'),
  };
}

function netmapSvg(variant = 'paper') {
  const p = palette();
  const isDark = variant === 'dark';

  // On the dark variant (kept for completeness though auth now uses the
  // particle field), invert surfaces to read on a dark ground; otherwise
  // use the light-system tokens.
  const centerFill = isDark ? p.onColor : p.primary;
  const centerText = isDark ? p.primary : p.onColor;
  const nodeFill = isDark ? 'rgba(255,255,255,0.08)' : p.card;
  const nodeStroke = isDark ? 'rgba(255,255,255,0.35)' : p.line;
  const lineStroke = isDark ? 'rgba(255,255,255,0.25)' : p.line;
  const labelFill = isDark ? p.onColor : p.ink;
  const subLabelFill = isDark ? 'rgba(255,255,255,0.6)' : p.inkSoft;

  return `
  <svg viewBox="0 0 420 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Setu connects the citizen to three government departments">
    <g stroke="${lineStroke}" stroke-width="1.4">
      <line x1="210" y1="150" x2="210" y2="48"/>
      <line x1="210" y1="150" x2="82" y2="228"/>
      <line x1="210" y1="150" x2="338" y2="228"/>
    </g>
    <circle cx="210" cy="150" r="34" fill="${centerFill}"/>
    <text x="210" y="146" text-anchor="middle" fill="${centerText}" font-family="Inter, sans-serif" font-size="12" font-weight="600">You</text>
    <text x="210" y="160" text-anchor="middle" fill="${centerText}" font-family="Inter, sans-serif" font-size="9">Setu ID</text>

    <circle cx="210" cy="48" r="30" fill="${nodeFill}" stroke="${p.accent}" stroke-width="1.6"/>
    <text x="210" y="44" text-anchor="middle" fill="${labelFill}" font-size="8.5" font-weight="700" font-family="Inter, sans-serif">Digital Tax</text>
    <text x="210" y="55" text-anchor="middle" fill="${subLabelFill}" font-size="7.5" font-family="Inter, sans-serif">Records &middot; PAN</text>

    <circle cx="82" cy="228" r="30" fill="${nodeFill}" stroke="${p.success}" stroke-width="1.6"/>
    <text x="82" y="221" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">National</text>
    <text x="82" y="232" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">Identity</text>
    <text x="82" y="243" text-anchor="middle" fill="${subLabelFill}" font-size="7.5" font-family="Inter, sans-serif">Registry</text>

    <circle cx="338" cy="228" r="30" fill="${nodeFill}" stroke="${p.line}" stroke-width="1.6"/>
    <text x="338" y="221" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">Driving Licence</text>
    <text x="338" y="232" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">&amp; Jan Aadhaar</text>
    <text x="338" y="243" text-anchor="middle" fill="${subLabelFill}" font-size="7.5" font-family="Inter, sans-serif">Portal</text>
  </svg>`;
}

function brandMarkSvg() {
  const p = palette();
  return `
  <svg viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="17" cy="17" r="16" stroke="${p.primary}" stroke-width="1.4"/>
    <circle cx="17" cy="9" r="2.6" fill="${p.accent}"/>
    <circle cx="9" cy="22" r="2.6" fill="${p.primary}"/>
    <circle cx="25" cy="22" r="2.6" fill="${p.primary}"/>
    <path d="M17 11.4V17M17 17L10.5 20.3M17 17L23.5 20.3" stroke="${p.primary}" stroke-width="1.3"/>
  </svg>`;
}

export { netmapSvg, brandMarkSvg };
