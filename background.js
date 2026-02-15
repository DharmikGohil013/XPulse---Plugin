/**
 * ============================================================
 *  XPulse v2 — Background Service Worker (Manifest V3)
 * ============================================================
 *  Complete productivity engine with:
 *    - Active tab tracking with session management
 *    - 60 s alarm-driven XP ticks with combo multipliers
 *    - Time-of-day bonuses and streak bonuses
 *    - Focus Score computation
 *    - Hourly heatmap and domain analytics
 *    - Achievement evaluation with bonus XP
 *    - Distraction warnings (escalating)
 *    - In-page toast notifications via content script
 *    - Badge with real-time level/xp flash
 *    - Full message API for popup, options, and content scripts
 * ============================================================
 */

import StorageManager      from './utils/storageManager.js';
import XpEngine            from './utils/xpEngine.js';
import StreakEngine         from './utils/streakEngine.js';
import AchievementEngine   from './utils/achievementEngine.js';
import AnalyticsEngine     from './utils/analyticsEngine.js';
import NotificationEngine  from './utils/notificationEngine.js';

/* ──────────────────────────────────────────────────────────
 *  Constants
 * ──────────────────────────────────────────────────────── */

const TICK_INTERVAL_NAME     = 'xpulse-tick';
const TICK_PERIOD_MINUTES    = 1;
const IDLE_THRESHOLD_SECONDS = 120;

/* ──────────────────────────────────────────────────────────
 *  Runtime State (service-worker-scoped, non-persistent)
 * ──────────────────────────────────────────────────────── */

let activeTabId    = null;
let activeTabUrl   = null;
let isUserActive   = true;
let lastXpFlash    = 0;
let recentNotifications = [];   // rolling window for dedup

/* ──────────────────────────────────────────────────────────
 *  Initialisation
 * ──────────────────────────────────────────────────────── */

chrome.runtime.onInstalled.addListener(async (details) => {
  await StorageManager.init();
  chrome.alarms.create(TICK_INTERVAL_NAME, { periodInMinutes: TICK_PERIOD_MINUTES });
  chrome.idle.setDetectionInterval(IDLE_THRESHOLD_SECONDS);

  if (details.reason === 'install') {
    console.log('[XPulse] Installed — welcome to the grind!');
    await updateBadge();
  }
});

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

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  await handleTabSwitch(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.url) {
    activeTabUrl = changeInfo.url;
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await finalizeCurrentSession();
    activeTabId  = null;
    activeTabUrl = null;
    return;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, windowId });
    if (tab) await handleTabSwitch(tab.id);
  } catch { /* ignore */ }
});

async function handleTabSwitch(tabId) {
  try {
    // Finalize previous session before switching
    await finalizeCurrentSession();

    const tab = await chrome.tabs.get(tabId);
    activeTabId  = tabId;
    activeTabUrl = tab.url || null;

    // Start new session
    if (activeTabUrl) {
      const domain = XpEngine.extractDomain(activeTabUrl);
      if (domain) {
        const settings = await StorageManager.getSettings();
        const category = XpEngine.classifyDomain(domain, settings.customCategories || {});
        const session = AnalyticsEngine.createSession(domain, category);
        await StorageManager.set({ currentSession: session });
      }
    }
  } catch {
    activeTabId  = null;
    activeTabUrl = null;
  }
}

async function finalizeCurrentSession() {
  const { currentSession } = await StorageManager.get('currentSession');
  if (currentSession && currentSession.startTime) {
    const ended = AnalyticsEngine.endSession(currentSession);
    if (ended && ended.duration > 30) {  // only save sessions > 30 seconds
      await StorageManager.saveSession(ended);

      // Track longest session
      const sessionMin = Math.floor(ended.duration / 60);
      const { longestSessionMinutes } = await StorageManager.get('longestSessionMinutes');
      if (sessionMin > (longestSessionMinutes || 0)) {
        await StorageManager.set({ longestSessionMinutes: sessionMin });
      }

      // Send session summary to content script
      if (ended.duration > 120 && ended.xpEarned !== 0) {
        const notif = NotificationEngine.createNotification(
          NotificationEngine.NOTIFICATION_TYPES.SESSION_SUMMARY,
          { domain: ended.domain, duration: AnalyticsEngine.formatDuration(sessionMin), xp: ended.xpEarned }
        );
        await sendToActiveTab(notif);
      }
    }
    await StorageManager.set({ currentSession: null });
  }
}

