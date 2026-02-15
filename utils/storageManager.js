/**
 * ============================================================
 *  StorageManager v2 — Enhanced Persistent State for XPulse
 * ============================================================
 *  Wraps chrome.storage.local with typed accessors, default
 *  hydration, atomic batch writes, session tracking, hourly
 *  heatmaps, domain analytics, and JSON export.
 * ============================================================
 */

const DEFAULT_STATE = Object.freeze({
  // ── Core XP & Level ──
  xp: 0,
  level: 1,
  totalXpEarned: 0,
  totalMinutesTracked: 0,

  // ── Streak ──
  currentStreak: 0,
  longestStreak: 0,
  lastActiveDate: null,

  // ── Daily Stats ──
  dailyProductiveXp: 0,
  dailyDistractingXp: 0,
  dailyNeutralXp: 0,
  dailyDate: null,
  dailyProductiveMinutes: 0,
  dailyDistractingMinutes: 0,
  dailyNeutralMinutes: 0,

  // ── Combo System ──
  consecutiveProductiveMinutes: 0,
  currentComboMultiplier: 1.0,
  highestCombo: 1.0,
  consecutiveDistractingTicks: 0,

  // ── Analytics ──
  hourlyHeatmap: null,
  domainStats: {},
  todayUniqueDomains: [],
  sessions: [],
  currentSession: null,
  focusScore: 0,
  todayFocusScores: [],
  perfectWeekDays: 0,
  earlyBirdDays: 0,
  nightOwlDays: 0,
  earlyBirdDates: [],
  nightOwlDates: [],
  longestSessionMinutes: 0,

  // ── Achievements ──
  achievements: {},

  // ── History ──
  weeklyStats: [],
  monthlyStats: [],
  levelUpTimestamps: [],
  notificationHistory: [],
  milestoneHistory: [],

  // ── Settings ──
  settings: {
    darkMode: true,
    devMode: false,
    showNotifications: true,
    showXpToasts: true,
    showDistractionWarnings: true,
    soundEnabled: false,
    customCategories: {},
    focusGoal: 70,
    dailyXpGoal: 200
  },

  // ── Session Bookkeeping ──
  sessionStartTime: null,
  lastTrackedDomain: null,
  lastTickTime: null
});

class StorageManager {
  static async init() {
    const existing = await StorageManager.getAll();
    const merged = { ...DEFAULT_STATE, ...existing };
    merged.settings = { ...DEFAULT_STATE.settings, ...(existing.settings || {}) };
    merged.achievements = { ...DEFAULT_STATE.achievements, ...(existing.achievements || {}) };
    merged.domainStats = { ...DEFAULT_STATE.domainStats, ...(existing.domainStats || {}) };
    await chrome.storage.local.set(merged);
    return merged;
  }

  static async getAll() {
    return chrome.storage.local.get(null);
  }

  static async get(keys) {
    return chrome.storage.local.get(keys);
  }

  static async set(obj) {
    return chrome.storage.local.set(obj);
  }

  static async remove(keys) {
    return chrome.storage.local.remove(keys);
  }

  /* ─── Typed Accessors ─────────────────────────────────── */

  static async getXp()    { return (await StorageManager.get('xp')).xp ?? 0; }
  static async getLevel() { return (await StorageManager.get('level')).level ?? 1; }

  static async getStreak() {
    const d = await StorageManager.get(['currentStreak', 'longestStreak', 'lastActiveDate']);
    return { currentStreak: d.currentStreak ?? 0, longestStreak: d.longestStreak ?? 0, lastActiveDate: d.lastActiveDate ?? null };
  }

  static async getAchievements() { return (await StorageManager.get('achievements')).achievements ?? {}; }
  static async getWeeklyStats()  { return (await StorageManager.get('weeklyStats')).weeklyStats ?? []; }
  static async getDomainStats()  { return (await StorageManager.get('domainStats')).domainStats ?? {}; }

  static async getSettings() {
    const { settings } = await StorageManager.get('settings');
    return { ...DEFAULT_STATE.settings, ...(settings || {}) };
  }

