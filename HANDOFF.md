# Risewell: shared context

Background for every new session on this project. Read it with the role file for the session:

- `REVIEWER.md`: suggests improvements and outputs a numbered list of items.
- `BUILDER.md`: takes that list and implements, fixes and verifies it.

The owner set this priority order for every decision: **Clarity > Efficiency > Consistency > Beauty.** First make an experience clear, then efficient, then consistent with the rest of the app, and only then good-looking.

## What Risewell is

A wake-up streak game. Each morning you tap **I’m Awake**, do a tiny task that takes under a minute (drink water, open curtains, 10 push-ups and so on), and your streak grows. Audience: people aged 16 to 35 who want to become morning people. Mood: warm, energetic, sunrise. Design references: Duolingo (streak psychology, celebrations), Apple Fitness rings (progress), Forest (warm, simple, gamified), Streaks (clean calendar), Headspace (friendly onboarding).

## Hard constraints (decided by the owner, do not reopen)

- **Fully offline.** No accounts, no sign-in, no server, no multiplayer. A "Squad" social feature and an "I already have an account" button were built and then removed at the owner's request.
- The only sharing feature wanted: **Share your streak** on the celebration screen, which exports an image of the streak to save or share.
- **Android phone**, installed as a **web app (PWA)**, not a native app. The owner chose this over a native build for speed.
- The welcome and setup screens show on **first open only**. After setup, the app opens on Home.

## Known platform limits (explain these if a suggestion runs into them)

- A PWA **cannot ring an alarm or send reminders while closed**. The user sets a matching alarm in the phone's Clock app, and the app says so on the setup and wake goal screens. Settings that would need background alarms (gentle alarm, streak warning) were deliberately removed rather than faked.
- Data lives in the browser's `localStorage` for the install URL. Clearing site data or installing from a different URL starts fresh. There is no backup or export yet.

## Where things stand

- Repository: `https://github.com/panthaX666/risewell` (public, branch `main`, one commit `d256454`). The remote URL is pinned to the panthaX666 account.
- Hosting: GitHub Pages from `main`, `/ (root)`. Intended URL `https://panthax666.github.io/risewell/`. As of this handoff, whether Pages was switched on and the link loads had **not yet been confirmed**.
- Offline caching (service worker) **has not been verified on a real phone**. The dev browser pane blocked service workers.
- The session's working folder is `F:\FOLDER\development\risewell`. `HANDOFF.md`, `REVIEWER.md` and `BUILDER.md` are not committed.

## Code map

| Path | Purpose |
|---|---|
| `index.html` | All screens as `<section class="screen">`, plus the share sheet, delete-confirmation sheet, toast and tab bar |
| `css/app.css` | Design tokens and components, light and dark themes |
| `js/logic.js` | Streak rules as pure functions (no DOM), covered by tests |
| `js/app.js` | Navigation (mirrors the Android back button via the History API), rendering, storage, share image, theme, sound |
| `sw.js` | Offline cache, cache-first. Bump `VERSION` when any cached file changes |
| `manifest.webmanifest` | Install metadata and icons |
| `tests/logic.test.mjs` | 11 `node --test` tests, all passing |
| `tools/make-icons.mjs` | Draws the app icon (sun over hills) into `icons/*.png` with no dependencies |
| `tools/build.mjs` | Copies the app files into `dist/` for any static host |
| `prototype/risewell.html` | The original clickable design prototype |

Commands: `npm test`, `npm start` (serves at http://localhost:8765), `npm run build`, `npm run icons`. Add `?now=2026-09-28T06:40` to the URL to pin the clock and test a morning at any hour.

## Screens (11)

Welcome → Wake goal (setup 1 of 2) → First task (setup 2 of 2) → **Home** · Tiny task · Celebration · **Streak** (calendar, next badge, freezes, link to Insights) · Wake goal settings · Task library · Insights · **Me** (badges, wake goal, task, theme, sound, delete all data). The tab bar has three tabs: Today, Streak and Me.

## Streak rules (in `js/logic.js`)

- Wake goal (default 7:00 AM), repeat days (Monday first), and a wake window of 15, 30 or 60 minutes (default 30).
- **I’m Awake** opens 2 hours before the goal and closes at goal + window. A day only counts once the tiny task is done, which must happen within 60 minutes of the tap.
- The streak starts on setup day if that day's window has not closed yet, otherwise the next day. Setup day never uses a freeze or counts as a miss: finishing it adds to the streak, missing it costs nothing.
- A scheduled day without a finished task uses a **streak freeze** if one is left, otherwise it is recorded as a miss and the streak resets. Days off never break the streak or add to it.
- You start with 1 freeze and earn 1 at every 14-day multiple, up to a maximum of 2.
- Badges: 7 days, Up before 6 AM, Freeze saver, 14 days, 30 days. Milestones after that: 60, 100, 200 and 365 days.
- Insights appear after 3 wake-ups: average wake time, hit rate over 30 days, a 7-day chart of minutes after the goal, and a tip when weekends run 10 or more minutes later than weekdays.
- Missed days are settled (`reconcile`) on launch, every 30 seconds, and whenever the app returns to the front. The app shows a toast when a freeze was used or the streak reset.

## Design system

- Colors: Ember `#FF6B35` (primary), Sun `#FFB627`, Rose `#FF8FA3`, Sky `#7CCBEA` (freezes), Twilight `#2B1B3D` (ink, and text on orange), Dawn `#FFF8F0` (light background), Night `#1C1230` (dark background). The sunrise gradient appears only on Welcome, the Home hero and Celebration. Everything else uses calm cards.
- Type: Nunito, self-hosted in `fonts/`. Scale 56 / 28 / 20 / 17 / 15 / 13 / 12.
- Spacing: 16px between sections, 12px inside cards, 20px side gutters. Card radius 20px. Tap targets at least 44px.
- Buttons: primary (Ember, raised), secondary (flat), text. One line-icon set, drawn as an SVG sprite in `index.html`. No emoji.
- Dark text on orange fills, for contrast. Honors `prefers-reduced-motion`.

## Open ideas raised but not built

- Replace the SVG sun with a proper illustration set; add celebration sound design beyond the current three-note chime; a design handoff spec.
- Export and import a data backup, since data only lives in one browser.
- Anything that needs background alarms or notifications would require moving to a native Android app (for example Expo or React Native). The owner declined that for now, but an improvements review may still weigh it.
