ALPHAYANTRA — installable web app (PWA)

UPLOAD everything in this folder to one https folder on alphayantra.in, e.g.
  https://alphayantra.in/app/
so that https://alphayantra.in/app/ opens index.html.

Files:
  index.html            app shell (registers the service worker, hosts the viewer)
  app.html              the viewer itself (= ALPHAYANTRA Viewer Standalone.html, renamed)
  manifest.json         name, icon, colours, full-screen mode
  sw.js                 service worker — offline cache, network-first updates, notifications
  push.js / push-config.js   watchlist alert client + your VAPID key / Apps Script URL (see NOTIFICATIONS)
  push-relay-worker.js  Cloudflare Worker source (NOT uploaded to alphayantra.in — pasted into Cloudflare, see NOTIFICATIONS)
  push-backend.gs       Apps Script source (NOT uploaded — pasted into Google Sheets → Apps Script)
  trend-states.json     tiny per-stock trend file (SHORT/LONG) — regenerated with every data rebuild
  icon-*.png            app icons

INSTALL on Android: open the URL in Chrome → menu ⋮ → "Install app" (or "Add to Home screen").
iPhone (iOS 17 / 18): use SAFARI (not Chrome/Brave), open the FOLDER url exactly —
  https://alphayantra.in/app/  (with the trailing slash — the page that shows the app) —
  wait for it to fully load, then Share → "Add to Home Screen" → Add.
  If an earlier icon opens in Safari: delete that icon, then Settings → Safari → Clear History
  and Website Data (or at least reload the page once online), and add it again.
  iOS 26: the Add sheet shows an "Open as Web App" switch — leave it ON.
  Check the hosting serves manifest.json as application/json (open it in the browser: it must
  display the JSON, not download or 404).

UPDATING: replace app.html (new viewer standalone) and bump the cache name in sw.js (ay-viewer-v1 → v2).
Users get the new version the next time they open the app while online.

Optional APK: paste the URL into https://www.pwabuilder.com → Android → download the .apk/.aab.

Requirements: https only; all files in the same folder; keep the file names exactly as above.
13 Oct 2026 build: app.html = viewer with data as of 12 Oct 2026 (stocks, MF, world markets, Global X). sw.js cache ay-viewer-v16, index.html iframes app.html?v=20261013. Upload index.html, app.html, sw.js together (replace).

13 Oct 2026 (2nd) build: app.html = viewer with the 30W-EMA long-entry gate, data as of 12 Oct 2026. sw.js cache ay-viewer-v17, index.html iframes app.html?v=20261013b. Upload index.html, app.html, sw.js together (replace).

13 Oct 2026 (3rd) build — WATCHLIST ALERTS: sw.js cache ay-viewer-v19, index.html iframes app.html?v=20261013d. Upload index.html, app.html, sw.js, push.js, push-config.js, trend-states.json together.

==================== NOTIFICATIONS (watchlist trend-change alerts) — NO FIREBASE ====================
What the user sees: Settings (gear, phone) → ALERTS → TURN ON (then SEND TEST to check this phone). Every day around 08:30 IST,
ONE notification lists the watchlist stocks (up to 50) that turned uptrend / downtrend (SHORT and LONG) in the newest data.
Stocks only. Nothing is sent on days with no new data or no changes.
Works on Android (Chrome, installed or in the browser) and iPhone (iOS 16.4+, installed from SAFARI to the Home Screen —
Settings → Notifications → ALPHAYANTRA must be allowed). Without the setup below, Android still gets a best-effort local check
(Chrome decides the time); iPhone needs the full setup.

HOW IT WORKS: the phone subscribes with standard Web Push (VAPID). Apps Script (free, on a Google Sheet) runs the 08:30 job and
hands the messages to a tiny Cloudflare Worker (free) that encrypts them and delivers to Apple / Google push servers
(Apps Script alone cannot — Apple needs HTTP/2). No Firebase, no app store, no paid service.

ONE-TIME SETUP (about 15 minutes):
 A. CLOUDFLARE WORKER (the relay)
    1. https://dash.cloudflare.com → sign up (free) → Workers & Pages → Create → Hello World → name "alphayantra-push" → Deploy.
    2. Edit code → delete everything → paste push-relay-worker.js → Deploy.
    3. Open  https://alphayantra-push.<your-account>.workers.dev/keygen  in a browser → it shows publicKey + privateKey. Keep them.
    4. Worker → Settings → Variables and Secrets → add 4 entries, then Deploy again:
         VAPID_PUBLIC   = publicKey        VAPID_PRIVATE = privateKey (Secret)
         VAPID_SUBJECT  = mailto:you@alphayantra.in
         RELAY_SECRET   = a long random string (Secret) — you will paste the same into Apps Script
 B. GOOGLE APPS SCRIPT (the daily job + phone registry)
    5. Google Sheets → new sheet "AY Push" → Extensions → Apps Script → paste push-backend.gs.
       Project Settings (gear) → Script properties → add
         STATES_URL   = https://alphayantra.in/app/trend-states.json   (your real folder URL)
         RELAY_URL    = https://alphayantra-push.<your-account>.workers.dev/send
         RELAY_SECRET = same as the Worker
       Run setup() once (authorise). Deploy → New deployment → Web app · Execute as Me · Who has access: Anyone → copy the /exec URL.
 C. THE APP
    6. push-config.js → vapidKey = publicKey (step 3), pushApi = /exec URL (step 5). Upload push-config.js with the rest of this folder.
    7. On a phone: open the installed app → Settings → ALERTS → TURN ON → SEND TEST. The notification should arrive within seconds.
       (Apps Script editor → sendTest() sends a test to every registered phone; the Log tab shows what happened.)

EVERY DATA REBUILD: upload the new trend-states.json together with app.html (it is what the 08:30 job compares).
The job only notifies when the file's asOf date changed since its last run — upload before 08:30 IST for same-morning alerts.
To change the time: edit SEND_HOUR / SEND_MIN in push-backend.gs and run setup() again (Apps Script fires within ±15 min).
Phones that uninstalled / revoked are switched to Active = FALSE automatically in the Push tab.
If you ever regenerate the VAPID keys, every phone must TURN ON again.

15 Oct 2026 build: app.html = viewer with data as of 14 Oct 2026 (all universes). sw.js cache ay-viewer-v21, index.html iframes app.html?v=20261015. Upload index.html, app.html, sw.js, trend-states.json together.

15 Oct 2026 (2nd) build: sector map update (93 symbols, 2 new industries), POST IPO 2-3 YEARS screen now = curated list. sw.js cache ay-viewer-v22, index.html iframes app.html?v=20261015b. Upload index.html, app.html, sw.js.

15 Oct 2026 (3rd) build: POST IPO lists survive the SAF sheet override. sw.js cache ay-viewer-v23, index.html iframes app.html?v=20261015c. Upload index.html, app.html, sw.js.

15 Oct 2026 (final) build: data pack rebuilt from the 15 Oct export (2230 stocks incl. new BSE listings, as of 14 Oct). sw.js cache ay-viewer-v30, index.html iframes app.html?v=20261015j. Upload index.html, app.html, sw.js, trend-states.json.

16 Oct 2026 build — PUSH WITHOUT FIREBASE: standard Web Push via Cloudflare relay; watchlist up to 50; SEND TEST button. sw.js cache ay-viewer-v52, index.html iframes app.html?v=20261016e. Upload index.html, app.html, sw.js, push.js, push-config.js, trend-states.json together. Set up the Worker + Apps Script per NOTIFICATIONS (the old Firebase project is no longer used).
