/**
 * ============================================================
 *  Achievement Engine — Tiered Achievement System for XPulse
 * ============================================================
 *  Stateless evaluator.  Given current stats, returns any
 *  newly unlocked achievements.
 * ============================================================
 */

/* ─── Achievement Definitions ───────────────────────────── */

/**
 * Each achievement has:
 *   id        — unique key stored in chrome.storage
 *   title     — display name
 *   desc      — description text
 *   tier      — beginner | intermediate | advanced | elite
 *   icon      — emoji for quick display
 *   condition — function(stats) → boolean
 */
const ACHIEVEMENTS = [
  // ── Beginner ──────────────────────────────────────────
  {
    id: 'first_100_xp',
    title: 'First Steps',
    desc: 'Earn your first 100 XP.',
    tier: 'beginner',
    icon: '⭐',
    condition: (s) => s.totalXpEarned >= 100
  },
  {
    id: 'first_productive_day',
    title: 'Productive Day',
    desc: 'Earn 50+ productive XP in a single day.',
    tier: 'beginner',
    icon: '🌱',
    condition: (s) => s.dailyProductiveXp >= 50
  },
  {
    id: 'level_2',
    title: 'Level Up!',
    desc: 'Reach Level 2.',
    tier: 'beginner',
    icon: '🔰',
    condition: (s) => s.level >= 2
  },

  // ── Intermediate ──────────────────────────────────────
  {
    id: 'streak_7',
    title: 'Week Warrior',
    desc: 'Maintain a 7-day productive streak.',
    tier: 'intermediate',
    icon: '🔥',
    condition: (s) => s.currentStreak >= 7
  },
  {
    id: 'level_5',
    title: 'Apprentice',
    desc: 'Reach Level 5.',
    tier: 'intermediate',
    icon: '⚔️',
    condition: (s) => s.level >= 5
  },
  {
    id: 'total_1000_xp',
    title: 'XP Hunter',
    desc: 'Earn a lifetime total of 1000 XP.',
    tier: 'intermediate',
    icon: '💎',
    condition: (s) => s.totalXpEarned >= 1000
  },

  // ── Advanced ──────────────────────────────────────────
  {
    id: 'streak_30',
    title: 'Monthly Master',
    desc: 'Maintain a 30-day productive streak.',
    tier: 'advanced',
    icon: '🏆',
    condition: (s) => s.currentStreak >= 30
  },
  {
    id: 'total_5000_xp',
    title: 'XP Legend',
    desc: 'Earn a lifetime total of 5000 XP.',
    tier: 'advanced',
    icon: '👑',
    condition: (s) => s.totalXpEarned >= 5000
  },
  {
    id: 'level_10',
    title: 'Veteran',
    desc: 'Reach Level 10.',
    tier: 'advanced',
    icon: '🛡️',
    condition: (s) => s.level >= 10
  },

  // ── Elite ─────────────────────────────────────────────
  {
    id: 'streak_100',
    title: 'Century Streak',
    desc: 'Maintain a 100-day productive streak.',
    tier: 'elite',
    icon: '🌟',
    condition: (s) => s.currentStreak >= 100
  },
  {
    id: 'level_15',
    title: 'Grandmaster',
    desc: 'Reach Level 15.',
    tier: 'elite',
    icon: '🐉',
    condition: (s) => s.level >= 15
  },
  {
    id: 'total_20000_xp',
    title: 'Transcendent',
    desc: 'Earn a lifetime total of 20 000 XP.',
    tier: 'elite',
    icon: '✨',
    condition: (s) => s.totalXpEarned >= 20000
  }
];

/* ─── Evaluator ─────────────────────────────────────────── */

/**
 * Check all achievements against current stats.
 *
 * @param {Object} stats — { totalXpEarned, level, currentStreak, dailyProductiveXp }
 * @param {Object} unlocked — current achievements map { id: { unlocked, timestamp } }
 * @returns {{ newlyUnlocked: Array, updatedMap: Object }}
 */
function evaluate(stats, unlocked = {}) {
  const newlyUnlocked = [];
  const updatedMap = { ...unlocked };

  for (const ach of ACHIEVEMENTS) {
    // Skip already-unlocked achievements
    if (updatedMap[ach.id]?.unlocked) continue;

    if (ach.condition(stats)) {
      updatedMap[ach.id] = {
        unlocked: true,
        timestamp: new Date().toISOString()
      };
      newlyUnlocked.push(ach);
    }
  }

  return { newlyUnlocked, updatedMap };
}

/**
 * Get full list of achievements with unlock status merged in.
 * @param {Object} unlocked — stored map
 * @returns {Array}
 */
function getAllWithStatus(unlocked = {}) {
  return ACHIEVEMENTS.map((a) => ({
    ...a,
    unlocked: !!unlocked[a.id]?.unlocked,
    unlockedAt: unlocked[a.id]?.timestamp ?? null,
    // Drop the live condition function from serialised output
    condition: undefined
  }));
}

/**
 * Count unlocked achievements.
 */
function countUnlocked(unlocked = {}) {
  return Object.values(unlocked).filter((v) => v.unlocked).length;
}

/* ─── Exports ───────────────────────────────────────────── */

const AchievementEngine = {
  ACHIEVEMENTS,
  evaluate,
  getAllWithStatus,
  countUnlocked
};

if (typeof globalThis !== 'undefined') {
  globalThis.AchievementEngine = AchievementEngine;
}

export default AchievementEngine;
