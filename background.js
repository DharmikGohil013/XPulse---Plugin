/**
 * ============================================================
 *  XPulse — Background Service Worker (Manifest V3)
 * ============================================================
 *  Responsibilities:
 *    1. Track which tab is active and visible.
 *    2. Tick every 60 s — award / deduct XP based on category.
 *    3. Evaluate level-ups, streaks, achievements.
 *    4. Update the extension badge in real time.
 *    5. Respond to messages from popup & content scripts.
 *    6. Handle idle detection and day-roll.
 * ============================================================
 */

import StorageManager from './utils/storageManager.js';
import XpEngine       from './utils/xpEngine.js';
import StreakEngine    from './utils/streakEngine.js';
import AchievementEngine from './utils/achievementEngine.js';

/* ──────────────────────────────────────────────────────────
 *  Constants
 * ──────────────────────────────────────────────────────── */

const TICK_INTERVAL_NAME = 'xpulse-tick';
const TICK_PERIOD_MINUTES = 1;          // fire every 60 s
const IDLE_THRESHOLD_SECONDS = 120;     // 2 min idle → stop XP

/* ──────────────────────────────────────────────────────────
 *  Runtime State (lives only while service worker is awake)
 * ──────────────────────────────────────────────────────── */

let activeTabId    = null;
let activeTabUrl   = null;
let isUserActive   = true;   // flipped by idle API
let lastXpFlash    = 0;      // timestamp of last badge flash

/* ──────────────────────────────────────────────────────────
 *  Initialisation
 * ──────────────────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(async (details) => {
  await StorageManager.init();

  // Create the recurring alarm that drives XP ticks
  chrome.alarms.create(TICK_INTERVAL_NAME, { periodInMinutes: TICK_PERIOD_MINUTES });

  // Set idle detection threshold
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  if (details.reason === 'install') {
    console.log('[XPulse] Installed — welcome!');
    await updateBadge();
  }
});

// Also init on service-worker wake (alarms, messages, etc.)
chrome.runtime.onStartup.addListener(async () => {
  await StorageManager.init();
  await StorageManager.ensureDailyBucket();
  await dayRollCheck();
  await updateBadge();
  chrome.alarms.create(TICK_INTERVAL_NAME, { periodInMinutes: TICK_PERIOD_MINUTES });
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);
});

/* ──────────────────────────────────────────────────────────
 *  Tab Tracking
 * ──────────────────────────────────────────────────────── */

/** When user switches to a different tab */
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  try {
    const tab = await chrome.tabs.get(tabId);
    activeTabId  = tabId;
    activeTabUrl  = tab.url || null;
  } catch {
    activeTabId = null;
    activeTabUrl = null;
  }
});

/** When the active tab navigates */
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.url) {
    activeTabUrl = changeInfo.url;
  }
});

/** When a window gains focus (multi-window) */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    // All windows lost focus (user left Chrome)
    activeTabId  = null;
    activeTabUrl  = null;
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) {
      activeTabId  = tab.id;
      activeTabUrl  = tab.url || null;
    }
  } catch { /* ignore */ }
});

/* ──────────────────────────────────────────────────────────
 *  Idle Detection
 * ──────────────────────────────────────────────────────── */

chrome.idle.onStateChanged.addListener((state) => {
  isUserActive = (state === 'active');
});

/* ──────────────────────────────────────────────────────────
 *  Alarm Tick — XP Engine Loop
 * ──────────────────────────────────────────────────────── */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TICK_INTERVAL_NAME) return;
  await processTick();
});

