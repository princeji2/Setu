'use strict';

/**
 * Guards against stale async view renders writing into a torn-down DOM.
 *
 * Every view render (dashboard, services, documents, applications) does a
 * fetch then writes results by element id. If the citizen navigates to a
 * different tab (or a relay's onSettled callback re-renders a view the
 * citizen has since left) before that fetch resolves, the old render's
 * continuation would try to write into elements the router already
 * replaced — a null.innerHTML crash. Found live during the Phase 5 NIR/
 * DLJA verification pass (mobile viewport, relay success -> immediate
 * "View application" click racing the onSettled refresh of the view
 * behind it).
 *
 * Usage: the router bumps the generation on every navigation and hands
 * the resulting token to the view function. The view checks
 * isStale(token) after each await, before touching the DOM, and bails
 * out quietly if a newer render has since taken over.
 */

let generation = 0;

function nextRenderToken() {
  return ++generation;
}

function isStale(token) {
  return token !== generation;
}

export { nextRenderToken, isStale };
