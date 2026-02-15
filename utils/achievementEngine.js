/**
 * ============================================================
 *  Achievement Engine v2 — 25+ Tiered Achievements for XPulse
 * ============================================================
 *  Stateless evaluator with 5 tiers, hidden achievements,
 *  rarity tracking, and progression chains.
 * ============================================================
 */

/* ─── Achievement Definitions ───────────────────────────── */

const ACHIEVEMENTS = [
  // ── Beginner (Tier 1) ─────────────────────────────────
  {
    id: 'first_100_xp',
    title: 'First Steps',
    desc: 'Earn your first 100 XP.',
    tier: 'beginner',
    icon: '⭐',
    xpReward: 25,
    condition: (s) => s.totalXpEarned >= 100
  },
  {
    id: 'first_productive_day',
    title: 'Productive Day',
    desc: 'Earn 50+ productive XP in a single day.',
    tier: 'beginner',
    icon: '🌱',
    xpReward: 25,
    condition: (s) => s.dailyProductiveXp >= 50
  },
  {
    id: 'level_2',
    title: 'Level Up!',
    desc: 'Reach Level 2.',
    tier: 'beginner',
    icon: '🔰',
    xpReward: 25,
    condition: (s) => s.level >= 2
  },
  {
    id: 'first_combo',
    title: 'Combo Starter',
    desc: 'Activate your first combo multiplier.',
    tier: 'beginner',
    icon: '⚡',
    xpReward: 15,
    condition: (s) => (s.comboMultiplier || 1) > 1
  },
  {
    id: 'first_session_30min',
    title: 'Deep Focus',
    desc: 'Complete a 30-minute focused session.',
    tier: 'beginner',
    icon: '🎯',
    xpReward: 30,
    condition: (s) => s.longestSessionMinutes >= 30
  },

  // ── Intermediate (Tier 2) ─────────────────────────────
  {
    id: 'streak_7',
    title: 'Week Warrior',
    desc: 'Maintain a 7-day productive streak.',
    tier: 'intermediate',
    icon: '🔥',
    xpReward: 75,
    condition: (s) => s.currentStreak >= 7
  },
  {
    id: 'level_5',
    title: 'Apprentice',
    desc: 'Reach Level 5.',
    tier: 'intermediate',
    icon: '⚔️',
    xpReward: 50,
    condition: (s) => s.level >= 5
  },
  {
    id: 'total_1000_xp',
    title: 'XP Hunter',
    desc: 'Earn a lifetime total of 1,000 XP.',
    tier: 'intermediate',
    icon: '💎',
    xpReward: 75,
    condition: (s) => s.totalXpEarned >= 1000
  },
  {
    id: 'combo_2x',
    title: 'Double Trouble',
    desc: 'Reach a 2x combo multiplier.',
    tier: 'intermediate',
    icon: '🔷',
    xpReward: 50,
    condition: (s) => (s.comboMultiplier || 1) >= 2.0
  },
  {
    id: 'focus_score_80',
    title: 'Sharp Mind',
    desc: 'Achieve a daily Focus Score of 80+.',
    tier: 'intermediate',
    icon: '🧠',
    xpReward: 50,
    condition: (s) => s.focusScore >= 80
  },
  {
    id: 'domains_5',
    title: 'Explorer',
    desc: 'Visit 5+ different productive domains in one day.',
    tier: 'intermediate',
    icon: '🗺️',
    xpReward: 40,
    condition: (s) => s.uniqueProductiveDomains >= 5
  },

  // ── Advanced (Tier 3) ─────────────────────────────────
  {
    id: 'streak_30',
    title: 'Monthly Master',
    desc: 'Maintain a 30-day productive streak.',
    tier: 'advanced',
    icon: '🏆',
    xpReward: 200,
    condition: (s) => s.currentStreak >= 30
  },
  {
    id: 'total_5000_xp',
    title: 'XP Legend',
    desc: 'Earn a lifetime total of 5,000 XP.',
    tier: 'advanced',
    icon: '👑',
    xpReward: 200,
    condition: (s) => s.totalXpEarned >= 5000
  },
  {
    id: 'level_10',
    title: 'Veteran',
    desc: 'Reach Level 10.',
    tier: 'advanced',
    icon: '🛡️',
    xpReward: 150,
    condition: (s) => s.level >= 10
  },
  {
    id: 'focus_score_90',
    title: 'Laser Focus',
    desc: 'Achieve a daily Focus Score of 90+.',
    tier: 'advanced',
    icon: '🔬',
    xpReward: 100,
    condition: (s) => s.focusScore >= 90
  },
  {
    id: 'early_bird_5',
    title: 'Early Bird',
    desc: 'Earn XP before 8 AM for 5 different days.',
    tier: 'advanced',
    icon: '🌅',
    xpReward: 100,
    condition: (s) => s.earlyBirdDays >= 5
  },
  {
    id: 'night_owl_5',
    title: 'Night Owl',
    desc: 'Earn XP after 9 PM for 5 different days.',
    tier: 'advanced',
    icon: '🦉',
    xpReward: 100,
    condition: (s) => s.nightOwlDays >= 5
  },
  {
    id: 'session_60min',
    title: 'Marathon Focus',
    desc: 'Complete a single 60-minute focused session.',
    tier: 'advanced',
    icon: '🏃',
    xpReward: 125,
    condition: (s) => s.longestSessionMinutes >= 60
  },
  {
    id: 'combo_max',
    title: 'ULTRA COMBO',
    desc: 'Reach the maximum 2.5x combo multiplier.',
    tier: 'advanced',
    icon: '💥',
    xpReward: 150,
    condition: (s) => (s.comboMultiplier || 1) >= 2.5
  },

  // ── Elite (Tier 4) ────────────────────────────────────
  {
    id: 'streak_100',
    title: 'Century Streak',
    desc: 'Maintain a 100-day productive streak.',
    tier: 'elite',
    icon: '🌟',
    xpReward: 500,
    condition: (s) => s.currentStreak >= 100
  },
  {
    id: 'level_15',
    title: 'Grandmaster',
    desc: 'Reach Level 15.',
    tier: 'elite',
    icon: '🐉',
    xpReward: 300,
    condition: (s) => s.level >= 15
  },
  {
    id: 'total_20000_xp',
    title: 'Transcendent',
    desc: 'Earn a lifetime total of 20,000 XP.',
    tier: 'elite',
    icon: '✨',
    xpReward: 500,
    condition: (s) => s.totalXpEarned >= 20000
  },
  {
    id: 'perfect_week',
    title: 'Perfect Week',
    desc: 'Achieve 80+ Focus Score every day for 7 consecutive days.',
    tier: 'elite',
    icon: '💯',
    xpReward: 400,
    condition: (s) => s.perfectWeekDays >= 7
  },

  // ── Legendary (Tier 5 — Hidden) ───────────────────────
  {
    id: 'level_30',
    title: 'Legend',
    desc: 'Reach Level 30. Only the most dedicated reach this height.',
    tier: 'legendary',
    icon: '🌠',
    xpReward: 1000,
    hidden: true,
    condition: (s) => s.level >= 30
  },
  {
    id: 'streak_365',
    title: 'Year of Focus',
    desc: 'Maintain a 365-day productive streak.',
    tier: 'legendary',
    icon: '🏛️',
    xpReward: 2000,
    hidden: true,
    condition: (s) => s.currentStreak >= 365
  },
  {
    id: 'total_100000_xp',
    title: 'Ascended',
    desc: 'Earn a lifetime total of 100,000 XP. You are beyond mortal browsing.',
    tier: 'legendary',
    icon: '🌌',
    xpReward: 2500,
    hidden: true,
    condition: (s) => s.totalXpEarned >= 100000
  }
];

