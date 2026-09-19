'use strict';

/**
 * "Ask about Setu" — floating help chatbot.
 *
 * Self-contained vanilla module (no framework), matching the rest of the
 * frontend. It mounts ONCE onto <body> — deliberately OUTSIDE #appRoot —
 * so it survives every view/tab re-render in app.js (which fully rewrites
 * #appRoot). That's why it's present identically on landing, auth,
 * dashboard, services, documents and applications with no per-view wiring.
 *
 * Behaviour:
 *  - First open shows a greeting + quick-reply chips with INSTANT canned
 *    answers (no network) for the five common questions.
 *  - Any other free-text question is proxied to Gemini via the gateway's
 *    POST /api/v1/chat (the key stays server-side). Grounded system prompt
 *    lives on the server so answers stay about THIS project.
 *  - Errors (Gemini down / rate-limited / not configured) show a calm
 *    fallback bubble; the widget never breaks.
 *  - History is in-memory only (this session). "New chat" clears it.
 */

import { API_BASE } from './api.js';

/* ------------------------------------------------------------------ */
/* Grounded canned answers — instant, no API call. Kept factually in    */
/* sync with the server system prompt (chat-service.js). Short + warm.   */
/* ------------------------------------------------------------------ */
const QUICK_REPLIES = [
  {
    q: 'What does Setu do?',
    a: "Setu is a single gateway to government services. Today, if a task needs data from two departments, you log into each portal, download a document from one, and re-upload it to the other. Setu replaces that: you log in once, and it fetches and verifies your data across departments for you.",
  },
  {
    q: 'How do I use it?',
    a: "Four steps: 1) create one Setu account and log in, 2) start an application for a service, 3) approve a consent screen showing exactly what will be shared and from which department, 4) Setu makes a live call to that department, verifies the data, and shows you the result — with every step tracked.",
  },
  {
    q: 'What is consent-based access?',
    a: "Before Setu contacts any department, it checks that you approved that specific data share. It's a real backend authorization check, not just a pop-up — no consent on record means no department call happens. You always see which fields will be shared and why.",
  },
  {
    q: 'How does reuse across departments work?',
    a: "Once a reference is verified with a department, any future application that needs that same department's data skips the re-entry — you don't retype anything. It still asks for fresh consent and still fetches live data each time; it just saves you the manual re-upload.",
  },
  {
    q: 'Is my data secure?',
    a: "Setu stores only references and short masked summaries — never your raw PAN, Aadhaar or licence numbers; those stay with the department that issued them. Login uses a hashed password and a token, and Setu authenticates to each department with its own secret key you never see. (It's a hackathon prototype, so security is real enough to demo, not production-hardened.)",
  },
];

const GREETING =
  "Hi! I'm the Setu assistant. Ask me anything about what Setu does and how it works — or tap a question below to get started.";

/* Map a canned question to its answer (exact match on the chip text). */
const CANNED = new Map(QUICK_REPLIES.map((r) => [r.q.toLowerCase(), r.a]));

/* ------------------------------------------------------------------ */
/* Icons (inline SVG, currentColor)                                     */
/* ------------------------------------------------------------------ */
const ICON_CHAT = `<svg class="ico-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.9-.9L3 21l1.9-5.1A8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5Z"/></svg>`;
const ICON_CLOSE = `<svg class="ico-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg>`;
const ICON_SPARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/><circle cx="12" cy="12" r="3.2"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>`;
const ICON_NEW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9 9 0 0 0-6.4 2.6L3 8"/><path d="M3 3v5h5"/></svg>`;

