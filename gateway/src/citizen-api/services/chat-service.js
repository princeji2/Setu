'use strict';

/**
 * Chat service (Layer 1) — the server-side proxy behind the frontend's
 * "Ask about Setu" widget.
 *
 * Why this lives in the gateway and not the browser:
 *   The Gemini API key must never ship in the client bundle (it would be
 *   publicly readable by anyone who opens devtools). So the widget calls
 *   the gateway's own POST /api/v1/chat, and THIS service is the only code
 *   that ever holds the key and talks to Gemini.
 *
 * It is deliberately grounded: every request carries a concise, factual
 * system instruction describing what Setu actually is (derived from
 * product.md / tech.md / appflow.md), so Gemini answers about THIS project
 * instead of hallucinating a generic "government portal".
 *
 * Honest failure: if the key is missing, or Gemini is down / rate-limited /
 * times out, this throws a typed ChatError. The controller maps it to a
 * friendly message and the widget falls back gracefully — it never fakes a
 * confident answer.
 */

const config = require('../../config/env');

/** Typed error so the controller can pick an HTTP status + safe message. */
class ChatError extends Error {
  constructor(code, message, status) {
    super(message);
    this.name = 'ChatError';
    this.code = code; // UNAVAILABLE | VALIDATION | RATE_LIMITED | UPSTREAM | TIMEOUT
    this.status = status;
  }
}

/**
 * The single source of truth for how Gemini describes Setu. Kept tight and
 * factual — this is the guardrail against hallucination. Mirrors the
 * grounded canned answers in the frontend widget so both channels agree.
 */
const SETU_SYSTEM_PROMPT = `You are "Setu Assistant", a friendly guide embedded in the Setu web app. You answer questions from visitors and demo audiences about what Setu is and how it works. Keep answers short, warm, and conversational (2-4 sentences, plain language — not a technical dump). If a question is unrelated to Setu, gently steer back to what Setu does.

GROUNDED FACTS ABOUT SETU (do not contradict these; do not invent features beyond them):
- Setu is a consent-based interoperability gateway for government services. Today a citizen who needs data from two departments has to log into each portal separately, download a document from one, and re-upload it to another. Setu replaces that: one login, and the gateway fetches and verifies the data across departments on the citizen's behalf.
- It connects three real, independent department services with different tech stacks and data shapes: Digital Tax Records (PAN/tax references), the National Identity Registry (identity references), and the Driving Licence & Jan Aadhaar Portal (registration references).
- How a citizen uses it: (1) create one Setu account and log in; (2) start an application for a service; (3) approve a consent screen showing exactly which fields will be shared and from which department; (4) the gateway makes a real live HTTP call to that department, verifies the data, and shows the result; every step is tracked.
- Consent-based access: before the gateway contacts any department it checks that the citizen granted consent for that specific data share. It's a real backend authorization check, not just a pop-up — no consent record, no department call.
- Reuse across departments: once a reference is verified with a department, a future application needing that same department's data skips the re-entry. It still asks for fresh consent and still fetches live data — it just doesn't make the citizen type the reference again.
- Auditing: every gateway-to-department call is logged (success AND failure) with what was asked and what came back, so anyone can verify the gateway really called those services. If a department is down or rejects a request, Setu shows an honest error and records the failure — it never substitutes fake data.
- Security (prototype-grade, honest about it): citizen login uses a self-issued JWT with bcrypt-hashed passwords; the gateway authenticates to each department with a separate per-department secret key that the citizen never sees. Setu stores only references and short masked summaries — never a department's raw source-of-truth data (no PAN, Aadhaar, or licence numbers are copied into Setu's database).
- Setu is a hackathon prototype (SIH26129), built to prove the architecture — gateway + schema translation + consent + audit — not to be a production system.`;

/**
 * Build the Gemini REST request body. History is a short list of
 * { role: 'user'|'model', text } turns kept in the client's memory and
 * echoed back so the model has conversational context. We cap it defensively.
 */
function buildRequestBody(message, history) {
  const contents = [];
  const trimmed = Array.isArray(history) ? history.slice(-8) : [];
  for (const turn of trimmed) {
    if (!turn || typeof turn.text !== 'string') continue;
    const role = turn.role === 'model' ? 'model' : 'user';
    contents.push({ role, parts: [{ text: turn.text.slice(0, 2000) }] });
  }
  contents.push({ role: 'user', parts: [{ text: message }] });

  return {
    systemInstruction: { parts: [{ text: SETU_SYSTEM_PROMPT }] },
    contents,
    generationConfig: {
      temperature: 0.4,
      // Generous ceiling: the current flash tier is a "thinking" model that
      // spends part of the output budget on internal reasoning, so a low cap
      // can truncate the visible answer. We keep answers short via the system
      // prompt instead, and disable thinking to spend the budget on the reply.
      maxOutputTokens: 800,
      thinkingConfig: { thinkingBudget: 0 },
    },
  };
}

function createChatService({ fetchImpl = fetch, geminiConfig = config.gemini } = {}) {
  const { apiKey, model, timeoutMs } = geminiConfig;

  async function ask({ message, history } = {}) {
    if (typeof message !== 'string' || !message.trim()) {
      throw new ChatError('VALIDATION', 'A non-empty message is required.', 400);
    }
    if (message.length > 1000) {
      throw new ChatError('VALIDATION', 'Message is too long (max 1000 characters).', 400);
    }
    if (!apiKey) {
      // No key configured — be honest, don't pretend to answer.
      throw new ChatError(
        'UNAVAILABLE',
        'The assistant is not configured right now. Try one of the quick questions instead.',
        503,
      );
    }

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = buildRequestBody(message.trim(), history);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let res;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Header-based key so it never lands in URLs/logs.
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      clearTimeout(timer);
      if (err && err.name === 'AbortError') {
        throw new ChatError('TIMEOUT', 'The assistant took too long to respond. Please try again.', 504);
      }
      throw new ChatError('UPSTREAM', 'Could not reach the assistant right now. Please try again shortly.', 502);
    }
    clearTimeout(timer);

    if (res.status === 429) {
      throw new ChatError('RATE_LIMITED', 'The assistant is busy right now. Please try again in a moment.', 429);
    }
    if (!res.ok) {
      // Log server-side for debugging; return a safe generic message.
      let detail = '';
      try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
      console.error(`[chat] Gemini upstream error ${res.status}: ${detail}`);
      throw new ChatError('UPSTREAM', 'The assistant had a problem answering. Please try again shortly.', 502);
    }

    let payload;
    try {
      payload = await res.json();
    } catch {
      throw new ChatError('UPSTREAM', 'The assistant returned an unreadable response. Please try again.', 502);
    }

    const reply = extractText(payload);
    if (!reply) {
      throw new ChatError('UPSTREAM', 'The assistant did not return an answer. Please try rephrasing.', 502);
    }
    return { reply };
  }

  return { ask };
}

/** Pull the plain-text answer out of Gemini's candidate structure. */
function extractText(payload) {
  const parts = payload
    && payload.candidates
    && payload.candidates[0]
    && payload.candidates[0].content
    && payload.candidates[0].content.parts;
  if (!Array.isArray(parts)) return '';
  return parts.map((p) => (p && typeof p.text === 'string' ? p.text : '')).join('').trim();
}

module.exports = { createChatService, ChatError, SETU_SYSTEM_PROMPT };