/* ──────────────────────────────────────────────────────────
 *  Idle Detection
 * ──────────────────────────────────────────────────────── */

chrome.idle.onStateChanged.addListener((state) => {
  isUserActive = (state === 'active');
});

/* ──────────────────────────────────────────────────────────
 *  Alarm Tick — Main XP Engine Loop
 * ──────────────────────────────────────────────────────── */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TICK_INTERVAL_NAME) return;
  await processTick();
});

async function processTick() {
  // ── Guard ────────────────────────────────────────────
  if (!isUserActive || !activeTabUrl) return;

  await StorageManager.ensureDailyBucket();
  await dayRollCheck();

  // ── Domain classification ────────────────────────────
  const domain = XpEngine.extractDomain(activeTabUrl);
  if (!domain) return;

  const settings = await StorageManager.getSettings();
  const category = XpEngine.classifyDomain(domain, settings.customCategories || {});

  // ── Read full state ──────────────────────────────────
  const state = await StorageManager.get([
    'xp', 'level', 'totalXpEarned', 'totalMinutesTracked',
    'dailyProductiveXp', 'dailyDistractingXp', 'dailyNeutralXp',
    'dailyProductiveMinutes', 'dailyDistractingMinutes', 'dailyNeutralMinutes',
    'currentStreak', 'longestStreak', 'lastActiveDate',
    'achievements', 'levelUpTimestamps',
    'consecutiveProductiveMinutes', 'currentComboMultiplier',
    'highestCombo', 'consecutiveDistractingTicks',
    'hourlyHeatmap', 'domainStats', 'todayUniqueDomains',
    'currentSession', 'focusScore', 'todayFocusScores',
    'earlyBirdDays', 'nightOwlDays', 'earlyBirdDates', 'nightOwlDates',
    'longestSessionMinutes', 'perfectWeekDays'
  ]);

  let xp                  = state.xp ?? 0;
  let totalXpEarned       = state.totalXpEarned ?? 0;
  let totalMinutes        = state.totalMinutesTracked ?? 0;
  let level               = state.level ?? 1;
  let dailyProd           = state.dailyProductiveXp ?? 0;
  let dailyDist           = state.dailyDistractingXp ?? 0;
  let dailyNeut           = state.dailyNeutralXp ?? 0;
  let dailyProdMin        = state.dailyProductiveMinutes ?? 0;
  let dailyDistMin        = state.dailyDistractingMinutes ?? 0;
  let dailyNeutMin        = state.dailyNeutralMinutes ?? 0;
  let achievements        = state.achievements ?? {};
  let timestamps          = state.levelUpTimestamps ?? [];
  let consecProd          = state.consecutiveProductiveMinutes ?? 0;
  let comboMult           = state.currentComboMultiplier ?? 1.0;
  let highestCombo        = state.highestCombo ?? 1.0;
  let consecDist          = state.consecutiveDistractingTicks ?? 0;
  let heatmap             = state.hourlyHeatmap || AnalyticsEngine.emptyHourlyHeatmap();
  let domainStats         = state.domainStats ?? {};
  let uniqueDomains       = state.todayUniqueDomains ?? [];
  let currentSession      = state.currentSession;
  let focusScore          = state.focusScore ?? 0;
  let focusScores         = state.todayFocusScores ?? [];
  let earlyBirdDays       = state.earlyBirdDays ?? 0;
  let nightOwlDays        = state.nightOwlDays ?? 0;
  let earlyBirdDates      = state.earlyBirdDates ?? [];
  let nightOwlDates       = state.nightOwlDates ?? [];
  let perfectWeekDays     = state.perfectWeekDays ?? 0;
  let longestSessionMin   = state.longestSessionMinutes ?? 0;

  let streakData = {
    currentStreak:  state.currentStreak ?? 0,
    longestStreak:  state.longestStreak ?? 0,
    lastActiveDate: state.lastActiveDate ?? null
  };

  // ── Combo System ─────────────────────────────────────
  if (category === 'productive') {
    consecProd += 1;
    consecDist = 0;
    const combo = XpEngine.getComboMultiplier(consecProd);
    const prevMult = comboMult;
    comboMult = combo.multiplier;
    highestCombo = Math.max(highestCombo, comboMult);

    // Notify on combo tier change
    if (comboMult > prevMult && combo.label && settings.showNotifications) {
      const notif = NotificationEngine.createNotification(
        NotificationEngine.NOTIFICATION_TYPES.COMBO,
        { multiplier: comboMult, minutes: consecProd }
      );
      await sendToActiveTab(notif);
    }
  } else if (category === 'distracting') {
    if (consecProd > 0) consecProd = 0;
    comboMult = 1.0;
    consecDist += 1;

    // Escalating distraction warnings
    if (settings.showDistractionWarnings) {
      const warning = NotificationEngine.getDistractionWarning(consecDist);
      if (warning) await sendToActiveTab(warning);
    }
  } else {
    // Neutral doesn't break combo but doesn't build it either
    consecDist = 0;
  }

  // ── Calculate XP with all modifiers ──────────────────
  const xpResult = XpEngine.calculateTickXpAdvanced(
    category, comboMult, streakData.currentStreak
  );
  const xpDelta = xpResult.total;

  // ── Apply XP ─────────────────────────────────────────
  xp = XpEngine.applyXp(xp, xpDelta);
  if (xpDelta > 0) totalXpEarned += xpDelta;
  totalMinutes += 1;

  // Daily counters
  if (category === 'productive')  { dailyProd += Math.abs(xpDelta); dailyProdMin += 1; }
  if (category === 'distracting') { dailyDist += Math.abs(xpDelta); dailyDistMin += 1; }
  if (category === 'neutral')     { dailyNeut += Math.abs(xpDelta); dailyNeutMin += 1; }

  // ── Update session XP ────────────────────────────────
  if (currentSession) {
    currentSession.xpEarned += xpDelta;
    currentSession.ticks += 1;
  }

  // ── Hourly heatmap ───────────────────────────────────
  heatmap = AnalyticsEngine.recordHourlyTick(heatmap, category, xpDelta);

  // ── Domain stats ─────────────────────────────────────
  domainStats = AnalyticsEngine.recordDomainVisit(domainStats, domain, category, xpDelta);

  // Unique productive domains today
  if (category === 'productive' && !uniqueDomains.includes(domain)) {
    uniqueDomains.push(domain);
  }

  // ── Time-of-day tracking ─────────────────────────────
  const hour = new Date().getHours();
  const todayISO = StreakEngine.todayISO();
  if (hour >= 5 && hour < 8 && category === 'productive') {
    if (!earlyBirdDates.includes(todayISO)) {
      earlyBirdDates.push(todayISO);
      earlyBirdDays = earlyBirdDates.length;
    }
  }
  if (hour >= 21 && hour < 24 && category === 'productive') {
    if (!nightOwlDates.includes(todayISO)) {
      nightOwlDates.push(todayISO);
      nightOwlDays = nightOwlDates.length;
    }
  }

  // ── Focus Score ──────────────────────────────────────
  focusScore = AnalyticsEngine.calculateFocusScore({
    dailyProductiveXp: dailyProd,
    dailyDistractingXp: dailyDist,
    dailyNeutralXp: dailyNeut,
    currentStreak: streakData.currentStreak,
    comboMultiplier: comboMult
  });
  focusScores.push(focusScore);
  if (focusScores.length > 1440) focusScores = focusScores.slice(-1440);

  // Perfect week tracking
  if (focusScore >= 80) {
    // Will be evaluated at day roll
  }

  // ── Level-up check ───────────────────────────────────
  const levelResult = XpEngine.evaluateLevelUp(xp, level);
  if (levelResult.levelsGained > 0) {
    for (let l = level + 1; l <= levelResult.newLevel; l++) {
      timestamps.push({ level: l, timestamp: new Date().toISOString() });
    }
    level = levelResult.newLevel;
    showLevelUpNotification(level);

    // Send toast to content script
    if (settings.showNotifications) {
      const notif = NotificationEngine.createNotification(
        NotificationEngine.NOTIFICATION_TYPES.LEVEL_UP,
        { level }
      );
      await sendToActiveTab(notif);
    }
  }

  // ── Streak check ─────────────────────────────────────
  if (dailyProd >= StreakEngine.DAILY_PRODUCTIVE_THRESHOLD) {
    const prevStreak = streakData.currentStreak;
    streakData = StreakEngine.markTodayQualified(streakData);

    if (streakData.currentStreak > prevStreak && streakData.currentStreak > 1 && settings.showNotifications) {
      const notif = NotificationEngine.createNotification(
        NotificationEngine.NOTIFICATION_TYPES.STREAK,
        { days: streakData.currentStreak }
      );
      await sendToActiveTab(notif);
    }
  }

  // ── Milestone check ──────────────────────────────────
  const milestone = AnalyticsEngine.getNextMilestone(totalXpEarned - xpDelta);
  const newMilestone = AnalyticsEngine.getNextMilestone(totalXpEarned);
  if (milestone.label !== newMilestone.label && newMilestone.progress >= 100 && settings.showNotifications) {
    // Crossed a milestone
    const currentTitle = AnalyticsEngine.getCurrentTitle(totalXpEarned);
    const notif = NotificationEngine.createNotification(
      NotificationEngine.NOTIFICATION_TYPES.MILESTONE,
      { label: currentTitle.label, xp: totalXpEarned }
    );
    await sendToActiveTab(notif);
  }

  // ── Achievement check ────────────────────────────────
  const achStats = {
    totalXpEarned,
    level,
    currentStreak: streakData.currentStreak,
    dailyProductiveXp: dailyProd,
    comboMultiplier: comboMult,
    focusScore,
    longestSessionMinutes: longestSessionMin,
    uniqueProductiveDomains: uniqueDomains.length,
    earlyBirdDays,
    nightOwlDays,
    perfectWeekDays
  };
  const achResult = AchievementEngine.evaluate(achStats, achievements);
  achievements = achResult.updatedMap;

  // Add achievement bonus XP
  if (achResult.bonusXp > 0) {
    xp = XpEngine.applyXp(xp, achResult.bonusXp);
    totalXpEarned += achResult.bonusXp;
  }

  if (achResult.newlyUnlocked.length > 0) {
    for (const ach of achResult.newlyUnlocked) {
      showAchievementNotification(ach);
      if (settings.showNotifications) {
        const notif = NotificationEngine.createNotification(
          NotificationEngine.NOTIFICATION_TYPES.ACHIEVEMENT,
          ach
        );
        await sendToActiveTab(notif);
        await StorageManager.addNotification(notif);
      }
    }
  }

  // ── Send XP toast to content script ──────────────────
  if (settings.showXpToasts && xpDelta !== 0) {
    const type = xpDelta > 0
      ? NotificationEngine.NOTIFICATION_TYPES.XP_GAIN
      : NotificationEngine.NOTIFICATION_TYPES.XP_LOSS;
    const notif = NotificationEngine.createNotification(type, { xp: xpDelta, domain });
    if (NotificationEngine.shouldShow(notif, recentNotifications, 10000)) {
      await sendToActiveTab(notif);
      recentNotifications.push(notif);
      // Keep last 20
      if (recentNotifications.length > 20) recentNotifications.shift();
    }
  }

  // ── Persist everything atomically ────────────────────
  await StorageManager.set({
    xp, level, totalXpEarned, totalMinutesTracked: totalMinutes,
    dailyProductiveXp: dailyProd, dailyDistractingXp: dailyDist, dailyNeutralXp: dailyNeut,
    dailyProductiveMinutes: dailyProdMin, dailyDistractingMinutes: dailyDistMin, dailyNeutralMinutes: dailyNeutMin,
    currentStreak: streakData.currentStreak, longestStreak: streakData.longestStreak, lastActiveDate: streakData.lastActiveDate,
    achievements, levelUpTimestamps: timestamps,
    consecutiveProductiveMinutes: consecProd, currentComboMultiplier: comboMult,
    highestCombo, consecutiveDistractingTicks: consecDist,
    hourlyHeatmap: heatmap, domainStats, todayUniqueDomains: uniqueDomains,
    currentSession, focusScore, todayFocusScores: focusScores,
    earlyBirdDays, nightOwlDays, earlyBirdDates, nightOwlDates,
    perfectWeekDays
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
    'currentStreak', 'longestStreak', 'lastActiveDate',
    'focusScore', 'perfectWeekDays', 'weeklyStats'
  ]);

  if (state.dailyDate === today) return;

  // Evaluate yesterday's streak
  const streakInput = {
    currentStreak:     state.currentStreak ?? 0,
    longestStreak:     state.longestStreak ?? 0,
    lastActiveDate:    state.lastActiveDate ?? null,
    dailyProductiveXp: state.dailyProductiveXp ?? 0
  };
  const newStreak = StreakEngine.evaluateStreak(streakInput);

  // Perfect week tracking: if yesterday's focus score was 80+
  let perfectDays = state.perfectWeekDays ?? 0;
  if ((state.focusScore ?? 0) >= 80) {
    perfectDays += 1;
  } else {
    perfectDays = 0;  // reset on miss
  }

  await StorageManager.set({
    currentStreak:  newStreak.currentStreak,
    longestStreak:  newStreak.longestStreak,
    lastActiveDate: newStreak.lastActiveDate,
    perfectWeekDays: perfectDays
  });
}

