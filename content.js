/**
 * ============================================================
 *  XPulse — Content Script
 * ============================================================
 *  Injected into every page.  Detects page visibility and
 *  focus state, relays to the background service worker.
 *
 *  Deliberately lightweight — no DOM manipulation, no UI.
 * ============================================================
 */

(() => {
  'use strict';

  /* ─── State ───────────────────────────────────────────── */

  let isVisible  = !document.hidden;
  let isFocused  = document.hasFocus();
  let lastReport = 0;
  const THROTTLE = 2000; // ms between reports

  /* ─── Helpers ─────────────────────────────────────────── */

  function reportVisibility() {
    const now = Date.now();
    if (now - lastReport < THROTTLE) return;
    lastReport = now;

    const visible = isVisible && isFocused;

    try {
      chrome.runtime.sendMessage({
        type: 'TAB_VISIBLE',
        visible,
        url: window.location.href,
        timestamp: now
      });
    } catch {
      // Extension context may have been invalidated (update/uninstall)
    }
  }

  /* ─── Visibility Change ───────────────────────────────── */

  document.addEventListener('visibilitychange', () => {
    isVisible = !document.hidden;
    reportVisibility();
  });

  /* ─── Focus / Blur ────────────────────────────────────── */

  window.addEventListener('focus', () => {
    isFocused = true;
    reportVisibility();
  });

  window.addEventListener('blur', () => {
    isFocused = false;
    reportVisibility();
  });

  /* ─── User Activity Detection (anti-idle) ─────────────── */

  // Optional: detect mouse / keyboard to give background a
  // secondary idle signal.  The background already uses
  // chrome.idle API, so this is a belt-and-suspenders approach.

  let lastActivity = Date.now();
  const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];

  function onActivity() {
    const now = Date.now();
    // Only report once every 30 s to avoid flooding
    if (now - lastActivity > 30000) {
      lastActivity = now;
      try {
        chrome.runtime.sendMessage({
          type: 'USER_ACTIVITY',
          timestamp: now
        });
      } catch { /* noop */ }
    }
  }

  ACTIVITY_EVENTS.forEach((evt) => {
    document.addEventListener(evt, onActivity, { passive: true, capture: true });
  });

  /* ─── Initial report ──────────────────────────────────── */

  reportVisibility();
})();
