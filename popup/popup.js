/**
 * ============================================================
 *  XPulse v2 — Popup Dashboard Controller
 * ============================================================
 *  Renders all state from background into the tabbed dashboard:
 *    - Level ring, XP, combo, rank, prestige
 *    - Focus score with letter grade
 *    - Today's breakdown bars
 *    - 7-day weekly chart with trend
 *    - Milestone progress
 *    - Hourly heatmap
 *    - Top domains & distractors
 *    - Session history
 *    - Achievement grid with tier progress
 * ============================================================
 */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* ──────────────────────────────────────────────────────────
 *  State & Refresh
 * ──────────────────────────────────────────────────────── */

let state = {};
const REFRESH_MS = 3000;

async function fetchState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn('[XPulse] message error:', chrome.runtime.lastError.message);
        resolve(null);
      } else {
        resolve(res);
      }
    });
  });
}

async function refresh() {
  const s = await fetchState();
  if (!s || s.error) return;
  state = s;
  renderAll();
}

/* ──────────────────────────────────────────────────────────
 *  Init
 * ──────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', async () => {
  setupTabs();
  setupButtons();
  await refresh();
  setInterval(refresh, REFRESH_MS);
});

/* ──────────────────────────────────────────────────────────
 *  Tabs
 * ──────────────────────────────────────────────────────── */

function setupTabs() {
  $$('.tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      $$('.tab').forEach((b) => b.classList.remove('active'));
      $$('.tab-content').forEach((c) => c.classList.remove('active'));
      btn.classList.add('active');
      const target = btn.dataset.tab;
      $(`#tab-${target}`).classList.add('active');
    });
  });
}

/* ──────────────────────────────────────────────────────────
 *  Buttons
 * ──────────────────────────────────────────────────────── */

