/* ALPHAYANTRA — Watchlist trend-change push notifications (Google Apps Script, bound to a Google Sheet). NO FIREBASE.
   Delivery = standard Web Push through the Cloudflare relay (pwa/push-relay-worker.js), which encrypts + signs (VAPID)
   and talks HTTP/2 to Apple / Google / Mozilla push servers.
   Tabs (created by setup()):
     Push  : Id | Subscription (JSON) | Platform | Watchlist (comma list) | Updated | Active
     State : Symbol | SHORT | LONG          (last seen trend state per stock, U/D/N)
     Log   : Timestamp | Message
   ONE-TIME SETUP (see pwa/README.txt "NOTIFICATIONS"):
     1. Project Settings (gear) → Script properties:
          STATES_URL   = https://alphayantra.in/app/trend-states.json
          RELAY_URL    = https://<your-worker>.workers.dev/send
          RELAY_SECRET = the same RELAY_SECRET you set on the Worker
     2. Run setup() once (authorise). It creates the tabs AND the daily 08:30 IST trigger.
     3. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → copy the /exec URL
        into pwa/push-config.js (pushApi).
   The job runs daily ~08:30 IST: fetches trend-states.json, compares every stock with the State tab,
   and sends ONE summary notification per phone listing its watchlist stocks that changed trend
   (SHORT and LONG). Nothing is sent when the data date has not changed or when nothing on a watchlist changed. */

var SEND_HOUR = 8, SEND_MIN = 30;

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var p = ss.getSheetByName('Push') || ss.insertSheet('Push');
  if (p.getLastRow() === 0) p.appendRow(['Id', 'Subscription', 'Platform', 'Watchlist', 'Updated', 'Active']);
  p.setFrozenRows(1);
  var s = ss.getSheetByName('State') || ss.insertSheet('State');
  if (s.getLastRow() === 0) s.appendRow(['Symbol', 'SHORT', 'LONG']);
  var l = ss.getSheetByName('Log') || ss.insertSheet('Log');
  if (l.getLastRow() === 0) l.appendRow(['Timestamp', 'Message']);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'sendDaily') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendDaily').timeBased().everyDays(1).atHour(SEND_HOUR).nearMinute(SEND_MIN).inTimezone('Asia/Kolkata').create();
  log('setup done');
}

