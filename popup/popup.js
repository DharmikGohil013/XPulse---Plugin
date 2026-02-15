/**
 * ============================================================
 *  XPulse Popup — UI Controller
 * ============================================================
 *  Requests state from the background service worker and
 *  renders all dashboard elements.  Zero game logic lives here.
 * ============================================================
 */

/* ─── DOM References ────────────────────────────────────── */

const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const DOM = {
  levelNum:        $('#levelNum'),
  ringFill:        $('#ringFill'),
  ringPercent:     $('#ringPercent'),
  totalXp:         $('#totalXp'),
  currentStreak:   $('#currentStreak'),
  longestStreak:   $('#longestStreak'),   // shows in stat card #3
  xpCurrent:       $('#xpCurrent'),
  xpNext:          $('#xpNext'),
  xpBarFill:       $('#xpBarFill'),
  todayProductive: $('#todayProductive'),
  todayNeutral:    $('#todayNeutral'),
  todayDistracting:$('#todayDistracting'),
  prodRatio:       $('#prodRatio'),
  weeklyChart:     $('#weeklyChart'),
  achCount:        $('#achCount'),
  achGrid:         $('#achGrid'),
  btnExport:       $('#btnExport'),
  btnReset:        $('#btnReset')
};

/* ─── Circular Ring Helpers ─────────────────────────────── */

const RING_CIRCUMFERENCE = 2 * Math.PI * 52; // r = 52 in SVG

function setRingProgress(percent) {
  const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
  DOM.ringFill.style.strokeDasharray  = RING_CIRCUMFERENCE;
  DOM.ringFill.style.strokeDashoffset = offset;
  DOM.ringPercent.textContent = `${percent}%`;
}

/* ─── Number Formatting ─────────────────────────────────── */

function fmt(n) {
  if (n >= 10000) return (n / 1000).toFixed(1) + 'k';
  return n.toLocaleString();
}

/* ─── Render State ──────────────────────────────────────── */

function render(state) {
  // Level
  DOM.levelNum.textContent = state.level;

  // Ring
  setRingProgress(state.progressPercent);

  // Stats
  DOM.totalXp.textContent      = fmt(state.totalXpEarned);
  DOM.currentStreak.textContent = state.currentStreak;
  DOM.longestStreak.textContent = state.longestStreak;

  // XP bar
  DOM.xpCurrent.textContent = `${fmt(state.xp)} XP`;
  DOM.xpNext.textContent    = `${fmt(state.xpForNext)} XP`;
  DOM.xpBarFill.style.width = `${state.progressPercent}%`;

  // Today
  DOM.todayProductive.textContent  = `${fmt(state.dailyProductiveXp)} XP`;
  DOM.todayNeutral.textContent     = `${fmt(state.dailyNeutralXp)} XP`;
  DOM.todayDistracting.textContent = `${fmt(state.dailyDistractingXp)} XP`;

  // Productivity ratio
  const totalToday = state.dailyProductiveXp + state.dailyNeutralXp + state.dailyDistractingXp;
  if (totalToday > 0) {
    const ratio = Math.round((state.dailyProductiveXp / totalToday) * 100);
    DOM.prodRatio.textContent = `${ratio}%`;
    DOM.prodRatio.style.color = ratio >= 60 ? 'var(--accent-green)' :
                                ratio >= 30 ? 'var(--accent-amber)' :
                                              'var(--accent-red)';
  } else {
    DOM.prodRatio.textContent = '—';
    DOM.prodRatio.style.color = '';
  }

  // Weekly chart
  renderWeeklyChart(state.weeklyStats);

  // Achievements
  renderAchievements(state.achievements);
}

/* ─── Weekly Chart ──────────────────────────────────────── */

function renderWeeklyChart(stats) {
  DOM.weeklyChart.innerHTML = '';

  // Always show 7 columns (pad with empty)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const dataMap = {};
  for (const entry of stats) {
    dataMap[entry.date] = entry;
  }

  // Last 7 days
  const slotDates = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    slotDates.push(d.toISOString().slice(0, 10));
  }

  // Find max for scaling
  let maxVal = 1;
  for (const date of slotDates) {
    const e = dataMap[date];
    if (e) {
      maxVal = Math.max(maxVal, e.productive, e.distracting);
    }
  }

  for (const date of slotDates) {
    const entry = dataMap[date] || { productive: 0, distracting: 0 };
    const d = new Date(date + 'T00:00:00');
    const dayLabel = days[d.getDay() === 0 ? 6 : d.getDay() - 1] || days[d.getDay()];

    const group = document.createElement('div');
    group.className = 'xp-chart-bar-group';

    // Productive bar
    const prodBar = document.createElement('div');
    prodBar.className = 'xp-chart-bar productive';
    const prodH = Math.max(3, (entry.productive / maxVal) * 60);
    prodBar.style.height = `${prodH}px`;
    prodBar.title = `Productive: ${entry.productive} XP`;

    // Distracting bar (stacked on same column visually offset)
    const distBar = document.createElement('div');
    distBar.className = 'xp-chart-bar distracting';
    const distH = Math.max(3, (entry.distracting / maxVal) * 60);
    distBar.style.height = `${distH}px`;
    distBar.title = `Distracting: ${entry.distracting} XP`;

    const label = document.createElement('span');
    label.className = 'xp-chart-day';
    label.textContent = dayLabel;

    group.appendChild(prodBar);
    group.appendChild(distBar);
    group.appendChild(label);
    DOM.weeklyChart.appendChild(group);
  }
}

/* ─── Achievements ──────────────────────────────────────── */

function renderAchievements(achievements) {
  DOM.achGrid.innerHTML = '';

  const total    = achievements.length;
  const unlocked = achievements.filter((a) => a.unlocked).length;
  DOM.achCount.textContent = `${unlocked} / ${total}`;

  for (const ach of achievements) {
    const item = document.createElement('div');
    item.className = `xp-ach-item ${ach.unlocked ? 'unlocked' : 'locked'}`;
    item.setAttribute('data-tooltip', ach.desc);

    const icon = document.createElement('span');
    icon.className = 'xp-ach-icon';
    icon.textContent = ach.icon;

    const title = document.createElement('span');
    title.className = 'xp-ach-title';
    title.textContent = ach.title;

    item.appendChild(icon);
    item.appendChild(title);
    DOM.achGrid.appendChild(item);
  }
}

/* ─── Actions ───────────────────────────────────────────── */

DOM.btnExport.addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ type: 'EXPORT' });
  if (response?.json) {
    // Copy to clipboard
    await navigator.clipboard.writeText(response.json);
    DOM.btnExport.textContent = '✅ Copied!';
    setTimeout(() => { DOM.btnExport.textContent = '📤 Export'; }, 2000);
  }
});

DOM.btnReset.addEventListener('click', async () => {
  if (!confirm('Reset ALL XPulse data? This cannot be undone.')) return;
  await chrome.runtime.sendMessage({ type: 'RESET' });
  await loadState();
});

/* ─── Init ──────────────────────────────────────────────── */

async function loadState() {
  try {
    const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    if (state && !state.error) {
      render(state);
    }
  } catch (err) {
    console.error('[XPulse popup] Failed to load state', err);
  }
}

// Load immediately and refresh every 10 s while popup is open
loadState();
setInterval(loadState, 10000);