function setupButtons() {
  $('#btn-export')?.addEventListener('click', async () => {
    chrome.runtime.sendMessage({ type: 'EXPORT' }, (res) => {
      if (res?.json) {
        const blob = new Blob([res.json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `xpulse-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    });
  });

  $('#btn-reset')?.addEventListener('click', () => {
    if (confirm('Reset ALL XPulse data? This cannot be undone.')) {
      chrome.runtime.sendMessage({ type: 'RESET' }, () => refresh());
    }
  });

  $('#btn-force-tick')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'FORCE_TICK' }, () => refresh());
  });

  $('#btn-settings')?.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    }
  });
}

/* ──────────────────────────────────────────────────────────
 *  Master Render
 * ──────────────────────────────────────────────────────── */

function renderAll() {
  renderHeader();
  renderLevelCard();
  renderStatsRow();
  renderBreakdown();
  renderWeeklyChart();
  renderMilestone();
  renderHeatmap();
  renderDomains();
  renderSessions();
  renderTierProgress();
  renderAchievements();
}

/* ──────────────────────────────────────────────────────────
 *  Header
 * ──────────────────────────────────────────────────────── */

function renderHeader() {
  const rank = state.rank || {};
  const prestige = state.prestige || {};
  const timeBonus = state.timeBonus || {};

  $('#rank-badge').textContent = rank.title || 'Recruit';

  const prestigeEl = $('#prestige-badge');
  if (prestige.label && prestige.level > 0) {
    prestigeEl.textContent = `${prestige.icon || '⭐'} P${prestige.level}`;
    prestigeEl.title = prestige.label;
  } else {
    prestigeEl.textContent = '';
  }

  const timeBonusEl = $('#time-bonus');
  if (timeBonus.bonus > 0) {
    timeBonusEl.textContent = `${timeBonus.label} +${Math.round(timeBonus.bonus * 100)}%`;
  } else {
    timeBonusEl.textContent = '';
  }
}

/* ──────────────────────────────────────────────────────────
 *  Level Card
 * ──────────────────────────────────────────────────────── */

function renderLevelCard() {
  const level = state.level || 1;
  const pct = state.progressPercent || 0;
  const circumference = 326.73;
  const offset = circumference - (pct / 100) * circumference;

  $('#level-num').textContent = level;
  const ring = $('#progress-ring');
  if (ring) ring.style.strokeDashoffset = offset;

  $('#xp-current').textContent = formatNum(state.xp || 0);
  $('#xp-next').textContent = formatNum(state.xpForNext || 100);
  $('#total-xp').textContent = `Total: ${formatNum(state.totalXpEarned || 0)} XP earned`;

  // Combo
  const combo = state.comboMultiplier || 1.0;
  const comboEl = $('#combo-mult');
  if (comboEl) {
    comboEl.textContent = `${combo.toFixed(1)}x`;
    if (combo >= 2.0) comboEl.style.color = '#FFD700';
    else if (combo >= 1.5) comboEl.style.color = '#38BDF8';
    else comboEl.style.color = '';
  }
  const comboMin = $('#combo-minutes');
  if (comboMin && state.comboMinutes > 0) {
    comboMin.textContent = `(${state.comboMinutes}m)`;
  } else if (comboMin) {
    comboMin.textContent = '';
  }
}

/* ──────────────────────────────────────────────────────────
 *  Stats Row
 * ──────────────────────────────────────────────────────── */

function renderStatsRow() {
  const focusScore = Math.round(state.focusScore || 0);
  $('#focus-score').textContent = focusScore;

  const grade = state.focusGrade || {};
  const gradeEl = $('#focus-grade');
  if (gradeEl) {
    gradeEl.textContent = grade.grade || 'F';
    gradeEl.className = `stat-grade grade-${grade.grade || 'F'}`;
  }

  $('#streak-count').textContent = state.currentStreak || 0;

  const totalMin = (state.dailyProductiveMin || 0) + (state.dailyDistractingMin || 0) + (state.dailyNeutralMin || 0);
  $('#total-minutes').textContent = totalMin;

  $('#highest-combo').textContent = `${(state.highestCombo || 1.0).toFixed(1)}x`;
}

/* ──────────────────────────────────────────────────────────
 *  Breakdown Bars
 * ──────────────────────────────────────────────────────── */

function renderBreakdown() {
  const prod = state.dailyProductiveXp || 0;
  const dist = state.dailyDistractingXp || 0;
  const neut = state.dailyNeutralXp || 0;
  const max  = Math.max(prod, dist, neut, 1);

  setBarWidth('#bar-productive', prod, max);
  setBarWidth('#bar-distracting', dist, max);
  setBarWidth('#bar-neutral', neut, max);

  $('#val-productive').textContent = `${prod} XP`;
  $('#val-distracting').textContent = `${dist} XP`;
  $('#val-neutral').textContent = `${neut} XP`;
}

function setBarWidth(sel, value, max) {
  const el = $(sel);
  if (el) el.style.width = `${Math.min((value / max) * 100, 100)}%`;
}

/* ──────────────────────────────────────────────────────────
 *  Weekly Chart
 * ──────────────────────────────────────────────────────── */

function renderWeeklyChart() {
  const weekly = state.weeklyStats || [];
  const container = $('#weekly-chart');
  if (!container) return;
  container.innerHTML = '';

  // Take last 7 days
  const days = weekly.slice(-7);
  if (days.length === 0) {
    container.innerHTML = '<div class="empty-state">No data yet — check back tomorrow!</div>';
    return;
  }

  const maxXp = Math.max(...days.map((d) => Math.abs(d.productive || 0)), 1);

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  days.forEach((day) => {
    const xp = day.productive || 0;
    const date = new Date(day.date);
    const label = dayLabels[date.getDay()] || '?';
    const height = Math.max((Math.abs(xp) / maxXp) * 60, 2);
    const isPositive = xp >= 0;

    const bar = document.createElement('div');
    bar.className = 'week-bar';
    bar.innerHTML = `
      <div class="week-bar-xp">${xp >= 0 ? '+' : ''}${xp}</div>
      <div class="week-bar-fill ${isPositive ? 'positive' : 'negative'}" style="height:${height}px"></div>
      <div class="week-bar-day">${label}</div>
    `;
    container.appendChild(bar);
  });

  // Trend indicator
  const trendEl = $('#trend-indicator');
  if (trendEl && state.trend) {
    const t = state.trend;
    trendEl.textContent = t.direction === 'improving' ? '▲ Improving'
                        : t.direction === 'declining' ? '▼ Declining'
                        : '— Stable';
    trendEl.className = `trend-indicator ${t.direction}`;
  }
}

/* ──────────────────────────────────────────────────────────
 *  Milestone
 * ──────────────────────────────────────────────────────── */

function renderMilestone() {
  const ms = state.milestone;
  if (!ms) return;

  $('#milestone-label').textContent = ms.label || 'Keep going!';
  const fill = $('#milestone-fill');
  if (fill) fill.style.width = `${Math.min(ms.progress || 0, 100)}%`;
  $('#milestone-progress').textContent = `${Math.round(ms.progress || 0)}%`;
}

/* ──────────────────────────────────────────────────────────
 *  Heatmap
 * ──────────────────────────────────────────────────────── */

function renderHeatmap() {
  const heatmap = state.hourlyHeatmap || [];
  const container = $('#heatmap-container');
  if (!container) return;
  container.innerHTML = '';

  const maxXp = Math.max(...heatmap.map((h) => (h.productive || 0) + (h.neutral || 0)), 1);

  for (let h = 0; h < 24; h++) {
    const data = heatmap[h] || { totalTicks: 0, productive: 0, neutral: 0 };
    const cellXp = (data.productive || 0) + (data.neutral || 0);
    const intensity = cellXp > 0 ? Math.min(Math.ceil((cellXp / maxXp) * 5), 5) : 0;

    const wrapper = document.createElement('div');
    wrapper.style.display = 'flex';
    wrapper.style.flexDirection = 'column';
    wrapper.style.alignItems = 'center';

    const cell = document.createElement('div');
    cell.className = `heatmap-cell ${intensity > 0 ? `active-${intensity}` : ''}`;
    cell.title = `${h}:00 — ${cellXp} XP (${data.totalTicks || 0} ticks)`;

    const label = document.createElement('div');
    label.className = 'heatmap-label';
    label.textContent = h % 3 === 0 ? `${h}` : '';

    wrapper.appendChild(cell);
    wrapper.appendChild(label);
    container.appendChild(wrapper);
  }

  // Peak hour
  const peakEl = $('#peak-hour');
  if (peakEl && state.peakHour) {
    peakEl.textContent = `Peak productivity: ${state.peakHour.hour}:00`;
  }
}

/* ──────────────────────────────────────────────────────────
 *  Domains
 * ──────────────────────────────────────────────────────── */

function renderDomains() {
  renderDomainList('#domain-list', state.topDomains || [], false);
  renderDomainList('#distractor-list', state.topDistractors || [], true);
}

function renderDomainList(sel, domains, isDistractor) {
  const container = $(sel);
  if (!container) return;
  container.innerHTML = '';

  if (domains.length === 0) {
    container.innerHTML = '<div class="empty-state">No data yet</div>';
    return;
  }

  domains.forEach((d, i) => {
    const row = document.createElement('div');
    row.className = 'domain-row';
    row.innerHTML = `
      <div class="domain-rank">${i + 1}</div>
      <div class="domain-name">${d.domain}</div>
      <div class="domain-xp">${(d.totalXp || 0) >= 0 ? '+' : ''}${d.totalXp || 0} XP</div>
      <div class="domain-visits">${d.visits || 0} visits</div>
    `;
    container.appendChild(row);
  });
}

/* ──────────────────────────────────────────────────────────
 *  Sessions
 * ──────────────────────────────────────────────────────── */

function renderSessions() {
  const sessions = state.sessions || [];
  const container = $('#session-list');
  if (!container) return;
  container.innerHTML = '';

  if (sessions.length === 0) {
    container.innerHTML = '<div class="empty-state">No sessions recorded yet</div>';
    return;
  }

  // Show most recent first
  const reversed = [...sessions].reverse().slice(0, 8);

  reversed.forEach((s) => {
    const row = document.createElement('div');
    row.className = `session-row ${s.category || 'neutral'}`;
    const time = s.startTime ? new Date(s.startTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const durMin = Math.floor((s.duration || 0) / 60);
    row.innerHTML = `
      <div>
        <div class="session-domain">${s.domain || 'unknown'}</div>
      </div>
      <div class="session-meta">
        <span>${time}</span>
        <span>${durMin}m</span>
        <span class="session-xp">${(s.xpEarned || 0) >= 0 ? '+' : ''}${s.xpEarned || 0} XP</span>
      </div>
    `;
    container.appendChild(row);
  });
}

/* ──────────────────────────────────────────────────────────
 *  Tier Progress
 * ──────────────────────────────────────────────────────── */

function renderTierProgress() {
  const tiers = state.achievementTiers;
  const container = $('#tier-progress');
  if (!container || !tiers) return;
  container.innerHTML = '';

  const tierOrder = ['beginner', 'intermediate', 'advanced', 'elite', 'legendary'];
  tierOrder.forEach((tier) => {
    const data = tiers[tier];
    if (!data) return;
    const pct = data.total > 0 ? (data.done / data.total) * 100 : 0;
    const row = document.createElement('div');
    row.className = `tier-row tier-${tier}`;
    row.innerHTML = `
      <div class="tier-name">${tier}</div>
      <div class="tier-bar-track"><div class="tier-bar-fill" style="width:${pct}%"></div></div>
      <div class="tier-count">${data.done}/${data.total}</div>
    `;
    container.appendChild(row);
  });
}

/* ──────────────────────────────────────────────────────────
 *  Achievements
 * ──────────────────────────────────────────────────────── */

function renderAchievements() {
  const achievements = state.achievements || [];
  const container = $('#achievement-grid');
  if (!container) return;
  container.innerHTML = '';

  achievements.forEach((ach) => {
    const card = document.createElement('div');
    const isUnlocked = ach.unlocked;
    const isHidden = ach.hidden && !isUnlocked;

    card.className = `ach-card ${isUnlocked ? 'unlocked' : 'locked'} ${isHidden ? 'hidden-ach' : ''}`;
    card.setAttribute('data-tier', ach.tier || 'beginner');

    card.innerHTML = `
      <div class="ach-icon">${ach.icon || '❓'}</div>
      <div class="ach-name">${ach.title || '???'}</div>
      <div class="ach-desc">${ach.desc || 'Hidden achievement'}</div>
      <div class="ach-tier-badge">${ach.tier || ''}</div>
      ${ach.xpReward ? `<div class="ach-xp-badge">+${ach.xpReward} XP</div>` : ''}
    `;

    if (isUnlocked && ach.unlockedAt) {
      card.title = `Unlocked: ${new Date(ach.unlockedAt).toLocaleDateString()}`;
    }

    container.appendChild(card);
  });
}

/* ──────────────────────────────────────────────────────────
 *  Utilities
 * ──────────────────────────────────────────────────────── */

function formatNum(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000)    return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}