async function processTick() {
  // ── Guard: user must be active with a valid tab ───────
  if (!isUserActive || !activeTabUrl) return;

  // Make sure daily bucket is current (handles day-roll)
  await StorageManager.ensureDailyBucket();
  await dayRollCheck();

  // ── Classify domain ──────────────────────────────────
  const domain = XpEngine.extractDomain(activeTabUrl);
  if (!domain) return;   // chrome:// , about:, etc.

  const settings = await StorageManager.getSettings();
  const category = XpEngine.classifyDomain(domain, settings.customCategories || {});

  // ── Calculate XP delta ───────────────────────────────
  const xpDelta = XpEngine.calculateTickXp(category);

  // ── Read current state ───────────────────────────────
  const state = await StorageManager.get([
    'xp', 'level', 'totalXpEarned',
    'dailyProductiveXp', 'dailyDistractingXp', 'dailyNeutralXp',
    'currentStreak', 'longestStreak', 'lastActiveDate',
    'achievements', 'levelUpTimestamps'
  ]);

  let xp            = state.xp ?? 0;
  let totalXpEarned = state.totalXpEarned ?? 0;
  let level         = state.level ?? 1;
  let dailyProd     = state.dailyProductiveXp ?? 0;
  let dailyDist     = state.dailyDistractingXp ?? 0;
  let dailyNeut     = state.dailyNeutralXp ?? 0;
  let achievements  = state.achievements ?? {};
  let timestamps    = state.levelUpTimestamps ?? [];
  let streakData    = {
    currentStreak:  state.currentStreak ?? 0,
    longestStreak:  state.longestStreak ?? 0,
    lastActiveDate: state.lastActiveDate ?? null
  };

  // ── Apply XP ─────────────────────────────────────────
  xp = XpEngine.applyXp(xp, xpDelta);
  if (xpDelta > 0) {
    totalXpEarned += xpDelta;
  }

  // Update daily category counters
  if (category === 'productive')  dailyProd  += Math.abs(xpDelta);
  if (category === 'distracting') dailyDist  += Math.abs(xpDelta);
  if (category === 'neutral')     dailyNeut  += Math.abs(xpDelta);

  // ── Level-up check ───────────────────────────────────
  const levelResult = XpEngine.evaluateLevelUp(xp, level);
  if (levelResult.levelsGained > 0) {
    for (let l = level + 1; l <= levelResult.newLevel; l++) {
      timestamps.push({ level: l, timestamp: new Date().toISOString() });
    }
    level = levelResult.newLevel;

    // Notify about level up
    showLevelUpNotification(level);
  }

  // ── Streak check (live qualification) ────────────────
  if (dailyProd >= StreakEngine.DAILY_PRODUCTIVE_THRESHOLD) {
    streakData = StreakEngine.markTodayQualified(streakData);
  }

  // ── Achievement check ────────────────────────────────
  const achStats = {
    totalXpEarned,
    level,
    currentStreak: streakData.currentStreak,
    dailyProductiveXp: dailyProd
  };
  const achResult = AchievementEngine.evaluate(achStats, achievements);
  achievements = achResult.updatedMap;

  if (achResult.newlyUnlocked.length > 0) {
    for (const ach of achResult.newlyUnlocked) {
      showAchievementNotification(ach);
    }
  }

  // ── Persist everything atomically ────────────────────
  await StorageManager.set({
    xp,
    level,
    totalXpEarned,
    dailyProductiveXp:  dailyProd,
    dailyDistractingXp: dailyDist,
    dailyNeutralXp:     dailyNeut,
    currentStreak:      streakData.currentStreak,
    longestStreak:      streakData.longestStreak,
    lastActiveDate:     streakData.lastActiveDate,
    achievements,
    levelUpTimestamps:  timestamps
  });

  // ── Update badge ─────────────────────────────────────
  await updateBadge(level, xpDelta, category);
}

/* ──────────────────────────────────────────────────────────
 *  Day-Roll / Streak Evaluation
 * ──────────────────────────────────────────────────────── */

async function dayRollCheck() {
  const today = StreakEngine.todayISO();
  const state = await StorageManager.get([
    'dailyDate', 'dailyProductiveXp',
    'currentStreak', 'longestStreak', 'lastActiveDate'
  ]);

  // If dailyDate is already today nothing to roll
  if (state.dailyDate === today) return;

  // Day changed — evaluate streak with *yesterday's* productive XP
  const streakInput = {
    currentStreak:   state.currentStreak ?? 0,
    longestStreak:   state.longestStreak ?? 0,
    lastActiveDate:  state.lastActiveDate ?? null,
    dailyProductiveXp: state.dailyProductiveXp ?? 0
  };

  const newStreak = StreakEngine.evaluateStreak(streakInput);
  await StorageManager.set({
    currentStreak:  newStreak.currentStreak,
    longestStreak:  newStreak.longestStreak,
    lastActiveDate: newStreak.lastActiveDate
  });
}

/* ──────────────────────────────────────────────────────────
 *  Badge Update
 * ──────────────────────────────────────────────────────── */

