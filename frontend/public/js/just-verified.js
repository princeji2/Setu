'use strict';

/**
 * Carries a one-shot "this department was just verified" signal across the
 * full view re-render that a relay triggers.
 *
 * WHY THIS EXISTS. When a relay completes, relay.js's onSettled callback
 * re-renders whichever view is visible (app.js -> loadTab). That destroys
 * and recreates every card, so a credential/doc card that flipped from
 * "Not linked" to "Verified" would simply appear already-green — an
 * instant blink, no transition. There is no persistent card element to
 * animate FROM its old state TO the new one, because the element itself is
 * replaced.
 *
 * The fix: the relay records the department it just verified here; the
 * next dashboard/documents render checks this, tags that one card with a
 * `.just-verified` class, and clears the signal. CSS then plays a single
 * mount-time reveal on that card only (badge colour settle + check-mark
 * draw + one gentle pulse). It's consumed once, so navigating back later
 * shows the calm resting state, not a re-run of the celebration.
 *
 * This is deliberately NOT global mutable app state beyond a single
 * string: it's a hand-off token, read-once. prefers-reduced-motion is
 * honoured entirely in CSS (the reveal degrades to an instant state).
 */

let pendingDepartment = null;

/** Called by the relay when a department verification just succeeded. */
function markJustVerified(department) {
  pendingDepartment = department || null;
}

/**
 * Read-and-clear. Returns the department that was just verified (once),
 * then null on every subsequent call until the next markJustVerified.
 */
function consumeJustVerified() {
  const d = pendingDepartment;
  pendingDepartment = null;
  return d;
}

export { markJustVerified, consumeJustVerified };
