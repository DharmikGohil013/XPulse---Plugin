/**
 * ============================================================
 *  XP Engine — Core XP & Level Math for XPulse
 * ============================================================
 *  Pure-function module.  No side-effects, no storage I/O.
 *  Background worker calls these and persists results itself.
 * ============================================================
 */

/* ─── Domain Classification ─────────────────────────────── */

const PRODUCTIVE_DOMAINS = new Set([
  'stackoverflow.com',
  'github.com',
  'docs.google.com',
  'developer.mozilla.org',
  'chat.openai.com',
  'learn.microsoft.com',
  'medium.com',
  'dev.to',
  'leetcode.com',
  'kaggle.com',
  'coursera.org',
  'udemy.com',
  'edx.org',
  'khanacademy.org',
  'notion.so',
  'figma.com',
  'gitlab.com',
  'bitbucket.org',
  'codepen.io',
  'replit.com'
]);

const DISTRACTING_DOMAINS = new Set([
  'youtube.com',
  'instagram.com',
  'facebook.com',
  'netflix.com',
  'reddit.com',
  'tiktok.com',
  'twitter.com',
  'x.com',
  'twitch.tv',
  'pinterest.com',
  'tumblr.com',
  'snapchat.com',
  '9gag.com',
  'buzzfeed.com'
]);

/** XP awarded per 1-minute tick by category */
const XP_RATES = Object.freeze({
  productive:  10,
  neutral:      2,
  distracting: -5
});

/** Max XP that can be earned in a single minute (anti-farming cap) */
const XP_PER_TICK_CAP = 10;

/** Minimum XP floor — XP can never go below this */
const XP_FLOOR = 0;

/* ─── Domain Helpers ────────────────────────────────────── */

/**
 * Extract the registrable domain from a URL string.
 * e.g. "https://www.github.com/user/repo" → "github.com"
 */
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Classify a domain into a productivity category.
 * Supports user-defined overrides via customCategories map.
 * @param {string} domain
 * @param {Object} customCategories — { domain: "productive"|"distracting"|"neutral" }
 * @returns {"productive"|"distracting"|"neutral"}
 */
function classifyDomain(domain, customCategories = {}) {
  if (!domain) return 'neutral';

  // User overrides take priority
  const lower = domain.toLowerCase();
  if (customCategories[lower]) return customCategories[lower];

  // Special case: reddit.com dev subreddits stay productive
  // (handled via customCategories; base reddit is distracting)

  // Check built-in lists (also match subdomains like "gist.github.com")
  for (const d of PRODUCTIVE_DOMAINS) {
    if (lower === d || lower.endsWith('.' + d)) return 'productive';
  }
  for (const d of DISTRACTING_DOMAINS) {
    if (lower === d || lower.endsWith('.' + d)) return 'distracting';
  }

  return 'neutral';
}

/* ─── XP Calculations ───────────────────────────────────── */

/**
 * Calculate XP delta for one tick (1 minute).
 * @param {"productive"|"distracting"|"neutral"} category
 * @returns {number} XP change (can be negative)
 */
function calculateTickXp(category) {
  const raw = XP_RATES[category] ?? XP_RATES.neutral;
  // Cap positive XP per tick
  return Math.min(raw, XP_PER_TICK_CAP);
}

/**
 * Apply an XP delta to a current XP value, floored at XP_FLOOR.
 * @returns {number} new XP
 */
function applyXp(currentXp, delta) {
  return Math.max(XP_FLOOR, currentXp + delta);
}

/* ─── Level Calculations ────────────────────────────────── */

/**
 * XP required to REACH a given level.
 * Formula: 100 × level^1.5  (rounded)
 * Level 1 →  100
 * Level 2 →  283
 * Level 3 →  520
 * Level 4 →  800
 * Level 5 → 1118
 */
function xpForLevel(level) {
  if (level <= 1) return 100;
  return Math.round(100 * Math.pow(level, 1.5));
}

/**
 * Determine what level a given total XP corresponds to.
 * Walks up from level 1 until the XP threshold exceeds totalXp.
 */
function levelFromXp(totalXp) {
  let level = 1;
  while (xpForLevel(level + 1) <= totalXp) {
    level++;
  }
  return level;
}

/**
 * Progress percentage toward the NEXT level (0–100).
 */
function progressPercent(totalXp, currentLevel) {
  const currentThreshold = xpForLevel(currentLevel);
  const nextThreshold = xpForLevel(currentLevel + 1);
  const range = nextThreshold - currentThreshold;
  if (range <= 0) return 100;
  const progress = totalXp - currentThreshold;
  return Math.min(100, Math.max(0, Math.round((progress / range) * 100)));
}

/**
 * Full level-up evaluation.
 * Returns { newLevel, levelsGained, newXp }
 */
function evaluateLevelUp(currentXp, currentLevel) {
  const newLevel = levelFromXp(currentXp);
  return {
    newLevel,
    levelsGained: newLevel - currentLevel,
    xp: currentXp
  };
}

/* ─── Exports ───────────────────────────────────────────── */

const XpEngine = {
  PRODUCTIVE_DOMAINS,
  DISTRACTING_DOMAINS,
  XP_RATES,
  XP_PER_TICK_CAP,
  XP_FLOOR,
  extractDomain,
  classifyDomain,
  calculateTickXp,
  applyXp,
  xpForLevel,
  levelFromXp,
  progressPercent,
  evaluateLevelUp
};

if (typeof globalThis !== 'undefined') {
  globalThis.XpEngine = XpEngine;
}

export default XpEngine;
