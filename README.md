# ⚡ XPulse — Gamified Productivity Tracker

> Transform your browser into an RPG-style productivity engine.

XPulse is a Chrome Extension built on **Manifest V3** that tracks your active browsing time and converts it into an XP / leveling / streak / achievement system — like a lightweight RPG embedded in your browser.

---

## Features

| Feature | Description |
|---------|-------------|
| **XP System** | Earn +10 XP/min on productive sites, +2 XP/min on neutral sites, lose -5 XP/min on distracting sites |
| **Level System** | Dynamic leveling with formula `100 × level^1.5` — badge notifications on level-up |
| **Streak System** | Daily productive-browsing streaks (50+ productive XP/day to maintain) |
| **Achievements** | 12 tiered achievements across Beginner → Elite |
| **Premium UI** | Dark glassmorphism popup with circular progress ring, weekly chart, achievement grid |
| **Anti-Farm** | Only active + visible tab counts; idle detection; XP-per-tick cap; XP floor at 0 |
| **Badge** | Live extension badge shows current level, flashes `+XP` on gain; color-coded by category |
| **Data Export** | One-click JSON export of all stats |

---

## Architecture

```
xpulse/
├── manifest.json              # Manifest V3 config
├── background.js              # Service worker — tab tracking, XP loop, badge
├── content.js                 # Page focus/visibility reporter
├── popup/
│   ├── popup.html             # Dashboard UI
│   ├── popup.css              # Glassmorphism dark theme
│   └── popup.js               # UI controller (zero game logic)
├── utils/
│   ├── xpEngine.js            # Domain classification, XP math, level formulas
│   ├── streakEngine.js        # Daily streak evaluation
│   ├── achievementEngine.js   # Tiered achievement evaluator
│   └── storageManager.js      # chrome.storage.local wrapper
└── assets/
    └── icons/
        ├── icon16.png
        ├── icon48.png
        └── icon128.png
```

### Module Responsibilities

| Module | Role |
|--------|------|
| `background.js` | Service worker: alarm-driven 60 s tick, tab/window tracking, idle API, XP application, level-up/streak/achievement orchestration, badge updates, message API |
| `content.js` | Lightweight injector: visibility-change & focus/blur detection, user activity heartbeat |
| `xpEngine.js` | Pure functions: domain classification, XP-per-tick math, level thresholds, progress % |
| `streakEngine.js` | Pure functions: day-roll logic, streak continuation / reset, today qualification |
| `achievementEngine.js` | Pure functions: 12 achievement definitions with condition lambdas, evaluator, status merger |
| `storageManager.js` | Async wrapper over `chrome.storage.local`: init/hydrate, typed accessors, daily bucket rollover, weekly archive, export, factory reset |
| `popup.js` | DOM renderer: requests state via `chrome.runtime.sendMessage`, renders ring/bars/charts/achievements, export + reset actions |

---

## Domain Classification

### Productive (+10 XP/min)
`stackoverflow.com` · `github.com` · `docs.google.com` · `developer.mozilla.org` · `chat.openai.com` · `learn.microsoft.com` · `medium.com` · `dev.to` · `leetcode.com` · `kaggle.com` · `coursera.org` · `udemy.com` · `edx.org` · `khanacademy.org` · `notion.so` · `figma.com` · `gitlab.com` · `bitbucket.org` · `codepen.io` · `replit.com`

### Distracting (−5 XP/min)
`youtube.com` · `instagram.com` · `facebook.com` · `netflix.com` · `reddit.com` · `tiktok.com` · `twitter.com` · `x.com` · `twitch.tv` · `pinterest.com` · `tumblr.com` · `snapchat.com` · `9gag.com` · `buzzfeed.com`

### Neutral (+2 XP/min)
Everything else.

Custom overrides can be set via `settings.customCategories` in storage.

---

## Level Thresholds

| Level | XP Required |
|-------|-------------|
| 1 | 100 |
| 2 | 283 |
| 3 | 520 |
| 4 | 800 |
| 5 | 1,118 |
| 10 | 3,162 |
| 15 | 5,809 |
| 20 | 8,944 |

Formula: `XP = 100 × level^1.5`

---

## Achievements

| Tier | Achievement | Condition |
|------|-------------|-----------|
| Beginner | First Steps | 100 total XP |
| Beginner | Productive Day | 50+ productive XP in one day |
| Beginner | Level Up! | Reach Level 2 |
| Intermediate | Week Warrior | 7-day streak |
| Intermediate | Apprentice | Level 5 |
| Intermediate | XP Hunter | 1,000 total XP |
| Advanced | Monthly Master | 30-day streak |
| Advanced | XP Legend | 5,000 total XP |
| Advanced | Veteran | Level 10 |
| Elite | Century Streak | 100-day streak |
| Elite | Grandmaster | Level 15 |
| Elite | Transcendent | 20,000 total XP |

---

## Installation

### From Source (Developer Mode)

1. **Clone / download** this repository.

2. **Generate icons** (if they don't already exist):
   ```bash
   node generate-icons.js
   ```

3. Open **Chrome** → navigate to `chrome://extensions/`.

4. Enable **Developer mode** (toggle in top-right).

5. Click **Load unpacked** → select the `XPulse---Plugin` folder.

6. The ⚡ XPulse icon appears in your toolbar. **Pin it** for quick access.

7. Browse normally — XP ticks every 60 seconds on the active tab.

---

## Data Integrity & Anti-Abuse

- **Active tab only** — background tabs earn nothing.
- **Visibility + focus** — content script confirms `document.hidden === false && document.hasFocus()`.
- **Idle detection** — `chrome.idle` API pauses XP when user is away > 2 minutes.
- **Per-tick cap** — maximum 10 XP per tick (prevents rapid-refresh farming).
- **XP floor** — XP can never go below 0.
- **Domain validation** — `new URL()` parsing; `chrome://`, `about:` pages are ignored.

---

## Performance Notes

- **Service worker lifecycle** — background.js wakes only on alarm ticks (every 60 s), tab events, or messages. No persistent connection.
- **Alarm-based tick** — uses `chrome.alarms` (Manifest V3 compliant) instead of `setInterval`, surviving service worker suspension.
- **Atomic storage writes** — single `chrome.storage.local.set()` per tick with all updated fields.
- **Lightweight content script** — ~50 lines, no DOM mutation, passive event listeners, throttled messaging.
- **No external dependencies** — zero npm packages, zero network requests.
- **Memory** — popup DOM is created/destroyed on open/close; no leaked intervals.

---

## Debug / Dev Mode

Open the service worker console via `chrome://extensions/` → XPulse → "Inspect views: service worker".

Send messages from the console:
```js
// Force a tick immediately
chrome.runtime.sendMessage({ type: 'FORCE_TICK' });

// Get full state
chrome.runtime.sendMessage({ type: 'GET_STATE' }, console.log);

// Reset everything
chrome.runtime.sendMessage({ type: 'RESET' });

// Export JSON
chrome.runtime.sendMessage({ type: 'EXPORT' }, (r) => console.log(r.json));
```

---

## License

MIT — built as a portfolio-grade engineering project.