/* ─── Tier Metadata ─────────────────────────────────────── */

const TIER_CONFIG = Object.freeze({
  beginner:     { order: 1, label: 'Beginner',     color: '#8b949e', glow: 'rgba(139,148,158,0.3)' },
  intermediate: { order: 2, label: 'Intermediate', color: '#58a6ff', glow: 'rgba(88,166,255,0.3)' },
  advanced:     { order: 3, label: 'Advanced',     color: '#a855f7', glow: 'rgba(168,85,247,0.3)' },
  elite:        { order: 4, label: 'Elite',        color: '#FFD700', glow: 'rgba(255,215,0,0.3)' },
  legendary:    { order: 5, label: 'Legendary',    color: '#FF6B6B', glow: 'rgba(255,107,107,0.3)' }
});

/* ─── Evaluator ─────────────────────────────────────────── */

/**
 * Check all achievements against current stats.
 * Returns newly unlocked achievements + bonus XP to add.
 */
function evaluate(stats, unlocked = {}) {
  const newlyUnlocked = [];
  const updatedMap = { ...unlocked };
  let bonusXp = 0;

  for (const ach of ACHIEVEMENTS) {
    if (updatedMap[ach.id]?.unlocked) continue;

    if (ach.condition(stats)) {
      updatedMap[ach.id] = {
        unlocked: true,
        timestamp: new Date().toISOString()
      };
      newlyUnlocked.push(ach);
      bonusXp += (ach.xpReward || 0);
    }
  }

  return { newlyUnlocked, updatedMap, bonusXp };
}

