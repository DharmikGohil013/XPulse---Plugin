/**
 * ============================================================
 *  XPulse v2 — Content Script + Toast Overlay System
 * ============================================================
 *  1. Detects page visibility and focus
 *  2. Relays activity signals to background service worker
 *  3. Renders beautiful floating toast notifications:
 *     - XP gain/loss with animated counter
 *     - Level-up celebrations with particle burst
 *     - Achievement unlocks with tier glow
 *     - Combo tier changes
 *     - Streak milestones
 *     - Distraction warnings (escalating severity)
 *     - Session summaries
 *     - Focus score updates
 * ============================================================
 */

(() => {
  'use strict';

  /* ═══════════════════════════════════════════════════════
   *  PART 1 — Visibility & Activity Reporting
   * ═══════════════════════════════════════════════════════ */

  let isVisible  = !document.hidden;
  let isFocused  = document.hasFocus();
  let lastReport = 0;
  const THROTTLE = 2000;

  function reportVisibility() {
    const now = Date.now();
    if (now - lastReport < THROTTLE) return;
    lastReport = now;
    try {
      chrome.runtime.sendMessage({
        type: 'TAB_VISIBLE',
        visible: isVisible && isFocused,
        url: window.location.href,
        timestamp: now
      });
    } catch {}
  }

  document.addEventListener('visibilitychange', () => { isVisible = !document.hidden; reportVisibility(); });
  window.addEventListener('focus', () => { isFocused = true; reportVisibility(); });
  window.addEventListener('blur',  () => { isFocused = false; reportVisibility(); });

  let lastActivity = Date.now();
  const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'scroll', 'click', 'touchstart'];

  function onActivity() {
    const now = Date.now();
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

  /* ═══════════════════════════════════════════════════════
   *  PART 2 — Toast Overlay Notification System
   * ═══════════════════════════════════════════════════════ */

  const TOAST_CONTAINER_ID = 'xpulse-toast-container';
  const MAX_VISIBLE_TOASTS = 5;
  const toastQueue = [];
  let activeToasts = 0;

  /* ─── Inject Styles ───────────────────────────────────── */

  function injectStyles() {
    if (document.getElementById('xpulse-toast-styles')) return;

    const style = document.createElement('style');
    style.id = 'xpulse-toast-styles';
    style.textContent = `
      #${TOAST_CONTAINER_ID} {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        display: flex;
        flex-direction: column;
        gap: 8px;
        pointer-events: none;
        font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif;
      }

      .xpulse-toast {
        pointer-events: auto;
        min-width: 280px;
        max-width: 380px;
        padding: 12px 16px;
        border-radius: 12px;
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.05) inset;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
        transform: translateX(120%) scale(0.8);
        opacity: 0;
        animation: xpulseSlideIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        transition: transform 0.3s ease, opacity 0.3s ease;
      }

      .xpulse-toast.removing {
        animation: xpulseSlideOut 0.3s ease forwards;
      }

      .xpulse-toast-icon {
        font-size: 24px;
        flex-shrink: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
      }

      .xpulse-toast-body {
        flex: 1;
        min-width: 0;
      }

      .xpulse-toast-title {
        font-size: 13px;
        font-weight: 700;
        letter-spacing: 0.3px;
        margin-bottom: 2px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }

      .xpulse-toast-detail {
        font-size: 11px;
        opacity: 0.75;
        line-height: 1.3;
      }

      .xpulse-toast-xp {
        font-size: 16px;
        font-weight: 800;
        flex-shrink: 0;
        text-shadow: 0 0 12px currentColor;
        font-variant-numeric: tabular-nums;
      }

      /* ── Type: XP Gain ─────────────────────────────────── */
      .xpulse-toast-xp_gain {
        background: linear-gradient(135deg, rgba(0,201,167,0.15), rgba(0,201,167,0.08));
        border-color: rgba(0,201,167,0.3);
      }
      .xpulse-toast-xp_gain .xpulse-toast-title { color: #00FFD1; }
      .xpulse-toast-xp_gain .xpulse-toast-detail { color: rgba(0,255,209,0.65); }
      .xpulse-toast-xp_gain .xpulse-toast-xp { color: #00FFD1; }
      .xpulse-toast-xp_gain .xpulse-toast-icon { background: rgba(0,201,167,0.2); }

      /* ── Type: XP Loss ─────────────────────────────────── */
      .xpulse-toast-xp_loss {
        background: linear-gradient(135deg, rgba(255,107,107,0.15), rgba(255,107,107,0.08));
        border-color: rgba(255,107,107,0.3);
      }
      .xpulse-toast-xp_loss .xpulse-toast-title { color: #FF6B6B; }
      .xpulse-toast-xp_loss .xpulse-toast-detail { color: rgba(255,107,107,0.65); }
      .xpulse-toast-xp_loss .xpulse-toast-xp { color: #FF6B6B; }
      .xpulse-toast-xp_loss .xpulse-toast-icon { background: rgba(255,107,107,0.2); }

      /* ── Type: Level Up ────────────────────────────────── */
      .xpulse-toast-level_up {
        background: linear-gradient(135deg, rgba(255,215,0,0.2), rgba(255,165,0,0.1));
        border-color: rgba(255,215,0,0.4);
        box-shadow: 0 8px 32px rgba(255,215,0,0.2), 0 0 60px rgba(255,215,0,0.08);
      }
      .xpulse-toast-level_up .xpulse-toast-title { color: #FFD700; }
      .xpulse-toast-level_up .xpulse-toast-detail { color: rgba(255,215,0,0.75); }
      .xpulse-toast-level_up .xpulse-toast-icon { background: rgba(255,215,0,0.25); }

      /* ── Type: Achievement ─────────────────────────────── */
      .xpulse-toast-achievement {
        background: linear-gradient(135deg, rgba(168,85,247,0.2), rgba(139,92,246,0.1));
        border-color: rgba(168,85,247,0.4);
        box-shadow: 0 8px 32px rgba(168,85,247,0.2), 0 0 40px rgba(168,85,247,0.06);
      }
      .xpulse-toast-achievement .xpulse-toast-title { color: #C084FC; }
      .xpulse-toast-achievement .xpulse-toast-detail { color: rgba(192,132,252,0.75); }
      .xpulse-toast-achievement .xpulse-toast-icon { background: rgba(168,85,247,0.25); }

      /* ── Type: Streak ──────────────────────────────────── */
      .xpulse-toast-streak {
        background: linear-gradient(135deg, rgba(251,146,60,0.2), rgba(234,88,12,0.1));
        border-color: rgba(251,146,60,0.4);
      }
      .xpulse-toast-streak .xpulse-toast-title { color: #FB923C; }
      .xpulse-toast-streak .xpulse-toast-detail { color: rgba(251,146,60,0.75); }
      .xpulse-toast-streak .xpulse-toast-icon { background: rgba(251,146,60,0.2); }

      /* ── Type: Combo ───────────────────────────────────── */
      .xpulse-toast-combo {
        background: linear-gradient(135deg, rgba(56,189,248,0.2), rgba(14,165,233,0.1));
        border-color: rgba(56,189,248,0.4);
      }
      .xpulse-toast-combo .xpulse-toast-title { color: #38BDF8; }
      .xpulse-toast-combo .xpulse-toast-detail { color: rgba(56,189,248,0.75); }
      .xpulse-toast-combo .xpulse-toast-xp { color: #38BDF8; }
      .xpulse-toast-combo .xpulse-toast-icon { background: rgba(56,189,248,0.2); }

      /* ── Type: Milestone ───────────────────────────────── */
      .xpulse-toast-milestone {
        background: linear-gradient(135deg, rgba(236,72,153,0.2), rgba(219,39,119,0.1));
        border-color: rgba(236,72,153,0.4);
        box-shadow: 0 8px 32px rgba(236,72,153,0.15), 0 0 40px rgba(236,72,153,0.06);
      }
      .xpulse-toast-milestone .xpulse-toast-title { color: #F472B6; }
      .xpulse-toast-milestone .xpulse-toast-detail { color: rgba(244,114,182,0.75); }
      .xpulse-toast-milestone .xpulse-toast-icon { background: rgba(236,72,153,0.25); }

      /* ── Type: Warning ─────────────────────────────────── */
      .xpulse-toast-warning {
        background: linear-gradient(135deg, rgba(239,68,68,0.2), rgba(220,38,38,0.12));
        border-color: rgba(239,68,68,0.5);
        box-shadow: 0 8px 32px rgba(239,68,68,0.2), 0 0 0 1px rgba(239,68,68,0.1);
      }
      .xpulse-toast-warning .xpulse-toast-title { color: #FCA5A5; }
      .xpulse-toast-warning .xpulse-toast-detail { color: rgba(252,165,165,0.8); }
      .xpulse-toast-warning .xpulse-toast-icon { background: rgba(239,68,68,0.25); }

      /* ── Type: Focus Score ─────────────────────────────── */
      .xpulse-toast-focus_score {
        background: linear-gradient(135deg, rgba(34,211,238,0.15), rgba(6,182,212,0.08));
        border-color: rgba(34,211,238,0.3);
      }
      .xpulse-toast-focus_score .xpulse-toast-title { color: #22D3EE; }
      .xpulse-toast-focus_score .xpulse-toast-detail { color: rgba(34,211,238,0.7); }
      .xpulse-toast-focus_score .xpulse-toast-icon { background: rgba(34,211,238,0.2); }

      /* ── Type: Session Summary ─────────────────────────── */
      .xpulse-toast-session_summary {
        background: linear-gradient(135deg, rgba(99,102,241,0.15), rgba(79,70,229,0.08));
        border-color: rgba(99,102,241,0.3);
      }
      .xpulse-toast-session_summary .xpulse-toast-title { color: #818CF8; }
      .xpulse-toast-session_summary .xpulse-toast-detail { color: rgba(129,140,248,0.7); }
      .xpulse-toast-session_summary .xpulse-toast-icon { background: rgba(99,102,241,0.2); }

      /* ── Particles ─────────────────────────────────────── */
      .xpulse-particles {
        position: absolute;
        top: 50%;
        left: 50%;
        width: 0;
        height: 0;
        pointer-events: none;
      }
      .xpulse-particle {
        position: absolute;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        animation: xpulseParticle 0.8s ease-out forwards;
      }

      @keyframes xpulseSlideIn {
        from { transform: translateX(120%) scale(0.8); opacity: 0; }
        to   { transform: translateX(0) scale(1); opacity: 1; }
      }
      @keyframes xpulseSlideOut {
        from { transform: translateX(0) scale(1); opacity: 1; }
        to   { transform: translateX(120%) scale(0.8); opacity: 0; }
      }
      @keyframes xpulseParticle {
        0%   { transform: translate(0, 0) scale(1); opacity: 1; }
        100% { transform: translate(var(--px), var(--py)) scale(0); opacity: 0; }
      }
      @keyframes xpulsePulse {
        0%, 100% { transform: scale(1); }
        50%      { transform: scale(1.15); }
      }
      @keyframes xpulseShake {
        0%, 100% { transform: translateX(0); }
        25%      { transform: translateX(-3px); }
        75%      { transform: translateX(3px); }
      }
    `;
    document.head.appendChild(style);
  }

  /* ─── Get or Create Container ─────────────────────────── */

  function getContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (!container) {
      injectStyles();
      container = document.createElement('div');
      container.id = TOAST_CONTAINER_ID;
      document.body.appendChild(container);
    }
    return container;
  }

  /* ─── Create Toast Element ────────────────────────────── */

  function createToastEl(notification) {
    const { type, title, detail, icon, xpText, animation } = notification;

    const toast = document.createElement('div');
    toast.className = `xpulse-toast xpulse-toast-${type}`;

    // Icon
    const iconEl = document.createElement('div');
    iconEl.className = 'xpulse-toast-icon';
    iconEl.textContent = icon || '⚡';
    if (animation === 'pulse') iconEl.style.animation = 'xpulsePulse 0.6s ease 2';
    if (animation === 'shake') toast.style.animation += ', xpulseShake 0.4s ease 3';
    toast.appendChild(iconEl);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'xpulse-toast-body';
    const titleEl = document.createElement('div');
    titleEl.className = 'xpulse-toast-title';
    titleEl.textContent = title || 'XPulse';
    bodyEl.appendChild(titleEl);
    if (detail) {
      const detailEl = document.createElement('div');
      detailEl.className = 'xpulse-toast-detail';
      detailEl.textContent = detail;
      bodyEl.appendChild(detailEl);
    }
    toast.appendChild(bodyEl);

    // XP badge
    if (xpText) {
      const xpEl = document.createElement('div');
      xpEl.className = 'xpulse-toast-xp';
      xpEl.textContent = xpText;
      toast.appendChild(xpEl);
    }

    // Click to dismiss
    toast.addEventListener('click', () => dismissToast(toast));

    // Particles for special events
    if (type === 'level_up' || type === 'achievement' || type === 'milestone') {
      addParticles(toast, type);
    }

    return toast;
  }

  /* ─── Particle Burst ──────────────────────────────────── */

  function addParticles(toastEl, type) {
    const colors = {
      level_up:    ['#FFD700', '#FFA500', '#FF6347', '#FF69B4'],
      achievement: ['#C084FC', '#A855F7', '#7C3AED', '#DDD6FE'],
      milestone:   ['#F472B6', '#EC4899', '#DB2777', '#FBCFE8']
    };
    const particleContainer = document.createElement('div');
    particleContainer.className = 'xpulse-particles';
    const palette = colors[type] || colors.level_up;

    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.className = 'xpulse-particle';
      const angle = (i / 12) * Math.PI * 2;
      const dist = 30 + Math.random() * 40;
      p.style.setProperty('--px', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--py', `${Math.sin(angle) * dist}px`);
      p.style.backgroundColor = palette[i % palette.length];
      p.style.animationDelay = `${Math.random() * 0.2}s`;
      particleContainer.appendChild(p);
    }
    toastEl.appendChild(particleContainer);
  }

  /* ─── Show Toast ──────────────────────────────────────── */

  function showToast(notification) {
    if (activeToasts >= MAX_VISIBLE_TOASTS) {
      toastQueue.push(notification);
      return;
    }

    const container = getContainer();
    const el = createToastEl(notification);
    container.appendChild(el);
    activeToasts++;

    // Auto-dismiss (longer for important notifications)
    const duration = notification.priority === 'critical' ? 6000
                   : notification.priority === 'high'     ? 4500
                   : 3000;

    setTimeout(() => dismissToast(el), duration);
  }

  function dismissToast(el) {
    if (el.classList.contains('removing')) return;
    el.classList.add('removing');
    setTimeout(() => {
      el.remove();
      activeToasts--;
      // Process queue
      if (toastQueue.length > 0 && activeToasts < MAX_VISIBLE_TOASTS) {
        showToast(toastQueue.shift());
      }
    }, 300);
  }

  /* ═══════════════════════════════════════════════════════
   *  PART 3 — Message Listener
   * ═══════════════════════════════════════════════════════ */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'XPULSE_NOTIFICATION' && msg.notification) {
      showToast(msg.notification);
      sendResponse({ ok: true });
    }
    return false;
  });

})();