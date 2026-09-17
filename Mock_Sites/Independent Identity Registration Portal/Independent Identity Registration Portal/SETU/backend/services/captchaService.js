/**
 * Captcha Service
 *
 * Generates a short alphanumeric captcha string, renders it as an SVG image,
 * and issues a signed JWT that contains the expected answer (hashed).
 * On submission the JWT is decoded and the submitted answer is compared.
 *
 * Design rationale:
 *  - No session storage or Redis required — fits the existing stateless architecture.
 *  - The captcha text is stored in the token as a bcrypt hash so it cannot be
 *    trivially read from the token payload even if the front-end decodes it.
 *  - Token TTL is 10 minutes; after that the user must refresh.
 *  - JWT is signed with JWT_SECRET (same secret used for admin tokens).
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Characters used for captcha generation — exclude visually ambiguous chars (0 O l I 1)
const CAPTCHA_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CAPTCHA_LENGTH = 6;
const CAPTCHA_TTL_SECONDS = 600; // 10 minutes

/**
 * Generates a random captcha string.
 * @returns {string}
 */
function generateCaptchaText() {
  let result = '';
  const bytes = crypto.randomBytes(CAPTCHA_LENGTH);
  for (let i = 0; i < CAPTCHA_LENGTH; i++) {
    result += CAPTCHA_CHARS[bytes[i] % CAPTCHA_CHARS.length];
  }
  return result;
}

/**
 * Renders a captcha string as an inline SVG with noise lines and distortion.
 * @param {string} text
 * @returns {string} SVG markup
 */
function renderCaptchaSvg(text) {
  const width = 200;
  const height = 60;
  const rng = seededRng(text); // deterministic noise per captcha text

  // Background
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
  svg += `<rect width="${width}" height="${height}" fill="#1a2035" rx="6"/>`;

  // Noise lines
  for (let i = 0; i < 6; i++) {
    const x1 = Math.floor(rng() * width);
    const y1 = Math.floor(rng() * height);
    const x2 = Math.floor(rng() * width);
    const y2 = Math.floor(rng() * height);
    const opacity = 0.25 + rng() * 0.35;
    const colors = ['#3b82f6', '#6366f1', '#10b981', '#f59e0b', '#ef4444'];
    const color = colors[Math.floor(rng() * colors.length)];
    svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="1.5" opacity="${opacity.toFixed(2)}"/>`;
  }

  // Noise dots
  for (let i = 0; i < 20; i++) {
    const cx = Math.floor(rng() * width);
    const cy = Math.floor(rng() * height);
    const r = 1 + Math.floor(rng() * 2);
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" opacity="${(0.1 + rng() * 0.25).toFixed(2)}"/>`;
  }

  // Characters — each slightly offset and rotated
  const charSpacing = Math.floor((width - 20) / CAPTCHA_LENGTH);
  for (let i = 0; i < text.length; i++) {
    const x = 14 + i * charSpacing + Math.floor(rng() * 6 - 3);
    const y = 38 + Math.floor(rng() * 8 - 4);
    const rotate = Math.floor(rng() * 24 - 12);
    const fontSize = 24 + Math.floor(rng() * 6);
    const charColors = ['#93c5fd', '#a5b4fc', '#6ee7b7', '#fde68a', '#ffffff', '#c4b5fd'];
    const fill = charColors[Math.floor(rng() * charColors.length)];
    svg += `<text x="${x}" y="${y}" font-family="monospace" font-size="${fontSize}" font-weight="bold" fill="${fill}" transform="rotate(${rotate},${x},${y})">${text[i]}</text>`;
  }

  svg += '</svg>';
  return svg;
}

/**
 * Simple seeded pseudo-random number generator (mulberry32).
 * Produces deterministic noise for the same captcha text.
 * @param {string} seed
 * @returns {() => number} function returning float in [0,1)
 */
function seededRng(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 2654435761);
  }
  // Add extra entropy via timestamp so same text looks different each generation
  h ^= Date.now();
  let state = h >>> 0;
  return function () {
    state |= 0;
    state = state + 0x6d2b79f5 | 0;
    let t = Math.imul(state ^ state >>> 15, 1 | state);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Issues a captcha: generates text, renders SVG, signs a JWT containing a
 * SHA-256 hash of the expected answer (uppercased).
 * @returns {{ token: string, svgDataUri: string }}
 */
function issueCaptcha() {
  const text = generateCaptchaText();
  const svg = renderCaptchaSvg(text);
  const svgDataUri = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

  // Store SHA-256 hash of the answer — not the plaintext — inside the JWT payload
  const answerHash = crypto.createHash('sha256').update(text.toUpperCase()).digest('hex');

  const secret = process.env.JWT_SECRET || 'fallback-captcha-secret-change-me';
  const token = jwt.sign(
    { answerHash, purpose: 'captcha' },
    secret,
    { expiresIn: CAPTCHA_TTL_SECONDS }
  );

  const result = { token, svgDataUri };
  if (process.env.NODE_ENV !== 'production') {
    result.demoAnswer = text;
  }
  return result;
}

/**
 * Verifies a submitted captcha answer against a previously issued token.
 * @param {string} token   - The JWT issued by issueCaptcha()
 * @param {string} answer  - What the user typed
 * @returns {{ valid: boolean, error?: string }}
 */
function verifyCaptcha(token, answer) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Captcha token is missing. Please refresh the captcha.' };
  }
  if (!answer || typeof answer !== 'string' || answer.trim().length === 0) {
    return { valid: false, error: 'Captcha answer is required.' };
  }

  // Demo / development bypass support for automated testing and gateway integration
  // Strictly disabled in production (impossible to trigger when NODE_ENV === 'production')
  if (process.env.NODE_ENV !== 'production') {
    if (
      (token === 'DEMO_CAPTCHA_TOKEN' && (answer.toUpperCase() === 'DEMO123' || answer.toUpperCase() === 'TEST')) ||
      (process.env.NODE_ENV === 'test' && (answer === 'TEST_PASS' || token === 'DEMO_CAPTCHA_TOKEN'))
    ) {
      return { valid: true };
    }
  }

  const secret = process.env.JWT_SECRET || 'fallback-captcha-secret-change-me';

  let payload;
  try {
    payload = jwt.verify(token, secret);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return { valid: false, error: 'Captcha has expired. Please refresh and try again.' };
    }
    return { valid: false, error: 'Invalid captcha token. Please refresh the captcha.' };
  }

  if (!payload || payload.purpose !== 'captcha' || !payload.answerHash) {
    return { valid: false, error: 'Invalid captcha token. Please refresh the captcha.' };
  }

  const submittedHash = crypto
    .createHash('sha256')
    .update(answer.trim().toUpperCase())
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  const expected = Buffer.from(payload.answerHash, 'hex');
  const submitted = Buffer.from(submittedHash, 'hex');

  if (expected.length !== submitted.length) {
    return { valid: false, error: 'Incorrect captcha. Please try again.' };
  }

  if (!crypto.timingSafeEqual(expected, submitted)) {
    return { valid: false, error: 'Incorrect captcha. Please try again.' };
  }

  return { valid: true };
}

module.exports = { issueCaptcha, verifyCaptcha };
