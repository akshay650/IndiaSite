/* Alphayantra viewer service worker: app shell cached for offline, network-first so updates land on the next open.
   + push notifications (FCM web push payload shown here), tap → opens the app,
   + periodic background sync fallback: compares trend-states.json with the last seen states for the stored watchlist (Chrome/Android only). */
var V='ay-viewer-v21',SHELL=['./','./index.html','./app.html','./app.html?v=20261015','./manifest.json','./icon-192.png','./icon-512.png','./push.js','./push-config.js'];
self.addEventListener('install',function(e){e.waitUntil(caches.open(V).then(function(c){return c.addAll(SHELL.map(function(u){return new Request(u,{cache:'reload'});}));}).then(function(){return self.skipWaiting();}));});
self.addEventListener('activate',function(e){e.waitUntil(caches.keys().then(function(ks){return Promise.all(ks.filter(function(k){return k!==V&&k!=='ay-push-store';}).map(function(k){return caches.delete(k);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener('fetch',function(e){
  var u=new URL(e.request.url);
  if(e.request.method!=='GET')return;
  if(u.origin!==location.origin){return;} /* Google Sheets, fonts, Apps Script: straight to network (app has its own localStorage caches) */
  e.respondWith(fetch(e.request,{cache:'no-cache'}).then(function(r){var cp=r.clone();caches.open(V).then(function(c){c.put(e.request,cp);});return r;}).catch(function(){return caches.match(e.request).then(function(m){return m||caches.match('./app.html');});}));
});

/* ---- notifications ---- */
function showNote(title,body,tag){return self.registration.showNotification(title||'ALPHAYANTRA',{body:body||'',icon:'./icon-192.png',badge:'./icon-192.png',tag:tag||'ay-trend',renotify:true,data:{url:'./'}});}
self.addEventListener('push',function(e){
  var d={};try{d=e.data?e.data.json():{};}catch(x){d={notification:{title:'ALPHAYANTRA',body:e.data?e.data.text():''}};}
  var n=d.notification||{},x=d.data||{};
  e.waitUntil(showNote(n.title||x.title,n.body||x.body,x.tag));
});
self.addEventListener('notificationclick',function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(function(cs){
    for(var i=0;i<cs.length;i++){if('focus' in cs[i])return cs[i].focus();}
    return self.clients.openWindow('./');
  }));
});

/* small key/value store on the Cache API (localStorage is not reachable from a service worker) */
function kvGet(k){return caches.open('ay-push-store').then(function(c){return c.match('/__kv/'+k);}).then(function(r){return r?r.json():null;}).catch(function(){return null;});}
function kvSet(k,v){return caches.open('ay-push-store').then(function(c){return c.put('/__kv/'+k,new Response(JSON.stringify(v),{headers:{'Content-Type':'application/json'}}));});}
self.addEventListener('message',function(e){var d=e.data||{};if(d.type==='ay-wl')e.waitUntil(kvSet('wl',{wl:d.wl||[],id:d.id||''}));});

/* Fallback check (no FCM): runs when Chrome wakes us; notifies once per data date, only after 08:30 IST */
function istNow(){var d=new Date(Date.now()+330*60000);return {h:d.getUTCHours(),m:d.getUTCMinutes(),day:d.toISOString().slice(0,10)};}
function trendCheck(){
  var t=istNow();if(t.h<8||(t.h===8&&t.m<30))return Promise.resolve();
  return fetch('./trend-states.json',{cache:'no-cache'}).then(function(r){return r.json();}).then(function(cur){
    return Promise.all([kvGet('wl'),kvGet('prev'),kvGet('done')]).then(function(a){
      var wl=(a[0]&&a[0].wl)||[],prev=a[1],done=a[2];
      if(!cur||!cur.asOf)return;
      if(!prev){return kvSet('prev',cur);} /* first run: remember, nothing to compare */
      if(prev.asOf===cur.asOf||(done&&done===cur.asOf))return;
      var up={S:[],L:[]},dn={S:[],L:[]};
      ['S','L'].forEach(function(T){wl.forEach(function(s){var a0=prev[T]&&prev[T][s],b0=cur[T]&&cur[T][s];if(!a0||!b0||a0===b0)return;if(b0==='U'&&a0!=='U')up[T].push(s);else if(b0==='D'&&a0!=='D')dn[T].push(s);});});
      var parts=[];
      ['S','L'].forEach(function(T){var lbl=T==='S'?'SHORT':'LONG';if(up[T].length)parts.push(lbl+' \u25b2 uptrend: '+up[T].join(', '));if(dn[T].length)parts.push(lbl+' \u25bc downtrend: '+dn[T].join(', '));});
      var p=[kvSet('prev',cur),kvSet('done',cur.asOf)];
      if(parts.length)p.push(showNote('ALPHAYANTRA \u00b7 Watchlist trend changes \u00b7 '+cur.asOf,parts.join('\n'),'ay-trend-'+cur.asOf));
      return Promise.all(p);
    });
  }).catch(function(){});
}
self.addEventListener('periodicsync',function(e){if(e.tag==='ay-trend')e.waitUntil(trendCheck());});
self.addEventListener('message',function(e){var d=e.data||{};if(d.type==='ay-check')e.waitUntil(trendCheck());});
