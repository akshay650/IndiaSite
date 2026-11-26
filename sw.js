/* Alphayantra viewer service worker: app shell cached for offline, network-first so updates land on the next open.
   (push notifications removed 8 Nov 2026) */
var V='ay-viewer-v129',SHELL=['./','./index.html','./app.html','./app.html?v=20261126b','./manifest.json','./icon-192.png','./icon-512.png'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){return Promise.all(SHELL.map(function(u){return c.add(new Request(u,{cache:'reload'})).catch(function(){});}));}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V;}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  var u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  if(u.origin!==location.origin){return;}
  if(/\/pack\.csv$/.test(u.pathname)){return;} /* the data pack is always fetched fresh and never cached here (the viewer keeps its own copy) */ /* Google Sheets, fonts, Apps Script: straight to network (app has its own localStorage caches) */
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(function(r){var cp=r.clone();caches.open(V).then(function(c){c.put(e.request,cp);});return r;}).catch(function(){return caches.match(e.request).then(function(m){return m||caches.match('./app.html');});}));
});

/* notifications / push / periodic trend check REMOVED 8 Nov 2026 */
