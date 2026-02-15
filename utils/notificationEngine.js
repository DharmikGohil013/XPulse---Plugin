/**
 * ============================================================
 *  Notification Engine — In-Page Toast & Sound System
 * ============================================================
 *  Manages notification queue, deduplication, and the data
 *  payloads sent to the content-script overlay renderer.
 *  Pure-function module — no DOM, no storage.
 * ============================================================
 */

/* ─── Notification Types ────────────────────────────────── */

const NOTIFICATION_TYPES = Object.freeze({
  XP_GAIN:         'xp_gain',
  XP_LOSS:         'xp_loss',
  LEVEL_UP:        'level_up',
  ACHIEVEMENT:     'achievement',
  STREAK:          'streak',
  COMBO:           'combo',
  MILESTONE:       'milestone',
  FOCUS_SCORE:     'focus_score',
  WARNING:         'warning',
  SESSION_SUMMARY: 'session_summary'
});

/* ─── Notification Factory ──────────────────────────────── */

function createNotification(type, data = {}) {
  return {
    id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    type,
    timestamp: Date.now(),
    ...buildPayload(type, data)
  };
}

function buildPayload(type, data) {
  switch (type) {
    case NOTIFICATION_TYPES.XP_GAIN:
      return {
        title: `+${data.xp} XP`,
        subtitle: data.domain || 'Productive browsing',
        icon: '✨',
        color: '#00C9A7',
        duration: 2500,
        priority: 'low'
      };

    case NOTIFICATION_TYPES.XP_LOSS:
      return {
        title: `${data.xp} XP`,
        subtitle: data.domain || 'Distracting site',
        icon: '⚠️',
        color: '#FF6B6B',
        duration: 3000,
        priority: 'medium'
      };

    case NOTIFICATION_TYPES.LEVEL_UP:
      return {
        title: `LEVEL ${data.level}!`,
        subtitle: `You've ascended to Level ${data.level}`,
        icon: '🎉',
        color: '#FFD700',
        duration: 5000,
        priority: 'critical',
        animate: 'burst',
        sound: 'levelup'
      };

    case NOTIFICATION_TYPES.ACHIEVEMENT:
      return {
        title: `${data.icon} ${data.title}`,
        subtitle: data.desc || 'Achievement Unlocked!',
        icon: data.icon || '🏆',
        color: '#A855F7',
        duration: 5000,
        priority: 'high',
        animate: 'slide',
        tier: data.tier
      };

    case NOTIFICATION_TYPES.STREAK:
      return {
        title: `🔥 ${data.days}-Day Streak!`,
        subtitle: data.days >= 7 ? "You're on fire!" : 'Keep it going!',
        icon: '🔥',
        color: '#FF8C42',
        duration: 4000,
        priority: 'medium',
        animate: 'bounce'
      };

    case NOTIFICATION_TYPES.COMBO:
      return {
        title: `${data.multiplier}x COMBO!`,
        subtitle: `${data.minutes} minutes of sustained focus`,
        icon: '⚡',
        color: '#58a6ff',
        duration: 3000,
        priority: 'medium',
        animate: 'pulse'
      };

    case NOTIFICATION_TYPES.MILESTONE:
      return {
        title: `${data.label}`,
        subtitle: `${data.xp.toLocaleString()} XP milestone reached!`,
        icon: data.label.split(' ')[0],
        color: '#FFD700',
        duration: 5000,
        priority: 'high',
        animate: 'burst'
      };

    case NOTIFICATION_TYPES.FOCUS_SCORE:
      return {
        title: `Focus Score: ${data.score}`,
        subtitle: `Grade: ${data.grade} — ${data.label}`,
        icon: '🎯',
        color: data.color || '#58a6ff',
        duration: 4000,
        priority: 'low'
      };

    case NOTIFICATION_TYPES.WARNING:
      return {
        title: data.title || 'Heads up!',
        subtitle: data.message,
        icon: '⚠️',
        color: '#FF6B6B',
        duration: 4000,
        priority: 'medium'
      };

    case NOTIFICATION_TYPES.SESSION_SUMMARY:
      return {
        title: 'Session Complete',
        subtitle: `${data.domain} — ${data.duration} · ${data.xp > 0 ? '+' : ''}${data.xp} XP`,
        icon: '📊',
        color: '#8b949e',
        duration: 3500,
        priority: 'low'
      };

    default:
      return {
        title: 'XPulse',
        subtitle: '',
        icon: '⚡',
        color: '#58a6ff',
        duration: 3000,
        priority: 'low'
      };
  }
}

/* ─── Notification Queue Management ─────────────────────── */

/**
 * Priority queue — critical > high > medium > low.
 * Prevents notification spam by collapsing duplicates.
 */
const PRIORITY_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

function sortByPriority(notifications) {
  return [...notifications].sort(
    (a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0)
  );
}

/**
 * Deduplicate: if same type was sent < cooldownMs ago, skip.
 */
function shouldShow(notification, recentHistory, cooldownMs = 5000) {
  const sameType = recentHistory.filter(
    (n) => n.type === notification.type && (Date.now() - n.timestamp) < cooldownMs
  );
  // Always show critical
  if (notification.priority === 'critical') return true;
  return sameType.length === 0;
}

/* ─── Distraction Warnings ──────────────────────────────── */

/**
 * Generate escalating warnings based on consecutive distracting ticks.
 */
function getDistractionWarning(consecutiveDistractingTicks) {
  if (consecutiveDistractingTicks === 5) {
    return createNotification(NOTIFICATION_TYPES.WARNING, {
      title: '5 minutes on distracting sites',
      message: 'Consider switching to something productive!'
    });
  }
  if (consecutiveDistractingTicks === 15) {
    return createNotification(NOTIFICATION_TYPES.WARNING, {
      title: '15 minutes lost!',
      message: 'Your focus score is dropping fast 📉'
    });
  }
  if (consecutiveDistractingTicks === 30) {
    return createNotification(NOTIFICATION_TYPES.WARNING, {
      title: '30 minutes of distraction!',
      message: 'Your streak is at risk! Get back on track 🚨'
    });
  }
  return null;
}

/* ─── Exports ───────────────────────────────────────────── */

const NotificationEngine = {
  NOTIFICATION_TYPES,
  createNotification,
  sortByPriority,
  shouldShow,
  getDistractionWarning,
  PRIORITY_ORDER
};

if (typeof globalThis !== 'undefined') {
  globalThis.NotificationEngine = NotificationEngine;
}

export default NotificationEngine;
