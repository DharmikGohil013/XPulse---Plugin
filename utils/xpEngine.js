/**
 * ============================================================
 *  XP Engine v2 — Advanced XP, Combo & Level System
 * ============================================================
 *  Pure-function module.  No side-effects, no storage I/O.
 *  Features: domain classification, combo multipliers,
 *  time-of-day bonuses, prestige system, XP decay.
 * ============================================================
 */

/* ─── Domain Classification (expanded) ──────────────────── */

const PRODUCTIVE_DOMAINS = new Set([
  'stackoverflow.com', 'github.com', 'docs.google.com',
  'developer.mozilla.org', 'chat.openai.com', 'learn.microsoft.com',
  'medium.com', 'dev.to', 'leetcode.com', 'kaggle.com',
  'coursera.org', 'udemy.com', 'edx.org', 'khanacademy.org',
  'notion.so', 'figma.com', 'gitlab.com', 'bitbucket.org',
  'codepen.io', 'replit.com', 'cloud.google.com', 'aws.amazon.com',
  'portal.azure.com', 'heroku.com', 'vercel.com', 'netlify.com',
  'npmjs.com', 'pypi.org', 'docs.python.org', 'rust-lang.org',
  'go.dev', 'typescriptlang.org', 'reactjs.org', 'vuejs.org',
  'svelte.dev', 'angular.io', 'nextjs.org', 'tailwindcss.com',
  'mdn.io', 'caniuse.com', 'jsfiddle.net', 'codesandbox.io',
  'hackerrank.com', 'codeforces.com', 'atcoder.jp',
  'linear.app', 'jira.atlassian.com', 'trello.com',
  'slack.com', 'discord.com', 'teams.microsoft.com',
  'wikipedia.org', 'arxiv.org', 'scholar.google.com',
  'drive.google.com', 'sheets.google.com', 'slides.google.com',
  'canva.com', 'miro.com', 'whimsical.com', 'excalidraw.com',
  'obsidian.md', 'roamresearch.com', 'logseq.com'
]);

const DISTRACTING_DOMAINS = new Set([
  'youtube.com', 'instagram.com', 'facebook.com', 'netflix.com',
  'reddit.com', 'tiktok.com', 'twitter.com', 'x.com',
  'twitch.tv', 'pinterest.com', 'tumblr.com', 'snapchat.com',
  '9gag.com', 'buzzfeed.com', 'dailymail.co.uk', 'tmz.com',
  'bored panda.com', 'ifunny.co', 'imgur.com', 'knowyourmeme.com',
  'amazon.com', 'ebay.com', 'aliexpress.com', 'wish.com',
  'hulu.com', 'disneyplus.com', 'primevideo.com', 'crunchyroll.com',
  'spotify.com', 'soundcloud.com', 'pandora.com',
  'bet365.com', 'draftkings.com', 'fanduel.com',
  'match.com', 'tinder.com', 'bumble.com'
]);

/** Sub-category tags for richer analytics */
const DOMAIN_TAGS = Object.freeze({
  'github.com':            ['coding', 'collaboration'],
  'stackoverflow.com':     ['coding', 'research'],
  'docs.google.com':       ['writing', 'productivity'],
  'figma.com':             ['design', 'creativity'],
  'youtube.com':           ['entertainment', 'video'],
  'netflix.com':           ['entertainment', 'streaming'],
  'reddit.com':            ['social', 'browsing'],
  'twitter.com':           ['social', 'news'],
  'x.com':                 ['social', 'news'],
  'linkedin.com':          ['professional', 'networking'],
  'coursera.org':          ['learning', 'education'],
  'leetcode.com':          ['coding', 'practice'],
  'wikipedia.org':         ['research', 'knowledge'],
  'slack.com':             ['communication', 'work'],
  'notion.so':             ['productivity', 'notes']
});

/** XP awarded per 1-minute tick by category */
const XP_RATES = Object.freeze({
  productive:  10,
  neutral:      2,
  distracting: -5
});

/** Max XP that can be earned in a single minute (anti-farming cap) */
const XP_PER_TICK_CAP = 25;   // raised to allow combo bonuses

/** Minimum XP floor — XP can never go below this */
const XP_FLOOR = 0;

/* ─── Combo System ──────────────────────────────────────── */