function clean(s, max) { return String(s || '').replace(/[\u0000-\u001F]/g, '').trim().slice(0, max); }
function out(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function log(m) { try { SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Log').appendRow([new Date(), String(m).slice(0, 2000)]); } catch (e) {} }
function prop(k) { return PropertiesService.getScriptProperties().getProperty(k); }
/* a browser PushSubscription.toJSON(): {endpoint, keys:{p256dh, auth}} */
function subOk(s) { return !!(s && typeof s === 'object' && /^https:\/\//.test(String(s.endpoint || '')) && s.keys && s.keys.p256dh && s.keys.auth); }
function subKey(s) { return s ? clean(s.endpoint, 600) : ''; }

/* phone → {type:'push', id, sub, wl:[...], plat, on:true|false}  or  {type:'test', id, sub} */
function doPost(e) {
  try {
    var d = JSON.parse(e.postData.contents || '{}');
    var id = clean(d.id, 40);
    if (!id || !subOk(d.sub)) return out({ ok: false });
    var sub = { endpoint: clean(d.sub.endpoint, 600), keys: { p256dh: clean(d.sub.keys.p256dh, 200), auth: clean(d.sub.keys.auth, 100) } };
    if (d.type === 'test') {
      var r = relay([{ sub: sub, payload: { title: 'ALPHAYANTRA', body: 'Test notification \u2014 watchlist alerts are on for this phone.', tag: 'ay-test', url: './' }, topic: 'ay-test' }]);
      log('test → ' + id + ' ' + JSON.stringify(r[0] || {}));
      return out({ ok: true, result: r[0] || null });
    }
    if (d.type !== 'push') return out({ ok: false });
    var wl = (Array.isArray(d.wl) ? d.wl : []).map(function (x) { return clean(x, 30).toUpperCase(); }).filter(Boolean).slice(0, 50);
    var lock = LockService.getScriptLock(); lock.waitLock(10000);
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Push');
    var vals = sh.getDataRange().getValues(), row = -1;
    for (var i = 1; i < vals.length; i++) { var old = parseSub(vals[i][1]); if (vals[i][0] === id || (old && old.endpoint === sub.endpoint)) { row = i + 1; break; } }
    var rec = [id, JSON.stringify(sub), clean(d.plat, 10), wl.join(','), new Date(), d.on !== false];
    if (row < 0) sh.appendRow(rec); else sh.getRange(row, 1, 1, 6).setValues([rec]);
    lock.releaseLock();
    return out({ ok: true });
  } catch (err) { log('doPost ' + err); return out({ ok: false }); }
}
function parseSub(v) { try { var o = JSON.parse(String(v || '')); return subOk(o) ? o : null; } catch (e) { return null; } }

function doGet() { return out({ ok: true, service: 'alphayantra-push', relay: !!prop('RELAY_URL') }); }

/* ---------- daily job ---------- */
function sendDaily() {
  var url = prop('STATES_URL');
  if (!url) { log('STATES_URL missing'); return; }
  var cur;
  try { cur = JSON.parse(UrlFetchApp.fetch(url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), { muteHttpExceptions: true }).getContentText()); } catch (e) { log('fetch failed ' + e); return; }
  if (!cur || !cur.asOf || !cur.S) { log('bad states file'); return; }
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LAST_ASOF') === cur.asOf) { log('no new data (' + cur.asOf + ')'); return; }

  var ss = SpreadsheetApp.getActiveSpreadsheet(), stSh = ss.getSheetByName('State');
  var prevRows = stSh.getDataRange().getValues().slice(1), prev = { S: {}, L: {} };
  prevRows.forEach(function (r) { if (r[0]) { prev.S[r[0]] = r[1]; prev.L[r[0]] = r[2]; } });
  var first = prevRows.length === 0;

  var chg = { S: {}, L: {} };
  ['S', 'L'].forEach(function (T) {
    var m = cur[T] || {};
    Object.keys(m).forEach(function (s) {
      var a = prev[T][s], b = m[s];
      if (!a || a === b) return;
      if (b === 'U') chg[T][s] = 'up'; else if (b === 'D' && a === 'U') chg[T][s] = 'down';
    });
  });

  var syms = Object.keys(cur.S);
  stSh.clearContents();
  stSh.getRange(1, 1, 1, 3).setValues([['Symbol', 'SHORT', 'LONG']]);
  if (syms.length) stSh.getRange(2, 1, syms.length, 3).setValues(syms.map(function (s) { return [s, cur.S[s] || '', (cur.L || {})[s] || '']; }));
  props.setProperty('LAST_ASOF', cur.asOf);
  if (first) { log('first run: stored ' + syms.length + ' states for ' + cur.asOf + ', nothing sent'); return; }

  // one summary per phone
  var pSh = ss.getSheetByName('Push'), rows = pSh.getDataRange().getValues(), msgs = [], rowOf = [];
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i]; if (r[5] !== true) continue;
    var sub = parseSub(r[1]); if (!sub) continue;
    var wl = String(r[3] || '').split(',').filter(Boolean), parts = [];
    ['S', 'L'].forEach(function (T) {
      var up = wl.filter(function (s) { return chg[T][s] === 'up'; }), dn = wl.filter(function (s) { return chg[T][s] === 'down'; });
      var lbl = T === 'S' ? 'SHORT' : 'LONG';
      if (up.length) parts.push(lbl + ' \u25b2 uptrend: ' + up.join(', '));
      if (dn.length) parts.push(lbl + ' \u25bc downtrend: ' + dn.join(', '));
    });
    if (!parts.length) continue;
    msgs.push({ sub: sub, payload: { title: 'ALPHAYANTRA \u00b7 Watchlist trend changes \u00b7 ' + cur.asOf, body: parts.join('\n'), tag: 'ay-trend-' + cur.asOf, url: './' }, topic: 'ay-trend' });
    rowOf.push(i + 1);
  }
  var res = relay(msgs), sent = 0, dead = [];
  res.forEach(function (x, k) { if (x.status === 'ok') sent++; else if (x.status === 'dead') dead.push(rowOf[k]); });
  dead.forEach(function (rowNo) { pSh.getRange(rowNo, 6).setValue(false); });
  log('sent ' + sent + ' of ' + msgs.length + ' for ' + cur.asOf + (dead.length ? ', deactivated ' + dead.length : ''));
}

/* ---------- relay (Cloudflare Worker) ---------- */
function relay(messages) {
  if (!messages.length) return [];
  var url = prop('RELAY_URL'), secret = prop('RELAY_SECRET');
  if (!url || !secret) { log('RELAY_URL / RELAY_SECRET missing'); return messages.map(function () { return { status: 'err', detail: 'relay not configured' }; }); }
  var outAll = [];
  for (var i = 0; i < messages.length; i += 100) {
    var batch = messages.slice(i, i + 100);
    try {
      var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ secret: secret, messages: batch }), muteHttpExceptions: true });
      var j = JSON.parse(r.getContentText() || '{}');
      if (r.getResponseCode() !== 200 || !j.ok) { log('relay ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300)); batch.forEach(function () { outAll.push({ status: 'err' }); }); continue; }
      (j.results || []).forEach(function (x) { outAll.push(x || { status: 'err' }); });
      while (outAll.length < i + batch.length) outAll.push({ status: 'err' });
      j.results.forEach(function (x) { if (x && x.status === 'err') log('push err ' + (x.code || '') + ' ' + (x.detail || '')); });
    } catch (e) { log('relay failed ' + e); batch.forEach(function () { outAll.push({ status: 'err' }); }); }
  }
  return outAll;
}

/* Manual test from the editor: sends "Test" to every active phone */
function sendTest() {
  var rows = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Push').getDataRange().getValues(), msgs = [];
  for (var i = 1; i < rows.length; i++) { var s = rows[i][5] === true ? parseSub(rows[i][1]) : null; if (s) msgs.push({ sub: s, payload: { title: 'ALPHAYANTRA', body: 'Test notification \u2014 watchlist alerts are on.', tag: 'ay-test', url: './' }, topic: 'ay-test' }); }
  var res = relay(msgs), n = res.filter(function (x) { return x.status === 'ok'; }).length;
  log('test sent to ' + n + ' of ' + msgs.length + ' ' + JSON.stringify(res).slice(0, 500));
}
