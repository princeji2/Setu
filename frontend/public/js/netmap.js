'use strict';

/**
 * The hub-and-spoke network diagram: citizen at the center, the three real
 * departments as spokes. This is the one visual motif carried across
 * screens (login backdrop, dashboard hero) per design.md — it's the visual
 * thesis of the whole project, not decoration invented per-screen.
 *
 * `variant` toggles a light-on-indigo rendering (login backdrop) vs. the
 * paper-card rendering (dashboard hero) used in the original reference.
 */

function netmapSvg(variant = 'paper') {
  const isDark = variant === 'dark';
  const centerFill = isDark ? '#FAF6EE' : '#1E3350';
  const centerText = isDark ? '#1E3350' : '#fff';
  const nodeFill = isDark ? 'rgba(255,255,255,0.08)' : '#FFFFFE';
  const nodeStroke = isDark ? 'rgba(255,255,255,0.35)' : '#CFC3A8';
  const lineStroke = isDark ? 'rgba(255,255,255,0.25)' : '#CFC3A8';
  const labelFill = isDark ? '#FAF6EE' : '#211D18';
  const subLabelFill = isDark ? 'rgba(250,246,238,0.6)' : '#6B6357';

  return `
  <svg viewBox="0 0 420 300" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Setu connects the citizen to three government departments">
    <g stroke="${lineStroke}" stroke-width="1.4">
      <line x1="210" y1="150" x2="210" y2="48"/>
      <line x1="210" y1="150" x2="82" y2="228"/>
      <line x1="210" y1="150" x2="338" y2="228"/>
    </g>
    <circle cx="210" cy="150" r="34" fill="${centerFill}"/>
    <text x="210" y="146" text-anchor="middle" fill="${centerText}" font-family="Source Serif 4, serif" font-size="12" font-weight="600">You</text>
    <text x="210" y="160" text-anchor="middle" fill="${centerText}" font-family="Source Serif 4, serif" font-size="9">Setu ID</text>

    <circle cx="210" cy="48" r="30" fill="${nodeFill}" stroke="#B85C2B" stroke-width="1.6"/>
    <text x="210" y="44" text-anchor="middle" fill="${labelFill}" font-size="8.5" font-weight="700" font-family="Inter, sans-serif">Digital Tax</text>
    <text x="210" y="55" text-anchor="middle" fill="${subLabelFill}" font-size="7.5" font-family="Inter, sans-serif">Records &middot; PAN</text>

    <circle cx="82" cy="228" r="30" fill="${nodeFill}" stroke="#3E7A5C" stroke-width="1.6"/>
    <text x="82" y="221" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">National</text>
    <text x="82" y="232" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">Identity</text>
    <text x="82" y="243" text-anchor="middle" fill="${subLabelFill}" font-size="7.5" font-family="Inter, sans-serif">Registry</text>

    <circle cx="338" cy="228" r="30" fill="${nodeFill}" stroke="#CFC3A8" stroke-width="1.6"/>
    <text x="338" y="221" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">Driving Licence</text>
    <text x="338" y="232" text-anchor="middle" fill="${labelFill}" font-size="8" font-weight="700" font-family="Inter, sans-serif">&amp; Jan Aadhaar</text>
    <text x="338" y="243" text-anchor="middle" fill="${subLabelFill}" font-size="7.5" font-family="Inter, sans-serif">Portal</text>
  </svg>`;
}

function brandMarkSvg() {
  return `
  <svg viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="17" cy="17" r="16" stroke="#1E3350" stroke-width="1.4"/>
    <circle cx="17" cy="9" r="2.6" fill="#B85C2B"/>
    <circle cx="9" cy="22" r="2.6" fill="#1E3350"/>
    <circle cx="25" cy="22" r="2.6" fill="#1E3350"/>
    <path d="M17 11.4V17M17 17L10.5 20.3M17 17L23.5 20.3" stroke="#1E3350" stroke-width="1.3"/>
  </svg>`;
}

export { netmapSvg, brandMarkSvg };
