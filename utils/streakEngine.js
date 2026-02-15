/**
 * ============================================================
 *  Streak Engine — Daily Streak Logic for XPulse
 * ============================================================
 *  Pure-function module.  Accepts current streak state and
 *  returns a new state object — no storage I/O.
 * ============================================================
 */

/** Minimum productive XP a user must earn each day to keep streak alive */
const DAILY_PRODUCTIVE_THRESHOLD = 50;

/* ─── Date Helpers ──────────────────────────────────────── */

/**
 * Get today's date as ISO string (YYYY-MM-DD) in local timezone.
 */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * Get yesterday's date as ISO string.
 */
function yesterdayISO() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ─── Core Streak Logic ─────────────────────────────────── */

/**
 * Evaluate and return updated streak state.
 *
 * Call this ONCE when the day rolls over or on extension startup.
 *
 * @param {Object} state
 *   - currentStreak {number}
 *   - longestStreak {number}
 *   - lastActiveDate {string|null} ISO date of last qualifying day
 *   - dailyProductiveXp {number} productive XP earned "yesterday"
 *     (the day that just ended, before bucket was reset)
 *
 * @returns {Object} updated { currentStreak, longestStreak, lastActiveDate }
 */
function evaluateStreak({ currentStreak, longestStreak, lastActiveDate, dailyProductiveXp }) {
  const today = todayISO();
  const yesterday = yesterdayISO();

  // Already evaluated for today
  if (lastActiveDate === today) {
    return { currentStreak, longestStreak, lastActiveDate };
  }

  // If lastActiveDate was yesterday and they hit the threshold → continue streak
  if (lastActiveDate === yesterday && dailyProductiveXp >= DAILY_PRODUCTIVE_THRESHOLD) {
    const newStreak = currentStreak + 1;
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(longestStreak, newStreak),
      lastActiveDate: today
    };
  }

  // If they missed a day (or never started), check if today is the start of new streak
  // On day-roll the dailyProductiveXp reflects *yesterday's* total.
  // If yesterday qualified, streak should have been updated; otherwise reset.
  if (lastActiveDate === yesterday && dailyProductiveXp < DAILY_PRODUCTIVE_THRESHOLD) {
    // Missed threshold yesterday → reset
    return {
      currentStreak: 0,
      longestStreak,
      lastActiveDate
    };
  }

  // More than 1 day gap → streak is broken
  if (lastActiveDate && lastActiveDate < yesterday) {
    return {
      currentStreak: 0,
      longestStreak,
      lastActiveDate
    };
  }

  // First run / no lastActiveDate
  return {
    currentStreak: 0,
    longestStreak: longestStreak ?? 0,
    lastActiveDate: lastActiveDate ?? null
  };
}

/**
 * Mark today as qualifying (called when dailyProductiveXp crosses
 * the threshold during the day, so the streak is credited live).
 *
 * @param {Object} state same shape as evaluateStreak input
 * @returns {Object} updated streak state
 */
function markTodayQualified({ currentStreak, longestStreak, lastActiveDate }) {
  const today = todayISO();
  const yesterday = yesterdayISO();

  // Already marked today
  if (lastActiveDate === today) {
    return { currentStreak, longestStreak, lastActiveDate };
  }

  // Continuing from yesterday
  if (lastActiveDate === yesterday) {
    const newStreak = currentStreak + 1;
    return {
      currentStreak: newStreak,
      longestStreak: Math.max(longestStreak, newStreak),
      lastActiveDate: today
    };
  }

  // Gap or first time → start new streak at 1
  return {
    currentStreak: 1,
    longestStreak: Math.max(longestStreak ?? 0, 1),
    lastActiveDate: today
  };
}

/* ─── Exports ───────────────────────────────────────────── */

const StreakEngine = {
  DAILY_PRODUCTIVE_THRESHOLD,
  todayISO,
  yesterdayISO,
  evaluateStreak,
  markTodayQualified
};

if (typeof globalThis !== 'undefined') {
  globalThis.StreakEngine = StreakEngine;
}

export default StreakEngine;
