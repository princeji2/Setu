'use strict';

/**
 * Kinetic particle-fabric background — vanilla-JS port.
 *
 * Ported from refrences/background.txt (a React/TS "KineticFabric"
 * component) to plain canvas 2D so it runs in this build-free frontend.
 * The physics are faithful to the reference: a Verlet-integrated 3D mesh
 * cloth with structural constraints, mouse repulsion, click shockwaves,
 * and a gentle fluid idle wave, projected through a simple perspective
 * camera that tilts toward the pointer.
 *
 * Tuned for the trust-first LIGHT theme: the mesh sits as a FIXED,
 * behind-everything backdrop drawn in very low-contrast ink lines on the
 * app canvas colour, so it reads as quiet texture, not a loud hero effect.
 *
 * Accessibility: honours prefers-reduced-motion — paints ONE static
 * frame (no rAF loop, no pointer reactivity) so the texture is present
 * without any motion. Self-cleans if its canvas leaves the DOM.
 */

const REDUCED_MOTION = () =>
  window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Palette pulled from the theme tokens so it tracks the design system.
// Vintage LIGHT theme: canvas is warm parchment (#FAF9F5), mesh is drawn in slate
// sage lines (#757D6F) with crimson maroon (#6D0808) for excited nodes.
function themeColors() {
  const css = getComputedStyle(document.documentElement);
  const bg = (css.getPropertyValue('--paper').trim() || '#FAF9F5');
  return { bg, stroke: '117, 125, 111', accent: '109, 8, 8' };
}

