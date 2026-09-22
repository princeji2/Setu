'use strict';

/**
 * Interactive particle/mesh field — the auth screen's dark backdrop.
 *
 * This is the ONLY dark surface in the whole app (per design.md Phase-1
 * reset + Phase-3 scope). It ports the *concept* of
 * refrences/background.txt's kinetic-particle-fabric — a dark canvas with
 * a springy point mesh that reacts to the pointer — but is written from
 * scratch as a dependency-free vanilla-JS <canvas> module. It is NOT a
 * verbatim port of that React/TSX component: no React, no TypeScript, no
 * physics-solver relaxation passes — just a lightweight node field with
 * proximity links and a soft pointer repulsion, which reads the same at a
 * fraction of the cost and stays smooth on a laptop at demo time.
 *
 * Lifecycle (important — no leaked animation frames behind the light app
 * shell): createParticleField(container) returns a controller with
 * destroy(). The rAF loop ALSO self-terminates if its canvas leaves the
 * DOM (canvas.isConnected === false), so even though the app's router
 * replaces root.innerHTML wholesale on navigation (it never calls our
 * destroy()), the loop cannot outlive its canvas. auth.js still calls
 * destroy() on re-mount as the explicit belt-and-braces path.
 *
 * prefers-reduced-motion: honoured. When set, we paint ONE static frame
 * (dark ground + a calm dotted mesh, no pointer reactivity, no rAF loop)
 * so the screen still has the intended texture without any motion.
 *
 * No external dependency, no GSAP — GSAP is reserved for the relay reveal
 * (tech.md); a canvas particle field doesn't need it.
 */

const REDUCED_MOTION = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Palette is local to this module — this is the one dark surface, and it
// intentionally does NOT pull the light app tokens (those are for the
// shell). Kept in sync with the auth CSS backdrop colour.
const GROUND = '#1A0202';       // deep near-black wine ground (#2D0000)
const GROUND_2 = '#2B0606';     // subtle radial lift toward center
const DOT = '238, 234, 215';    // warm linen (#EEEAD7) dots
const LINK = '117, 125, 111';   // slate sage (#757D6F) links
const ACCENT = '109, 8, 8';     // crimson maroon (#6D0808) for excited nodes

function createParticleField(container) {
  const canvas = document.createElement('canvas');
  canvas.className = 'auth-particle-canvas';
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d', { alpha: false });

  let width = 0;
  let height = 0;
  let dpr = 1;
  let nodes = [];
  let rafId = 0;
  let running = true;
  let destroyed = false;

  const pointer = { x: -9999, y: -9999, active: false };

  function paintGround() {
    // Vertical-ish radial: lighter toward the upper center, deep at edges.
    const g = ctx.createRadialGradient(
      width * 0.5, height * 0.32, 0,
      width * 0.5, height * 0.5, Math.max(width, height) * 0.75
    );
    g.addColorStop(0, GROUND_2);
    g.addColorStop(1, GROUND);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }

  function buildNodes() {
    // Density scales with area but is capped so a big screen doesn't melt.
    const target = Math.min(150, Math.max(46, Math.round((width * height) / 14000)));
    nodes = [];
    for (let i = 0; i < target; i++) {
      nodes.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.25,
        vy: (Math.random() - 0.5) * 0.25,
        r: 1 + Math.random() * 1.4,
        excite: 0,
      });
    }
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    buildNodes();
    if (!running) drawStatic(); // reduced-motion: repaint the single frame on resize
  }

  const LINK_DIST = 132;
  const LINK_DIST_SQ = LINK_DIST * LINK_DIST;
  const POINTER_DIST = 150;

  function drawLinks() {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < LINK_DIST_SQ) {
          const alpha = (1 - d2 / LINK_DIST_SQ) * 0.5;
          ctx.strokeStyle = `rgba(${LINK}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
  }

  function drawNodes() {
    for (const n of nodes) {
      const excited = n.excite > 0.05;
      const rgb = excited ? ACCENT : DOT;
      const alpha = excited ? Math.min(1, 0.5 + n.excite) : 0.7;
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r + n.excite * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** One static, motionless frame for prefers-reduced-motion. */
  function drawStatic() {
    paintGround();
    drawLinks();
    drawNodes();
  }

  function step() {
    if (destroyed) return;
    // Self-terminate if the canvas has been detached by the app router
    // replacing root.innerHTML — prevents a leaked loop behind the shell.
    if (!canvas.isConnected) { destroy(); return; }

    paintGround();

    for (const n of nodes) {
      n.x += n.vx;
      n.y += n.vy;

      // Gentle wrap so the field never depletes at the edges.
      if (n.x < -20) n.x = width + 20;
      else if (n.x > width + 20) n.x = -20;
      if (n.y < -20) n.y = height + 20;
      else if (n.y > height + 20) n.y = -20;

      // Soft pointer repulsion + excitation glow.
      if (pointer.active) {
        const dx = n.x - pointer.x;
        const dy = n.y - pointer.y;
        const dist = Math.hypot(dx, dy);
        if (dist < POINTER_DIST && dist > 0.01) {
          const force = (1 - dist / POINTER_DIST) * 0.9;
          n.x += (dx / dist) * force;
          n.y += (dy / dist) * force;
          n.excite = Math.max(n.excite, 1 - dist / POINTER_DIST);
        }
      }
      n.excite *= 0.94; // decay back to calm
    }

    drawLinks();
    drawNodes();

    rafId = requestAnimationFrame(step);
  }

  function onPointerMove(e) {
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches && e.touches[0];
    const cx = touch ? touch.clientX : e.clientX;
    const cy = touch ? touch.clientY : e.clientY;
    pointer.x = cx - rect.left;
    pointer.y = cy - rect.top;
    pointer.active = true;
  }
  function onPointerLeave() {
    pointer.active = false;
    pointer.x = -9999;
    pointer.y = -9999;
  }

  const onResize = () => resize();

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    running = false;
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', onResize);
    container.removeEventListener('mousemove', onPointerMove);
    container.removeEventListener('touchmove', onPointerMove);
    container.removeEventListener('mouseleave', onPointerLeave);
    container.removeEventListener('touchend', onPointerLeave);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  // --- init ---
  resize();
  window.addEventListener('resize', onResize);

  if (REDUCED_MOTION()) {
    // No loop, no pointer reactivity — one calm static frame.
    running = false;
    drawStatic();
  } else {
    container.addEventListener('mousemove', onPointerMove);
    container.addEventListener('touchmove', onPointerMove, { passive: true });
    container.addEventListener('mouseleave', onPointerLeave);
    container.addEventListener('touchend', onPointerLeave);
    rafId = requestAnimationFrame(step);
  }

  return { destroy };
}

export { createParticleField };