/**
 * Combo multiplier rewards sustained productive browsing.
 *
 *  Minutes 1–4    → 1.0x
 *  Minutes 5–9    → 1.25x
 *  Minutes 10–19  → 1.5x
 *  Minutes 20–29  → 1.75x
 *  Minutes 30–44  → 2.0x
 *  Minutes 45–59  → 2.25x
 *  Minutes 60+    → 2.5x (max)
 *
 *  Visiting a distracting site resets the combo counter.
 */
const COMBO_TIERS = [
  { minMinutes: 60, multiplier: 2.5,  label: 'ULTRA COMBO' },
  { minMinutes: 45, multiplier: 2.25, label: 'MEGA COMBO' },
  { minMinutes: 30, multiplier: 2.0,  label: 'SUPER COMBO' },
  { minMinutes: 20, multiplier: 1.75, label: 'GREAT COMBO' },
  { minMinutes: 10, multiplier: 1.5,  label: 'COMBO' },
  { minMinutes: 5,  multiplier: 1.25, label: 'COMBO START' }
];

function getComboMultiplier(consecutiveProductiveMinutes) {
  for (const tier of COMBO_TIERS) {
    if (consecutiveProductiveMinutes >= tier.minMinutes) {
      return { multiplier: tier.multiplier, label: tier.label, minutes: consecutiveProductiveMinutes };
    }
  }
  return { multiplier: 1.0, label: null, minutes: consecutiveProductiveMinutes };
}

/* ─── Time-of-Day Bonus ─────────────────────────────────── */

/**
 * Early-bird & night-owl bonuses.
 *  5 AM – 8 AM  → +20% bonus (early riser)
 *  9 PM – 12 AM → +10% bonus (night owl)
 */
function getTimeOfDayBonus() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 8)  return { bonus: 0.20, label: '🌅 Early Bird +20%' };
  if (hour >= 21 && hour < 24) return { bonus: 0.10, label: '🦉 Night Owl +10%' };
  return { bonus: 0, label: null };
}

/* ─── Domain Helpers ────────────────────────────────────── */

/**
 * Extract the registrable domain from a URL string.
 * Also extracts the full path for smarter classification.
 */
function extractDomain(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.replace(/^www\./, '');
    return hostname;
  } catch {
    return null;
  }
}

/**
 * Extract full URL info for richer analytics.
 */
function extractUrlInfo(url) {
  try {
    const u = new URL(url);
    return {
      domain: u.hostname.replace(/^www\./, ''),
      path: u.pathname,
      fullUrl: url,
      protocol: u.protocol
    };
  } catch {
    return null;
  }
}

/**
 * Get tags for a domain (for analytics categorization).
 */
function getDomainTags(domain) {
  return DOMAIN_TAGS[domain] || ['other'];
}

/**
 * Classify a domain into a productivity category.
 * Supports user-defined overrides via customCategories map.
 */
