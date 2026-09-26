# Risewell

Wake up, do one tiny thing, keep the streak. An offline, installable web app (PWA) for Android. No accounts, no server, no tracking: everything is stored on the phone.

## How it works

- Set a wake goal (for example 7:00 AM), the days it applies, and a wake window (15, 30 or 60 minutes).
- Each wake day, tap **I’m Awake** between 2 hours before your goal and the end of the window, then finish your tiny task. That adds one day to the streak.
- A scheduled day with no finished task uses a **streak freeze** if you have one, otherwise the streak restarts. You start with 1 freeze and earn another every 14 days (max 2).
- Days you turn off never break the streak.
- Risewell cannot ring alarms (web apps can’t run while closed). Set a matching alarm in your phone’s Clock app.

## Install on your Android phone

The app has to be served over **HTTPS** to install and work offline. The quickest free option:

1. Run `npm run build`. This creates the `dist/` folder.
2. Open https://app.netlify.com/drop on your computer and drag the `dist` folder onto the page. You get an `https://….netlify.app` link. (Netlify asks you to sign up to keep the site longer than an hour.)
3. On your phone, open that link in **Chrome**.
4. Tap the menu (⋮), then **Add to Home screen**, then **Install**.
5. Open Risewell from your home screen once while online. After that it works with no connection.

Other free static hosts (GitHub Pages, Cloudflare Pages) work the same way: upload the contents of `dist/`.

Your data lives in the browser storage for that one link. Installing from a different link starts a fresh streak.

## Develop

```bash
npm install
npm start          # serves the app at http://localhost:8765
npm test           # streak rule tests
npm run icons      # regenerate icons/*.png
npm run build      # copy app files to dist/
```

To test a morning at any hour, pin the clock with a query string: `http://localhost:8765/?now=2026-09-28T06:40`.

After changing any cached file, bump `VERSION` in `sw.js` so installed copies pick up the update.

## Files

| Path | Purpose |
|---|---|
| `index.html` | All screens |
| `css/app.css` | Design tokens and components, light and dark |
| `js/logic.js` | Streak rules (pure functions, tested) |
| `js/app.js` | Navigation, rendering, storage, share image |
| `sw.js` | Offline cache |
| `manifest.webmanifest` | Install metadata |
| `tests/logic.test.mjs` | Tests for the streak rules |
| `tools/` | Icon generator and build script |
| `prototype/risewell.html` | The original design prototype |
