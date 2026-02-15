/**
 * ============================================================
 *  StorageManager — Persistent State Layer for XPulse
 * ============================================================
 *  Wraps chrome.storage.local with typed accessors, default
 *  hydration, atomic batch writes, and JSON export.
 * ============================================================
 */

const DEFAULT_STATE = Object.freeze({
  xp: 0,
  level: 1,
  totalXpEarned: 0,          // lifetime XP earned (never decremented)
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,       // ISO date string "YYYY-MM-DD"
  dailyProductiveXp: 0,      // productive XP earned today
  dailyDistractingXp: 0,     // distracting XP accumulated today
  dailyNeutralXp: 0,
  dailyDate: null,            // ISO date for current daily bucket
  achievements: {},           // { id: { unlocked: bool, timestamp } }
  weeklyStats: [],            // last 7 days [{ date, productive, distracting, neutral }]
  levelUpTimestamps: [],      // [{ level, timestamp }]
  settings: {
    darkMode: true,
    devMode: false,
    customCategories: {}      // domain → "productive" | "distracting" | "neutral"
  },
  sessionStartTime: null,     // Background session bookkeeping
  lastTrackedDomain: null,
  lastTickTime: null
});

class StorageManager {
  /**
   * Initialise storage with defaults if first run.
   * Returns the hydrated state.
   */
  static async init() {
    const existing = await StorageManager.getAll();
    const merged = { ...DEFAULT_STATE, ...existing };

    // Ensure nested objects are merged properly
    merged.settings = { ...DEFAULT_STATE.settings, ...(existing.settings || {}) };
    merged.achievements = { ...DEFAULT_STATE.achievements, ...(existing.achievements || {}) };

    await chrome.storage.local.set(merged);
    return merged;
  }

  /** Get entire state object. */
  static async getAll() {
    return chrome.storage.local.get(null);
  }

  /** Get specific keys (array or single string). */
  static async get(keys) {
    return chrome.storage.local.get(keys);
  }

  /** Set one or more key-value pairs atomically. */
  static async set(obj) {
    return chrome.storage.local.set(obj);
  }

  /** Remove specific keys. */
  static async remove(keys) {
    return chrome.storage.local.remove(keys);
  }

  /* ─── Typed Accessors ─────────────────────────────────── */

  static async getXp() {
    const { xp } = await StorageManager.get('xp');
    return xp ?? 0;
  }

  static async getLevel() {
    const { level } = await StorageManager.get('level');
    return level ?? 1;
  }

  static async getStreak() {
    const { currentStreak, longestStreak, lastActiveDate } = await StorageManager.get([
      'currentStreak', 'longestStreak', 'lastActiveDate'
    ]);
    return {
      currentStreak: currentStreak ?? 0,
      longestStreak: longestStreak ?? 0,
      lastActiveDate: lastActiveDate ?? null
    };
  }

  static async getAchievements() {
    const { achievements } = await StorageManager.get('achievements');
    return achievements ?? {};
  }

  static async getWeeklyStats() {
    const { weeklyStats } = await StorageManager.get('weeklyStats');
    return weeklyStats ?? [];
  }

  static async getSettings() {
    const { settings } = await StorageManager.get('settings');
    return { ...DEFAULT_STATE.settings, ...(settings || {}) };
  }

  /* ─── Daily Stat Helpers ──────────────────────────────── */

  /** Roll over daily counters if the date changed. */
  static async ensureDailyBucket() {
    const today = new Date().toISOString().slice(0, 10);
    const { dailyDate } = await StorageManager.get('dailyDate');
    if (dailyDate !== today) {
      // Archive yesterday into weeklyStats before reset
      if (dailyDate) {
        await StorageManager._archiveDay(dailyDate);
      }
      await StorageManager.set({
        dailyDate: today,
        dailyProductiveXp: 0,
        dailyDistractingXp: 0,
        dailyNeutralXp: 0
      });
    }
  }

  /** Push a day's stats into weeklyStats, keep last 7 entries. */
  static async _archiveDay(dateStr) {
    const data = await StorageManager.get([
      'weeklyStats', 'dailyProductiveXp', 'dailyDistractingXp', 'dailyNeutralXp'
    ]);
    const stats = data.weeklyStats ?? [];
    stats.push({
      date: dateStr,
      productive: data.dailyProductiveXp ?? 0,
      distracting: data.dailyDistractingXp ?? 0,
      neutral: data.dailyNeutralXp ?? 0
    });
    // Keep only last 7 days
    while (stats.length > 7) stats.shift();
    await StorageManager.set({ weeklyStats: stats });
  }

  /* ─── Export / Reset ──────────────────────────────────── */

  static async exportJSON() {
    const data = await StorageManager.getAll();
    return JSON.stringify(data, null, 2);
  }

  /** Full factory reset — re-hydrate with defaults. */
  static async reset() {
    await chrome.storage.local.clear();
    return StorageManager.init();
  }
}

// Make available as ES module AND classic script context
if (typeof globalThis !== 'undefined') {
  globalThis.StorageManager = StorageManager;
}

export default StorageManager;