/**
 * Get full list of achievements with unlock status merged in.
 * Hidden achievements are shown as ??? until unlocked.
 */
function getAllWithStatus(unlocked = {}) {
  return ACHIEVEMENTS.map((a) => {
    const isUnlocked = !!unlocked[a.id]?.unlocked;
    const isHidden = a.hidden && !isUnlocked;

    return {
      id: a.id,
      title: isHidden ? '???' : a.title,
      desc: isHidden ? 'Hidden achievement — keep exploring!' : a.desc,
      tier: a.tier,
      icon: isHidden ? '❓' : a.icon,
      xpReward: a.xpReward || 0,
      hidden: !!a.hidden,
      unlocked: isUnlocked,
      unlockedAt: unlocked[a.id]?.timestamp ?? null,
      tierConfig: TIER_CONFIG[a.tier] || TIER_CONFIG.beginner
    };
  });
}

/**
 * Count unlocked achievements.
 */
function countUnlocked(unlocked = {}) {
  return Object.values(unlocked).filter((v) => v.unlocked).length;
}

/**
 * Get completion percentage by tier.
 */
function getCompletionByTier(unlocked = {}) {
  const result = {};
  for (const tier of Object.keys(TIER_CONFIG)) {
    const total = ACHIEVEMENTS.filter((a) => a.tier === tier).length;
    const done  = ACHIEVEMENTS.filter((a) => a.tier === tier && unlocked[a.id]?.unlocked).length;
    result[tier] = { total, done, percent: total > 0 ? Math.round((done / total) * 100) : 0 };
  }
  return result;
}

/**
 * Get rarity score — how rare an achievement is (0–100, 100 = rarest).
 */
function getRarity(achievementId) {
  const ach = ACHIEVEMENTS.find((a) => a.id === achievementId);
  if (!ach) return 0;
  const tierOrder = TIER_CONFIG[ach.tier]?.order || 1;
  return Math.min(100, tierOrder * 20);
}

/* ─── Exports ───────────────────────────────────────────── */

const AchievementEngine = {
  ACHIEVEMENTS,
  TIER_CONFIG,
  evaluate,
  getAllWithStatus,
  countUnlocked,
  getCompletionByTier,
  getRarity
};

if (typeof globalThis !== 'undefined') {
  globalThis.AchievementEngine = AchievementEngine;
}

export default AchievementEngine;
