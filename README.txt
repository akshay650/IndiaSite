ALPHAYANTRA — installable web app (PWA)

UPLOAD everything in this folder to one https folder on alphayantra.in, e.g.
  https://alphayantra.in/app/
so that https://alphayantra.in/app/ opens index.html.

Files:
  index.html            app shell (registers the service worker, hosts the viewer)
  app.html              the viewer itself (= ALPHAYANTRA Viewer Standalone.html, renamed)
  manifest.webmanifest  name, icon, colours, full-screen mode
  sw.js                 service worker — offline cache, network-first updates
  icon-*.png            app icons

INSTALL on Android: open the URL in Chrome → menu ⋮ → "Install app" (or "Add to Home screen").
iPhone: Safari → Share → "Add to Home Screen".

UPDATING: replace app.html (new viewer standalone) and bump the cache name in sw.js (ay-viewer-v1 → v2).
Users get the new version the next time they open the app while online.

Optional APK: paste the URL into https://www.pwabuilder.com → Android → download the .apk/.aab.

Requirements: https only; all files in the same folder; keep the file names exactly as above.