function classifyDomain(domain, customCategories = {}) {
  if (!domain) return 'neutral';

  const lower = domain.toLowerCase();
  if (customCategories[lower]) return customCategories[lower];

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
 * Calculate XP delta for one tick (1 minute) with full modifiers.
 * @param {"productive"|"distracting"|"neutral"} category
 * @param {number} comboMultiplier - current combo multiplier
 * @param {number} streakDays - current streak length
 * @returns {{ base, combo, timeBonus, streakBonus, total, breakdown }}
 */
function calculateTickXpAdvanced(category, comboMultiplier = 1.0, streakDays = 0) {
  const base = XP_RATES[category] ?? XP_RATES.neutral;

  // Distracting XP is not amplified by bonuses (only penalised)
  if (base < 0) {
    return {
      base,
      combo: 0,
      timeBonus: 0,
      streakBonus: 0,
      total: base,
      breakdown: [`Base: ${base} XP`]
    };
  }

  const breakdown = [`Base: +${base} XP`];

  // Combo multiplier
  const afterCombo = Math.round(base * comboMultiplier);
  const comboDelta = afterCombo - base;
  if (comboDelta > 0) breakdown.push(`Combo ${comboMultiplier}x: +${comboDelta}`);

  // Time-of-day bonus
  const tod = getTimeOfDayBonus();
  const timeBonusXp = Math.round(afterCombo * tod.bonus);
  if (timeBonusXp > 0) breakdown.push(`${tod.label}: +${timeBonusXp}`);

  // Streak bonus: +1% per streak day, max +25%
  const streakPercent = Math.min(0.25, streakDays * 0.01);
  const streakBonusXp = Math.round(afterCombo * streakPercent);
  if (streakBonusXp > 0) breakdown.push(`Streak ${streakDays}d: +${streakBonusXp}`);

  const total = Math.min(XP_PER_TICK_CAP, afterCombo + timeBonusXp + streakBonusXp);
  breakdown.push(`Total: +${total} XP`);

  return {
    base,
    combo: comboDelta,
    timeBonus: timeBonusXp,
    streakBonus: streakBonusXp,
    total,
    breakdown
  };
}

/**
 * Simple tick XP (backwards-compatible).
 */
function calculateTickXp(category) {
  return calculateTickXpAdvanced(category).total;
}

/**
 * Apply an XP delta to a current XP value, floored at XP_FLOOR.
 */
function applyXp(currentXp, delta) {
  return Math.max(XP_FLOOR, currentXp + delta);
}

/* ─── Level Calculations ────────────────────────────────── */

/**
 * XP required to REACH a given level.
 * Formula: 100 × level^1.5  (rounded)
 */
function xpForLevel(level) {
  if (level <= 1) return 100;
  return Math.round(100 * Math.pow(level, 1.5));
}

/**
 * Determine what level a given total XP corresponds to.
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
 */
function evaluateLevelUp(currentXp, currentLevel) {
  const newLevel = levelFromXp(currentXp);
  return {
    newLevel,
    levelsGained: newLevel - currentLevel,
    xp: currentXp
  };
}

/* ─── Prestige System ───────────────────────────────────── */

/**
 * Prestige tiers — cosmetic ranks above the base level.
 * Prestige 1 unlocks at Level 25, Prestige 2 at 50, etc.
 * Each prestige grants a unique border color and title.
 */
const PRESTIGE_TIERS = [
  { prestige: 0,  minLevel: 0,   title: 'Novice',      border: '#8b949e' },
  { prestige: 1,  minLevel: 25,  title: 'Bronze',      border: '#CD7F32' },
  { prestige: 2,  minLevel: 50,  title: 'Silver',      border: '#C0C0C0' },
  { prestige: 3,  minLevel: 75,  title: 'Gold',        border: '#FFD700' },
  { prestige: 4,  minLevel: 100, title: 'Platinum',    border: '#E5E4E2' },
  { prestige: 5,  minLevel: 150, title: 'Diamond',     border: '#B9F2FF' },
  { prestige: 6,  minLevel: 200, title: 'Legendary',   border: '#FF6B6B' }
];

function getPrestige(level) {
  let tier = PRESTIGE_TIERS[0];
  for (const t of PRESTIGE_TIERS) {
    if (level >= t.minLevel) tier = t;
  }
  return tier;
}

/* ─── Rank Title ────────────────────────────────────────── */

const RANK_TITLES = [
  { minLevel: 1,   title: 'Initiate',    icon: '🔰' },
  { minLevel: 3,   title: 'Apprentice',  icon: '📗' },
  { minLevel: 5,   title: 'Journeyman',  icon: '⚔️' },
  { minLevel: 8,   title: 'Adept',       icon: '🛡️' },
  { minLevel: 12,  title: 'Expert',      icon: '💎' },
  { minLevel: 15,  title: 'Master',      icon: '👑' },
  { minLevel: 20,  title: 'Grandmaster', icon: '🐉' },
  { minLevel: 30,  title: 'Legend',      icon: '⭐' },
  { minLevel: 50,  title: 'Mythic',      icon: '🌟' },
  { minLevel: 75,  title: 'Immortal',    icon: '♾️' },
  { minLevel: 100, title: 'Transcendent',icon: '✨' }
];

function getRankTitle(level) {
  let rank = RANK_TITLES[0];
  for (const r of RANK_TITLES) {
    if (level >= r.minLevel) rank = r;
  }
  return rank;
}

/* ─── Exports ───────────────────────────────────────────── */

const XpEngine = {
  PRODUCTIVE_DOMAINS,
  DISTRACTING_DOMAINS,
  DOMAIN_TAGS,
  XP_RATES,
  XP_PER_TICK_CAP,
  XP_FLOOR,
  COMBO_TIERS,
  PRESTIGE_TIERS,
  RANK_TITLES,
  extractDomain,
  extractUrlInfo,
  getDomainTags,
  classifyDomain,
  calculateTickXp,
  calculateTickXpAdvanced,
  getComboMultiplier,
  getTimeOfDayBonus,
  applyXp,
  xpForLevel,
  levelFromXp,
  progressPercent,
  evaluateLevelUp,
  getPrestige,
  getRankTitle
};

if (typeof globalThis !== 'undefined') {
  globalThis.XpEngine = XpEngine;
}

export default XpEngine;
