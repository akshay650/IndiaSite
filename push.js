/* ALPHAYANTRA push client (runs in the PWA shell index.html; the viewer iframe calls parent.ayPush).
   Standard Web Push, no Firebase: enable → notification permission → PushManager.subscribe(VAPID public key)
   → POST {id, sub, watchlist} to push-backend.gs (Apps Script), which sends through the Cloudflare relay every morning.
   Works on Android (Chrome, installed or in the browser) and iPhone (iOS 16.4+, installed to the Home Screen from Safari).
   Fallback when push is unavailable or not configured: Chrome Periodic Background Sync (the service worker compares trend-states.json itself). */
(function(){
  var CFG=window.AY_PUSH_CFG||{},KEY='ay_push_v2',WL_KEY='ay_watchlist_v1';
  try{if(!localStorage.getItem(KEY)&&localStorage.getItem('ay_push_v1')){var o1=JSON.parse(localStorage.getItem('ay_push_v1'))||{};localStorage.setItem(KEY,JSON.stringify({id:o1.id,on:false}));}}catch(e){} /* v1 = Firebase era: keep the device id, require TURN ON again */
  function st(){try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch(e){return {};}}
  function save(o){try{localStorage.setItem(KEY,JSON.stringify(o));}catch(e){}}
  function wl(){try{return (JSON.parse(localStorage.getItem(WL_KEY)||'[]')||[]).filter(function(x){return typeof x==='string';}).slice(0,50);}catch(e){return [];}}
  function configured(){return !!(CFG.vapidKey&&CFG.vapidKey.indexOf('PASTE')<0&&CFG.pushApi&&CFG.pushApi.indexOf('PASTE')<0);}
  function isIOS(){return /iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);}
  function standalone(){return window.matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;}
  function supported(){
    if(!('serviceWorker' in navigator)||!('Notification' in window))return {ok:false,why:'This browser cannot show notifications.'};
    if(isIOS()&&!standalone())return {ok:false,why:'On iPhone, first add ALPHAYANTRA to the Home Screen (Safari \u2192 Share \u2192 Add to Home Screen) and open it from there.'};
    if(!('PushManager' in window)&&!('periodicSync' in (ServiceWorkerRegistration.prototype||{})))return {ok:false,why:'Notifications are not available in this browser.'};
    return {ok:true};
  }
  function b64ToU8(s){s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a;}
  function reg(){return navigator.serviceWorker.getRegistration('./').then(function(r){return r||navigator.serviceWorker.ready;});}
  function post(body){
    if(!CFG.pushApi||CFG.pushApi.indexOf('PASTE')===0)return Promise.resolve();
    return fetch(CFG.pushApi,{method:'POST',mode:'no-cors',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)}).catch(function(){});
  }
  function id(){var s=st();if(!s.id){s.id='d'+Math.random().toString(36).slice(2,10)+Date.now().toString(36);save(s);}return s.id;}
  function plat(){return isIOS()?'ios':/Android/i.test(navigator.userAgent)?'android':'web';}
  function swStore(r){try{if(r&&r.active)r.active.postMessage({type:'ay-wl',wl:wl(),id:id()});}catch(e){}}
  function subscribe(r){
    if(!configured()||!('PushManager' in window)||!r.pushManager)return Promise.resolve(null);
    return r.pushManager.getSubscription().then(function(s){
      if(s){ /* a subscription made with a different key must be replaced */
        var k=s.options&&s.options.applicationServerKey;var same=false;
        try{var cur=b64ToU8(CFG.vapidKey),old=k?new Uint8Array(k):null;same=!!old&&old.length===cur.length&&old.every(function(v,i){return v===cur[i];});}catch(e){}
        if(same)return s;return s.unsubscribe().then(function(){return null;});
      }
      return null;
    }).then(function(s){return s||r.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64ToU8(CFG.vapidKey)});})
    .then(function(s){return s?s.toJSON():null;}).catch(function(e){console.warn('push subscribe failed',e);return null;});
  }
  function register(sub,on){return post({type:'push',id:id(),sub:sub,wl:wl(),plat:plat(),tz:'Asia/Kolkata',on:on!==false});}
  function enable(){
    var sup=supported();if(!sup.ok)return Promise.reject(new Error(sup.why));
    return Notification.requestPermission().then(function(p){
      if(p!=='granted')throw new Error('Notifications were not allowed. Enable them for ALPHAYANTRA in your phone settings and try again.');
      return reg();
    }).then(function(r){
      swStore(r);
      var s=st();s.on=true;s.mode='local';save(s);
      return subscribe(r).then(function(sub){
        var s2=st();
        if(sub&&sub.endpoint){s2.sub=sub;s2.mode='push';save(s2);return register(sub,true).then(function(){return status();});}
        if(r.periodicSync){return r.periodicSync.register('ay-trend',{minInterval:6*60*60*1000}).then(function(){s2.mode='local';save(s2);return status();}).catch(function(){s2.mode='local';save(s2);return status();});}
        return status();
      });
    });
  }
  function disable(){
    var s=st();
    var p=s.sub?register(s.sub,false):Promise.resolve();
    return p.then(function(){return reg();}).then(function(r){
      if(r&&r.periodicSync)r.periodicSync.unregister('ay-trend').catch(function(){});
      if(r&&r.pushManager)return r.pushManager.getSubscription().then(function(x){return x?x.unsubscribe():null;}).catch(function(){});
    }).then(function(){save({id:s.id,on:false});return status();});
  }
  var _syncT=null;
  function sync(){ /* watchlist changed in the viewer */
    var s=st();if(!s.on)return;
    reg().then(swStore);
    if(!s.sub)return;
    clearTimeout(_syncT);_syncT=setTimeout(function(){register(s.sub,true);},1500);
  }
  function test(){ /* ask the backend to send a test notification to THIS phone right now */
    var s=st();if(!s.on||!s.sub)return Promise.reject(new Error('Turn alerts on first.'));
    return post({type:'test',id:id(),sub:s.sub});
  }
  function status(){var s=st();return {on:!!s.on,mode:s.on?(s.sub?'push':'local'):null,plat:plat(),perm:('Notification' in window)?Notification.permission:'unsupported',supported:supported(),configured:configured()};}
  window.ayPush={enable:enable,disable:disable,sync:sync,test:test,status:status,supported:supported};
  /* keep the server copy fresh on every open (watchlist may have changed while offline; iOS may rotate the endpoint) */
  window.addEventListener('load',function(){setTimeout(function(){var s=st();if(!s.on)return;if(s.sub&&configured()){reg().then(function(r){swStore(r);return subscribe(r);}).then(function(sub){if(sub&&sub.endpoint){var s2=st();s2.sub=sub;save(s2);register(sub,true);}});}else sync();},4000);});
})();