/* ──────────────────────────────────────────────────────────
 *  Badge Update
 * ──────────────────────────────────────────────────────── */

async function updateBadge(level, xpDelta, category) {
  if (level === undefined) level = await StorageManager.getLevel();

  const text = `L${level}`;
  let color = '#4A90D9';
  if (category === 'productive')  color = '#00C9A7';
  if (category === 'distracting') color = '#FF6B6B';

  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });

  if (xpDelta && xpDelta > 0) {
    const now = Date.now();
    if (now - lastXpFlash > 5000) {
      lastXpFlash = now;
      await chrome.action.setBadgeText({ text: `+${xpDelta}` });
      setTimeout(async () => {
        try { await chrome.action.setBadgeText({ text: `L${level}` }); } catch {}
      }, 2000);
    }
  }
}

/* ──────────────────────────────────────────────────────────
 *  Notifications (Badge-level)
 * ──────────────────────────────────────────────────────── */

function showLevelUpNotification(level) {
  chrome.action.setBadgeText({ text: `🎉L${level}` });
  chrome.action.setBadgeBackgroundColor({ color: '#FFD700' });
  setTimeout(async () => { try { await updateBadge(level); } catch {} }, 4000);
}

function showAchievementNotification(ach) {
  chrome.action.setBadgeText({ text: ach.icon });
  chrome.action.setBadgeBackgroundColor({ color: '#A855F7' });
  setTimeout(async () => {
    try { const lvl = await StorageManager.getLevel(); await updateBadge(lvl); } catch {}
  }, 3000);
}

