/**
 * ============================================================
 *  Analytics Engine — Deep Productivity Intelligence for XPulse
 * ============================================================
 *  Tracks sessions, hourly heatmaps, domain frequency,
 *  focus scores, productivity trends, and time analytics.
 *  Pure-function module — no storage I/O.
 * ============================================================
 */

/* ─── Focus Score Algorithm ─────────────────────────────── */

/**
 * Calculate a Focus Score (0–100) from daily stats.
 * Weights: productive time is positive, distracting is negative,
 * bonus for streaks and sustained focus blocks.
 *
 * @param {Object} params
 * @returns {number} 0–100
 */
function calculateFocusScore({ dailyProductiveXp, dailyDistractingXp, dailyNeutralXp, currentStreak, comboMultiplier }) {
  const totalActivity = dailyProductiveXp + dailyDistractingXp + dailyNeutralXp;
  if (totalActivity === 0) return 0;

  // Base ratio score (0–60)
  const prodRatio = dailyProductiveXp / totalActivity;
  const baseScore = prodRatio * 60;

  // Distraction penalty (0 to -15)
  const distRatio = dailyDistractingXp / totalActivity;
  const penalty = distRatio * 15;

  // Streak bonus (0–15, logarithmic)
  const streakBonus = Math.min(15, Math.log2(1 + (currentStreak || 0)) * 5);

  // Combo bonus (0–10)
  const comboBonus = Math.min(10, ((comboMultiplier || 1) - 1) * 10);

  const raw = baseScore - penalty + streakBonus + comboBonus;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * Get a grade label for a focus score
 */
function focusGrade(score) {
  if (score >= 90) return { grade: 'S',  label: 'Legendary',   color: '#FFD700' };
  if (score >= 80) return { grade: 'A',  label: 'Excellent',   color: '#00C9A7' };
  if (score >= 65) return { grade: 'B',  label: 'Good',        color: '#58a6ff' };
  if (score >= 50) return { grade: 'C',  label: 'Average',     color: '#f0b429' };
  if (score >= 30) return { grade: 'D',  label: 'Poor',        color: '#ff8c42' };
  return                   { grade: 'F',  label: 'Distracted',  color: '#ff6b6b' };
}

/* ─── Session Tracking ──────────────────────────────────── */

/**
 * Create a new browsing session record.
 */
function createSession(domain, category) {
  return {
    id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    domain,
    category,
    startTime: Date.now(),
    endTime: null,
    duration: 0,          // seconds
    xpEarned: 0,
    ticks: 0
  };
}

/**
 * Finalize a session — compute duration.
 */
function endSession(session) {
  if (!session) return null;
  session.endTime = Date.now();
  session.duration = Math.round((session.endTime - session.startTime) / 1000);
  return session;
}

/* ─── Hourly Heatmap ────────────────────────────────────── */

/**
 * Generate an empty 24-hour heatmap for a day.
 * Each slot tracks { productive, distracting, neutral } XP.
 */
function emptyHourlyHeatmap() {
  const map = [];
  for (let h = 0; h < 24; h++) {
    map.push({ hour: h, productive: 0, distracting: 0, neutral: 0, totalTicks: 0 });
  }
  return map;
}

/**
 * Add a tick to the hourly heatmap.
 */
function recordHourlyTick(heatmap, category, xpDelta) {
  const hour = new Date().getHours();
  if (!heatmap[hour]) return heatmap;
  heatmap[hour][category] += Math.abs(xpDelta);
  heatmap[hour].totalTicks += 1;
  return heatmap;
}

/**
 * Get peak productive hour from heatmap.
 */
function getPeakHour(heatmap) {
  let maxProd = 0;
  let peakHour = 0;
  for (const slot of heatmap) {
    if (slot.productive > maxProd) {
      maxProd = slot.productive;
      peakHour = slot.hour;
    }
  }
  return { hour: peakHour, xp: maxProd };
}

/* ─── Domain Frequency Analytics ────────────────────────── */

/**
 * Update domain visit frequency map.
 * @param {Object} domainStats - { domain: { visits, totalMinutes, totalXp, category, lastVisit } }
 * @param {string} domain
 * @param {string} category
 * @param {number} xpDelta
 * @returns {Object} updated domainStats
 */
function recordDomainVisit(domainStats, domain, category, xpDelta) {
  if (!domainStats[domain]) {
    domainStats[domain] = {
      visits: 0,
      totalMinutes: 0,
      totalXp: 0,
      category,
      lastVisit: null
    };
  }
  domainStats[domain].visits += 1;
  domainStats[domain].totalMinutes += 1;
  domainStats[domain].totalXp += xpDelta;
  domainStats[domain].lastVisit = new Date().toISOString();
  return domainStats;
}

/**
 * Get top N domains by minutes spent.
 */
function getTopDomains(domainStats, n = 5) {
  return Object.entries(domainStats)
    .map(([domain, stats]) => ({ domain, ...stats }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, n);
}

/**
 * Get top distractors.
 */
function getTopDistractors(domainStats, n = 5) {
  return Object.entries(domainStats)
    .filter(([, s]) => s.category === 'distracting')
    .map(([domain, stats]) => ({ domain, ...stats }))
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, n);
}

/* ─── Productivity Trend (7-day moving average) ─────────── */

/**
 * Compute productivity trend from weekly stats.
 * Returns trend direction and percentage change.
 */
function computeTrend(weeklyStats) {
  if (!weeklyStats || weeklyStats.length < 2) {
    return { direction: 'stable', change: 0, avgScore: 0 };
  }

  const scores = weeklyStats.map((day) => {
    const total = day.productive + day.distracting + day.neutral;
    return total > 0 ? (day.productive / total) * 100 : 0;
  });

  const recent = scores.slice(-3);
  const older  = scores.slice(0, -3);

  const avgRecent = recent.reduce((a, b) => a + b, 0) / recent.length;
  const avgOlder  = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : avgRecent;

  const change = avgRecent - avgOlder;
  let direction = 'stable';
  if (change > 5) direction = 'improving';
  if (change < -5) direction = 'declining';

  return {
    direction,
    change: Math.round(change),
    avgScore: Math.round(avgRecent)
  };
}

/* ─── Time Formatting ───────────────────────────────────── */

function formatDuration(minutes) {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatHour(hour) {
  if (hour === 0) return '12 AM';
  if (hour < 12) return `${hour} AM`;
  if (hour === 12) return '12 PM';
  return `${hour - 12} PM`;
}

/* ─── Milestones ────────────────────────────────────────── */

const MILESTONES = [
  { xp: 100,   label: '🌱 Seedling' },
  { xp: 500,   label: '🌿 Sprout' },
  { xp: 1000,  label: '🌳 Tree' },
  { xp: 2500,  label: '⚡ Energized' },
  { xp: 5000,  label: '🔥 On Fire' },
  { xp: 10000, label: '💎 Diamond' },
  { xp: 25000, label: '👑 Royal' },
  { xp: 50000, label: '🐉 Dragon' },
  { xp: 100000,label: '✨ Transcendent' }
];

function getNextMilestone(totalXpEarned) {
  for (const m of MILESTONES) {
    if (totalXpEarned < m.xp) return { ...m, progress: Math.round((totalXpEarned / m.xp) * 100) };
  }
  return { xp: totalXpEarned, label: '🏆 Maxed', progress: 100 };
}

function getCurrentTitle(totalXpEarned) {
  let title = MILESTONES[0];
  for (const m of MILESTONES) {
    if (totalXpEarned >= m.xp) title = m;
  }
  return title;
}

/* ─── Exports ───────────────────────────────────────────── */

const AnalyticsEngine = {
  calculateFocusScore,
  focusGrade,
  createSession,
  endSession,
  emptyHourlyHeatmap,
  recordHourlyTick,
  getPeakHour,
  recordDomainVisit,
  getTopDomains,
  getTopDistractors,
  computeTrend,
  formatDuration,
  formatHour,
  MILESTONES,
  getNextMilestone,
  getCurrentTitle
};

if (typeof globalThis !== 'undefined') {
  globalThis.AnalyticsEngine = AnalyticsEngine;
}

export default AnalyticsEngine;