function createFabric(canvas) {
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return { destroy() {} };

  const dims = { width: 0, height: 0 };
  let nodes = [];
  let links = [];

  const pointer = {
    x: -2000, y: -2000, prevX: -2000, prevY: -2000, vx: 0, vy: 0,
    targetAngleX: 0.15, targetAngleY: 0.0, angleX: 0.15, angleY: 0.0,
    radius: 170, isDown: false, shockwaves: [],
  };

  function buildMesh() {
    const { width, height } = dims;
    if (!width || !height) return;
    const spacing = 42;
    const cols = Math.ceil((width * 1.2) / spacing) + 1;
    const rows = Math.ceil((height * 1.2) / spacing) + 1;
    const n = [];
    const l = [];
    const grid = [];
    const startX = -(cols * spacing) / 2;
    const startY = -(rows * spacing) / 2;
    let index = 0;
    for (let j = 0; j < rows; j++) {
      grid[j] = [];
      for (let i = 0; i < cols; i++) {
        const bx = startX + i * spacing;
        const by = startY + j * spacing;
        const pinned = i === 0 || i === cols - 1 || j === 0 || j === rows - 1;
        n.push({
          curr: { x: bx, y: by, z: 0 }, prev: { x: bx, y: by, z: 0 },
          base: { x: bx, y: by, z: 0 },
          proj: { x: 0, y: 0, scale: 1, alpha: 1 }, pinned, excitation: 0,
        });
        grid[j][i] = index++;
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const idx = grid[j][i];
        if (i < cols - 1) l.push({ p1: idx, p2: grid[j][i + 1], length: spacing });
        if (j < rows - 1) l.push({ p1: idx, p2: grid[j + 1][i], length: spacing });
        if (i < cols - 1 && j < rows - 1) l.push({ p1: idx, p2: grid[j + 1][i + 1], length: Math.SQRT2 * spacing });
      }
    }
    nodes = n;
    links = l;
  }

  // Project + draw a single frame. `interactive` gates the physics/pointer.
  function drawFrame(time, colors, interactive) {
    const { width, height } = dims;
    const cosX = Math.cos(pointer.angleX);
    const sinX = Math.sin(pointer.angleX);
    const cosY = Math.cos(pointer.angleY);
    const sinY = Math.sin(pointer.angleY);

    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, width, height);

    if (interactive) {
      pointer.angleX += (pointer.targetAngleX - pointer.angleX) * 0.05;
      pointer.angleY += (pointer.targetAngleY - pointer.angleY) * 0.05;
      pointer.vx = (pointer.x - pointer.prevX) * 0.4;
      pointer.vy = (pointer.y - pointer.prevY) * 0.4;
      pointer.prevX = pointer.x;
      pointer.prevY = pointer.y;

      for (let s = pointer.shockwaves.length - 1; s >= 0; s--) {
        const sw = pointer.shockwaves[s];
        sw.radius += 12;
        sw.strength *= 0.94;
        if (sw.radius > sw.maxRadius || sw.strength < 0.01) pointer.shockwaves.splice(s, 1);
      }

      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.pinned) continue;
        const vx = (n.curr.x - n.prev.x) * 0.955;
        const vy = (n.curr.y - n.prev.y) * 0.955;
        const vz = (n.curr.z - n.prev.z) * 0.955;
        n.prev.x = n.curr.x; n.prev.y = n.curr.y; n.prev.z = n.curr.z;
        n.curr.x += vx; n.curr.y += vy; n.curr.z += vz;
        const fluidZ = Math.sin(n.base.x * 0.009 + time) * 16 + Math.cos(n.base.y * 0.011 + time * 1.2) * 12;
        n.curr.x += (n.base.x - n.curr.x) * 0.038;
        n.curr.y += (n.base.y - n.curr.y) * 0.038;
        n.curr.z += (n.base.z + fluidZ - n.curr.z) * 0.038;
        n.excitation *= 0.92;
      }
    }

    const pointerSpeed = interactive
      ? Math.min(Math.sqrt(pointer.vx * pointer.vx + pointer.vy * pointer.vy), 40) : 0;
    const fov = 620;
    const cx = width / 2;
    const cy = height / 2;

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const rx1 = n.curr.x * cosY + n.curr.z * sinY;
      const ry1 = n.curr.y;
      const rz1 = -n.curr.x * sinY + n.curr.z * cosY;
      const rx2 = rx1;
      const ry2 = ry1 * cosX - rz1 * sinX;
      const rz2 = ry1 * sinX + rz1 * cosX + 460;
      const scale = fov / Math.max(1, rz2);
      n.proj.x = cx + rx2 * scale;
      n.proj.y = cy + ry2 * scale;
      n.proj.scale = scale;
      n.proj.alpha = Math.min(1, Math.max(0.08, (scale - 0.45) * 1.4));

      if (interactive && !n.pinned) {
        const dx = n.proj.x - pointer.x;
        const dy = n.proj.y - pointer.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < pointer.radius && dist > 0) {
          const ratio = 1 - dist / pointer.radius;
          const force = ratio * (pointer.isDown ? 42 : 22) + pointerSpeed * 0.4;
          const angle = Math.atan2(dy, dx);
          n.curr.x += (Math.cos(angle) * force * 0.8) / n.proj.scale;
          n.curr.y += (Math.sin(angle) * force * 0.8) / n.proj.scale;
          n.curr.z -= (force * 2.8) / n.proj.scale;
          n.excitation = Math.max(n.excitation, ratio);
        }
        for (let s = 0; s < pointer.shockwaves.length; s++) {
          const sw = pointer.shockwaves[s];
          const swDx = n.proj.x - sw.x;
          const swDy = n.proj.y - sw.y;
          const swDist = Math.sqrt(swDx * swDx + swDy * swDy);
          const ringDelta = Math.abs(swDist - sw.radius);
          if (ringDelta < 45) {
            const impulse = (1 - ringDelta / 45) * sw.strength * 28;
            n.curr.z += impulse / n.proj.scale;
            n.excitation = Math.max(n.excitation, 0.8);
          }
        }
      }
    }

    if (interactive) {
      for (let p = 0; p < 3; p++) {
        for (let i = 0; i < links.length; i++) {
          const link = links[i];
          const na = nodes[link.p1];
          const nb = nodes[link.p2];
          const dx = nb.curr.x - na.curr.x;
          const dy = nb.curr.y - na.curr.y;
          const dz = nb.curr.z - na.curr.z;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const diff = (dist - link.length) / (dist || 1);
          if (!na.pinned) { na.curr.x += dx * 0.5 * diff; na.curr.y += dy * 0.5 * diff; na.curr.z += dz * 0.5 * diff; }
          if (!nb.pinned) { nb.curr.x -= dx * 0.5 * diff; nb.curr.y -= dy * 0.5 * diff; nb.curr.z -= dz * 0.5 * diff; }
        }
      }
    }

    // Lines — kept very faint so this is texture, not a loud hero effect.
    const BASE = 0.09;   // resting line alpha (subtle warm mesh on cream)
    for (let i = 0; i < links.length; i++) {
      const link = links[i];
      const na = nodes[link.p1];
      const nb = nodes[link.p2];
      const avgScale = (na.proj.scale + nb.proj.scale) / 2;
      const avgAlpha = (na.proj.alpha + nb.proj.alpha) / 2;
      const excited = na.excitation > 0.1 || nb.excitation > 0.1;
      if (excited) {
        const glow = Math.max(na.excitation, nb.excitation);
        ctx.strokeStyle = `rgba(${colors.accent}, ${Math.min(0.6, 0.15 + glow * 0.5)})`;
        ctx.lineWidth = (0.7 + glow * 1.0) * avgScale;
      } else {
        ctx.strokeStyle = `rgba(${colors.stroke}, ${BASE * avgAlpha})`;
        ctx.lineWidth = 0.7 * avgScale;
      }
      ctx.beginPath();
      ctx.moveTo(na.proj.x, na.proj.y);
      ctx.lineTo(nb.proj.x, nb.proj.y);
      ctx.stroke();
    }

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (n.excitation > 0.25) {
        const r = Math.min(2.4, 1.0 + n.excitation * 1.8) * n.proj.scale;
        ctx.fillStyle = `rgba(${colors.accent}, ${Math.min(0.7, n.excitation)})`;
        ctx.beginPath();
        ctx.arc(n.proj.x, n.proj.y, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  // ---- sizing ----
  const ro = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const rect = entry.contentRect;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      dims.width = rect.width;
      dims.height = rect.height;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
      buildMesh();
      if (REDUCED_MOTION()) drawFrame(0, themeColors(), false); // repaint static on resize
    }
  });
  // Observe the parent so the canvas fills the viewport region it's placed in.
  ro.observe(canvas.parentElement || document.body);

  // ---- reduced motion: one static frame, no loop, no listeners ----
  if (REDUCED_MOTION()) {
    // buildMesh runs on first resize; ensure a paint after layout settles.
    requestAnimationFrame(() => { buildMesh(); drawFrame(0, themeColors(), false); });
    return { destroy() { ro.disconnect(); } };
  }

  // ---- pointer handlers (window-level; the canvas is pointer-events:none
  //      so it never blocks the UI — we read global mouse position) ----
  function toLocal(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  const onMove = (e) => {
    const { x, y } = toLocal(e);
    pointer.x = x; pointer.y = y;
    const normX = (x / dims.width - 0.5) * 2;
    const normY = (y / dims.height - 0.5) * 2;
    pointer.targetAngleY = normX * 0.30;
    pointer.targetAngleX = -normY * 0.22 + 0.15;
  };
  const onDown = (e) => {
    const { x, y } = toLocal(e);
    pointer.isDown = true;
    pointer.shockwaves.push({ x, y, radius: 10, maxRadius: 360, strength: 1.0 });
  };
  const onUp = () => { pointer.isDown = false; };
  window.addEventListener('mousemove', onMove, { passive: true });
  window.addEventListener('mousedown', onDown, { passive: true });
  window.addEventListener('mouseup', onUp, { passive: true });

  // ---- animation loop ----
  let animId = 0;
  let time = 0;
  let colors = themeColors();
  let colorTick = 0;
  const loop = () => {
    // If the canvas was removed from the DOM, self-terminate.
    if (!canvas.isConnected) { destroy(); return; }
    time += 0.016;
    if (++colorTick % 120 === 0) colors = themeColors(); // pick up theme changes cheaply
    drawFrame(time, colors, true);
    animId = requestAnimationFrame(loop);
  };
  animId = requestAnimationFrame(loop);

  function destroy() {
    cancelAnimationFrame(animId);
    ro.disconnect();
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mousedown', onDown);
    window.removeEventListener('mouseup', onUp);
  }

  return { destroy };
}

/**
 * Mount the fabric as a fixed, behind-everything background layer.
 * Idempotent — a second call reuses the existing layer.
 */
let mounted = null;
function mountFabricBackground() {
  if (mounted) return mounted;
  const host = document.createElement('div');
  host.id = 'fabricBg';
  const canvas = document.createElement('canvas');
  host.appendChild(canvas);
  document.body.insertBefore(host, document.body.firstChild);
  const field = createFabric(canvas);
  mounted = { host, field, destroy() { field.destroy(); host.remove(); mounted = null; } };
  return mounted;
}

export { mountFabricBackground };