export function mountChatbot() {
  if (document.getElementById('setuChatLauncher')) return; // guard against double-mount

  // Session-only conversation memory. Each turn: { role:'user'|'model', text }.
  let history = [];
  let firstOpenDone = false;
  let sending = false;

  // ---- Launcher ----
  const launcher = document.createElement('button');
  launcher.id = 'setuChatLauncher';
  launcher.className = 'setu-chat-launcher';
  launcher.setAttribute('aria-label', 'Open help chat — ask about Setu');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.innerHTML = `${ICON_CHAT}${ICON_CLOSE}<span class="nudge-dot" aria-hidden="true"></span>`;

  // ---- Panel ----
  const panel = document.createElement('section');
  panel.id = 'setuChatPanel';
  panel.className = 'setu-chat-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Ask about Setu');
  panel.setAttribute('aria-hidden', 'true');
  panel.innerHTML = `
    <header class="setu-chat-head">
      <div class="sc-avatar" aria-hidden="true">${ICON_SPARK}</div>
      <div class="sc-title"><b>Ask about Setu</b><span>Grounded in how Setu actually works</span></div>
      <button class="sc-action" id="setuChatNew" title="New chat" aria-label="Start a new chat">${ICON_NEW}</button>
      <button class="sc-action" id="setuChatClose" title="Close" aria-label="Close chat">${ICON_CLOSE}</button>
    </header>
    <div class="setu-chat-log" id="setuChatLog" aria-live="polite"></div>
    <div class="setu-chat-input">
      <textarea id="setuChatText" rows="1" placeholder="Ask a question about Setu…" aria-label="Type your question"></textarea>
      <button class="setu-chat-send" id="setuChatSend" aria-label="Send message">${ICON_SEND}</button>
    </div>
    <div class="setu-chat-foot"><span>Answers are AI-generated and grounded in Setu's docs.</span></div>`;

  document.body.appendChild(launcher);
  document.body.appendChild(panel);

  const logEl = panel.querySelector('#setuChatLog');
  const textEl = panel.querySelector('#setuChatText');
  const sendBtn = panel.querySelector('#setuChatSend');

  /* ---------- rendering helpers ---------- */
  function scrollToBottom() {
    logEl.scrollTop = logEl.scrollHeight;
  }

  function addBubble(text, kind) {
    const el = document.createElement('div');
    el.className = `sc-msg ${kind}`;
    el.textContent = text;
    logEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function addQuickReplies() {
    const wrap = document.createElement('div');
    wrap.className = 'sc-quick';
    QUICK_REPLIES.forEach((r) => {
      const chip = document.createElement('button');
      chip.className = 'sc-chip';
      chip.type = 'button';
      chip.textContent = r.q;
      chip.addEventListener('click', () => handleQuick(r.q, r.a));
      wrap.appendChild(chip);
    });
    logEl.appendChild(wrap);
    scrollToBottom();
    return wrap;
  }

  function showTyping() {
    const el = document.createElement('div');
    el.className = 'sc-typing';
    el.id = 'setuChatTyping';
    el.innerHTML = '<i></i><i></i><i></i>';
    logEl.appendChild(el);
    scrollToBottom();
    return el;
  }
  function hideTyping() {
    const t = panel.querySelector('#setuChatTyping');
    if (t) t.remove();
  }

  /* ---------- conversation flow ---------- */
  function renderGreeting() {
    logEl.innerHTML = '';
    addBubble(GREETING, 'bot');
    addQuickReplies();
  }

  function handleQuick(question, answer) {
    // Remove the chip cluster after a pick so it doesn't linger; keep the
    // choice visible as a normal user turn for a natural transcript.
    const chips = logEl.querySelector('.sc-quick');
    if (chips) chips.remove();
    addBubble(question, 'user');
    history.push({ role: 'user', text: question });
    addBubble(answer, 'bot');
    history.push({ role: 'model', text: answer });
  }

  async function sendFreeText(message) {
    if (sending) return;
    const msg = message.trim();
    if (!msg) return;

    // Instant canned path even if the visitor types one of the known
    // questions verbatim — no need to spend an API call.
    const canned = CANNED.get(msg.toLowerCase());
    const chips = logEl.querySelector('.sc-quick');
    if (chips) chips.remove();

    addBubble(msg, 'user');
    history.push({ role: 'user', text: msg });
    textEl.value = '';
    autosize();

    if (canned) {
      addBubble(canned, 'bot');
      history.push({ role: 'model', text: canned });
      return;
    }

    sending = true;
    sendBtn.disabled = true;
    const typing = showTyping();

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        // Send prior turns (server also caps) for conversational context.
        body: JSON.stringify({ message: msg, history: history.slice(0, -1) }),
      });

      let payload = null;
      try { payload = await res.json(); } catch { payload = null; }
      hideTyping();

      if (res.ok && payload && payload.success && payload.data && payload.data.reply) {
        addBubble(payload.data.reply, 'bot');
        history.push({ role: 'model', text: payload.data.reply });
      } else {
        const friendly =
          (payload && payload.error && payload.error.message)
          || 'I had trouble answering that just now. Please try again in a moment — or tap one of the quick questions.';
        addBubble(friendly, 'error');
        // Don't push errors into history — keep context clean for retries.
      }
    } catch {
      hideTyping();
      addBubble(
        "I couldn't reach the assistant — the Setu gateway may be offline. You can still use the quick questions above, which work without a connection.",
        'error',
      );
    } finally {
      sending = false;
      sendBtn.disabled = false;
      textEl.focus();
    }
  }

  function newChat() {
    history = [];
    renderGreeting();
    textEl.value = '';
    autosize();
    textEl.focus();
  }

  /* ---------- open / close ---------- */
  function openPanel() {
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    launcher.classList.add('is-open');
    launcher.setAttribute('aria-expanded', 'true');
    launcher.querySelector('.nudge-dot').style.display = 'none';
    if (!firstOpenDone) {
      renderGreeting();
      firstOpenDone = true;
    }
    setTimeout(() => textEl.focus(), 120);
  }
  function closePanel() {
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    launcher.classList.remove('is-open');
    launcher.setAttribute('aria-expanded', 'false');
  }
  function togglePanel() {
    if (panel.classList.contains('is-open')) closePanel();
    else openPanel();
  }

  /* ---------- input sizing ---------- */
  function autosize() {
    textEl.style.height = 'auto';
    textEl.style.height = `${Math.min(textEl.scrollHeight, 96)}px`;
  }

  /* ---------- events ---------- */
  launcher.addEventListener('click', togglePanel);
  panel.querySelector('#setuChatClose').addEventListener('click', closePanel);
  panel.querySelector('#setuChatNew').addEventListener('click', newChat);
  sendBtn.addEventListener('click', () => sendFreeText(textEl.value));
  textEl.addEventListener('input', autosize);
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendFreeText(textEl.value);
    }
  });
  // Esc closes when the panel is focused/open.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel.classList.contains('is-open')) closePanel();
  });
}