  static async getComboState() {
    const d = await StorageManager.get([
      'consecutiveProductiveMinutes', 'currentComboMultiplier',
      'highestCombo', 'consecutiveDistractingTicks'
    ]);
    return {
      consecutiveProductiveMinutes: d.consecutiveProductiveMinutes ?? 0,
      currentComboMultiplier: d.currentComboMultiplier ?? 1.0,
      highestCombo: d.highestCombo ?? 1.0,
      consecutiveDistractingTicks: d.consecutiveDistractingTicks ?? 0
    };
  }

  static async getAnalytics() {
    const keys = [
      'hourlyHeatmap', 'domainStats', 'sessions', 'currentSession',
      'focusScore', 'todayFocusScores', 'perfectWeekDays',
      'earlyBirdDays', 'nightOwlDays', 'longestSessionMinutes',
      'todayUniqueDomains', 'totalMinutesTracked',
      'dailyProductiveMinutes', 'dailyDistractingMinutes', 'dailyNeutralMinutes'
    ];
    return StorageManager.get(keys);
  }

  /* ─── Daily Bucket ────────────────────────────────────── */

  static async ensureDailyBucket() {
    const today = new Date().toISOString().slice(0, 10);
    const { dailyDate } = await StorageManager.get('dailyDate');
    if (dailyDate !== today) {
      if (dailyDate) {
        await StorageManager._archiveDay(dailyDate);
      }
      await StorageManager.set({
        dailyDate: today,
        dailyProductiveXp: 0,
        dailyDistractingXp: 0,
        dailyNeutralXp: 0,
        dailyProductiveMinutes: 0,
        dailyDistractingMinutes: 0,
        dailyNeutralMinutes: 0,
        hourlyHeatmap: null,
        todayUniqueDomains: [],
        todayFocusScores: [],
        consecutiveProductiveMinutes: 0,
        currentComboMultiplier: 1.0,
        consecutiveDistractingTicks: 0,
        currentSession: null,
        focusScore: 0
      });
    }
  }

  static async _archiveDay(dateStr) {
    const data = await StorageManager.get([
      'weeklyStats', 'monthlyStats',
      'dailyProductiveXp', 'dailyDistractingXp', 'dailyNeutralXp',
      'dailyProductiveMinutes', 'dailyDistractingMinutes', 'dailyNeutralMinutes',
      'focusScore', 'highestCombo'
    ]);

    const dayRecord = {
      date: dateStr,
      productive: data.dailyProductiveXp ?? 0,
      distracting: data.dailyDistractingXp ?? 0,
      neutral: data.dailyNeutralXp ?? 0,
      productiveMin: data.dailyProductiveMinutes ?? 0,
      distractingMin: data.dailyDistractingMinutes ?? 0,
      neutralMin: data.dailyNeutralMinutes ?? 0,
      focusScore: data.focusScore ?? 0,
      bestCombo: data.highestCombo ?? 1.0
    };

    const weekly = data.weeklyStats ?? [];
    weekly.push(dayRecord);
    while (weekly.length > 7) weekly.shift();

    const monthly = data.monthlyStats ?? [];
    monthly.push(dayRecord);
    while (monthly.length > 30) monthly.shift();

    await StorageManager.set({ weeklyStats: weekly, monthlyStats: monthly });
  }

  /* ─── Session Management ──────────────────────────────── */

  static async saveSession(session) {
    if (!session) return;
    const { sessions } = await StorageManager.get('sessions');
    const list = sessions ?? [];
    list.push(session);
    // Keep last 50 sessions
    while (list.length > 50) list.shift();
    await StorageManager.set({ sessions: list });
  }

  /* ─── Notification History ────────────────────────────── */

  static async addNotification(notif) {
    const { notificationHistory } = await StorageManager.get('notificationHistory');
    const history = notificationHistory ?? [];
    history.push({ type: notif.type, title: notif.title, timestamp: notif.timestamp });
    while (history.length > 100) history.shift();
    await StorageManager.set({ notificationHistory: history });
  }

  /* ─── Export / Reset ──────────────────────────────────── */

  static async exportJSON() {
    const data = await StorageManager.getAll();
    return JSON.stringify(data, null, 2);
  }

  static async reset() {
    await chrome.storage.local.clear();
    return StorageManager.init();
  }
}

if (typeof globalThis !== 'undefined') {
  globalThis.StorageManager = StorageManager;
}

export default StorageManager;