async function updateBadge(level, xpDelta, category) {
  if (level === undefined) {
    level = await StorageManager.getLevel();
  }

  const text = `L${level}`;

  // Choose color based on last tick category
  let color = '#4A90D9';  // default blue
  if (category === 'productive')  color = '#00C9A7';
  if (category === 'distracting') color = '#FF6B6B';

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });

  // Flash "+XP" briefly on gain
  if (xpDelta && xpDelta > 0) {
    const now = Date.now();
    if (now - lastXpFlash > 5000) {  // throttle flashes
      lastXpFlash = now;
      await chrome.action.setBadgeText({ text: `+${xpDelta}` });
      setTimeout(async () => {
        try {
          await chrome.action.setBadgeText({ text: `L${level}` });
        } catch { /* service worker may have gone idle */ }
      }, 2000);
    }
  }
}

/* ──────────────────────────────────────────────────────────
 *  Notifications
 * ──────────────────────────────────────────────────────── */

function showLevelUpNotification(level) {
  // Use badge flash (notifications require extra permission)
  chrome.action.setBadgeText({ text: `🎉L${level}` });
  chrome.action.setBadgeBackgroundColor({ color: '#FFD700' });
  setTimeout(async () => {
    try { await updateBadge(level); } catch {}
  }, 4000);
}

function showAchievementNotification(ach) {
  chrome.action.setBadgeText({ text: ach.icon });
  chrome.action.setBadgeBackgroundColor({ color: '#A855F7' });
  setTimeout(async () => {
    try {
      const lvl = await StorageManager.getLevel();
      await updateBadge(lvl);
    } catch {}
  }, 3000);
}

/* ──────────────────────────────────────────────────────────
 *  Message API — communication with popup & content scripts
 * ──────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    console.error('[XPulse] message error', err);
    sendResponse({ error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg) {
  switch (msg.type) {
    /* ── Popup requests full state ──────────────────────── */
    case 'GET_STATE': {
      const state = await StorageManager.getAll();
      const level = state.level ?? 1;
      return {
        xp:               state.xp ?? 0,
        level,
        totalXpEarned:    state.totalXpEarned ?? 0,
        progressPercent:  XpEngine.progressPercent(state.xp ?? 0, level),
        xpForNext:        XpEngine.xpForLevel(level + 1),
        xpForCurrent:     XpEngine.xpForLevel(level),
        currentStreak:    state.currentStreak ?? 0,
        longestStreak:    state.longestStreak ?? 0,
        dailyProductiveXp:  state.dailyProductiveXp ?? 0,
        dailyDistractingXp: state.dailyDistractingXp ?? 0,
        dailyNeutralXp:     state.dailyNeutralXp ?? 0,
        achievements:     AchievementEngine.getAllWithStatus(state.achievements ?? {}),
        weeklyStats:      state.weeklyStats ?? [],
        settings:         state.settings ?? {}
      };
    }

    /* ── Content script reports visibility ──────────────── */
    case 'TAB_VISIBLE': {
      // Content script may confirm the active tab is truly visible
      // We already track via tabs API, but this is a secondary signal
      return { ok: true };
    }

    /* ── Reset (dev mode) ──────────────────────────────── */
    case 'RESET': {
      await StorageManager.reset();
      await updateBadge();
      return { ok: true };
    }

    /* ── Export stats ───────────────────────────────────── */
    case 'EXPORT': {
      const json = await StorageManager.exportJSON();
      return { json };
    }

    /* ── Update settings ───────────────────────────────── */
    case 'UPDATE_SETTINGS': {
      const current = await StorageManager.getSettings();
      const merged = { ...current, ...msg.settings };
      await StorageManager.set({ settings: merged });
      return { ok: true, settings: merged };
    }

    /* ── Force tick (debug) ─────────────────────────────── */
    case 'FORCE_TICK': {
      await processTick();
      return { ok: true };
    }

    default:
      return { error: 'Unknown message type' };
  }
}

/* ──────────────────────────────────────────────────────────
 *  Startup — resolve active tab immediately
 * ──────────────────────────────────────────────────────── */

(async () => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      activeTabId  = tab.id;
      activeTabUrl  = tab.url || null;
    }
    await StorageManager.init();
    await StorageManager.ensureDailyBucket();
    await dayRollCheck();
    await updateBadge();
  } catch (e) {
    console.error('[XPulse] startup error', e);
  }
})();