/* ──────────────────────────────────────────────────────────
 *  Content-Script Communication
 * ──────────────────────────────────────────────────────── */

async function sendToActiveTab(notification) {
  if (!activeTabId) return;
  try {
    await chrome.tabs.sendMessage(activeTabId, {
      type: 'XPULSE_NOTIFICATION',
      notification
    });
  } catch {
    // Tab might not have content script injected (chrome:// pages etc.)
  }
}

/* ──────────────────────────────────────────────────────────
 *  Message API
 * ──────────────────────────────────────────────────────── */

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((err) => {
    console.error('[XPulse] message error', err);
    sendResponse({ error: err.message });
  });
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case 'GET_STATE': {
      const state = await StorageManager.getAll();
      const level = state.level ?? 1;
      const rank = XpEngine.getRankTitle(level);
      const prestige = XpEngine.getPrestige(level);
      const trend = AnalyticsEngine.computeTrend(state.weeklyStats ?? []);
      const milestone = AnalyticsEngine.getNextMilestone(state.totalXpEarned ?? 0);
      const currentTitle = AnalyticsEngine.getCurrentTitle(state.totalXpEarned ?? 0);
      const gradeInfo = AnalyticsEngine.focusGrade(state.focusScore ?? 0);

      return {
        // Core
        xp: state.xp ?? 0,
        level,
        totalXpEarned:    state.totalXpEarned ?? 0,
        totalMinutes:     state.totalMinutesTracked ?? 0,
        progressPercent:  XpEngine.progressPercent(state.xp ?? 0, level),
        xpForNext:        XpEngine.xpForLevel(level + 1),
        xpForCurrent:     XpEngine.xpForLevel(level),

        // Rank & Prestige
        rank,
        prestige,

        // Streak
        currentStreak:   state.currentStreak ?? 0,
        longestStreak:   state.longestStreak ?? 0,

        // Daily
        dailyProductiveXp:   state.dailyProductiveXp ?? 0,
        dailyDistractingXp:  state.dailyDistractingXp ?? 0,
        dailyNeutralXp:      state.dailyNeutralXp ?? 0,
        dailyProductiveMin:  state.dailyProductiveMinutes ?? 0,
        dailyDistractingMin: state.dailyDistractingMinutes ?? 0,
        dailyNeutralMin:     state.dailyNeutralMinutes ?? 0,

        // Combo
        comboMultiplier: state.currentComboMultiplier ?? 1.0,
        highestCombo:    state.highestCombo ?? 1.0,
        comboMinutes:    state.consecutiveProductiveMinutes ?? 0,
        comboInfo:       XpEngine.getComboMultiplier(state.consecutiveProductiveMinutes ?? 0),

        // Analytics
        focusScore:      state.focusScore ?? 0,
        focusGrade:      gradeInfo,
        hourlyHeatmap:   state.hourlyHeatmap || AnalyticsEngine.emptyHourlyHeatmap(),
        topDomains:      AnalyticsEngine.getTopDomains(state.domainStats ?? {}, 5),
        topDistractors:  AnalyticsEngine.getTopDistractors(state.domainStats ?? {}, 3),
        trend,
        milestone,
        currentTitle,
        peakHour:        AnalyticsEngine.getPeakHour(state.hourlyHeatmap || AnalyticsEngine.emptyHourlyHeatmap()),
        longestSession:  state.longestSessionMinutes ?? 0,
        sessions:        (state.sessions ?? []).slice(-10),

        // Achievements
        achievements:     AchievementEngine.getAllWithStatus(state.achievements ?? {}),
        achievementTiers: AchievementEngine.getCompletionByTier(state.achievements ?? {}),

        // History
        weeklyStats:  state.weeklyStats ?? [],
        monthlyStats: state.monthlyStats ?? [],

        // Settings
        settings: state.settings ?? {},

        // Time-of-day
        timeBonus: XpEngine.getTimeOfDayBonus()
      };
    }

    case 'TAB_VISIBLE':
      return { ok: true };

    case 'USER_ACTIVITY':
      return { ok: true };

    case 'RESET':
      await StorageManager.reset();
      await updateBadge();
      return { ok: true };

    case 'EXPORT':
      return { json: await StorageManager.exportJSON() };

    case 'UPDATE_SETTINGS': {
      const current = await StorageManager.getSettings();
      const merged = { ...current, ...msg.settings };
      await StorageManager.set({ settings: merged });
      return { ok: true, settings: merged };
    }

    case 'FORCE_TICK':
      await processTick();
      return { ok: true };

    case 'GET_DOMAIN_STATS':
      return { domainStats: await StorageManager.getDomainStats() };

    case 'GET_SESSIONS':
      return { sessions: (await StorageManager.get('sessions')).sessions ?? [] };

    case 'GET_HEATMAP':
      return { heatmap: (await StorageManager.get('hourlyHeatmap')).hourlyHeatmap || AnalyticsEngine.emptyHourlyHeatmap() };

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
      activeTabUrl = tab.url || null;
    }
    await StorageManager.init();
    await StorageManager.ensureDailyBucket();
    await dayRollCheck();
    await updateBadge();
  } catch (e) {
    console.error('[XPulse] startup error', e);
  }
})();
