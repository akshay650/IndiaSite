/* ALPHAYANTRA push relay — Cloudflare Worker (free plan is plenty).
   Why: Apps Script cannot do Web Push encryption or HTTP/2 (Apple's push servers require HTTP/2). This Worker does both.
   It never stores anything. push-backend.gs POSTs {secret, messages:[{sub, payload}]} here; the Worker encrypts each payload
   for that phone's subscription (RFC 8291 aes128gcm), signs a VAPID token (RFC 8292) and delivers it to Apple / Google / Mozilla.

   SETUP (once, ~5 minutes):
     1. https://dash.cloudflare.com → Workers & Pages → Create → "Hello World" worker → name it e.g. alphayantra-push → Deploy.
     2. Edit code → replace everything with this file → Deploy.
     3. Open https://<worker-name>.<account>.workers.dev/keygen in a browser → copy the JSON it shows (publicKey / privateKey).
     4. Worker → Settings → Variables and Secrets → add:
          VAPID_PUBLIC   = publicKey from step 3
          VAPID_PRIVATE  = privateKey from step 3            (type: Secret)
          VAPID_SUBJECT  = mailto:you@alphayantra.in
          RELAY_SECRET   = any long random string            (type: Secret) — the same value goes into Apps Script
        Deploy again.
     5. push-config.js → vapidKey = publicKey. Apps Script → Script properties → RELAY_URL = https://<worker>.workers.dev/send, RELAY_SECRET.
   Keys are generated once; changing VAPID_PUBLIC later invalidates every phone's subscription (they must TURN ON again). */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
    if (req.method === 'OPTIONS') return new Response('', { headers: cors });
    try {
      if (url.pathname === '/keygen') return json(await keygen(), cors);
      if (url.pathname === '/send' && req.method === 'POST') {
        const d = await req.json();
        if (!env.RELAY_SECRET || d.secret !== env.RELAY_SECRET) return json({ ok: false, error: 'bad secret' }, cors, 403);
        if (!env.VAPID_PUBLIC || !env.VAPID_PRIVATE) return json({ ok: false, error: 'VAPID keys not set' }, cors, 500);
        const msgs = Array.isArray(d.messages) ? d.messages.slice(0, 500) : [];
        const results = [];
        for (let i = 0; i < msgs.length; i += 20) results.push(...await Promise.all(msgs.slice(i, i + 20).map(m => sendOne(env, m).catch(e => ({ status: 'err', detail: String(e).slice(0, 200) })))));
        return json({ ok: true, results }, cors);
      }
      return json({ ok: true, service: 'alphayantra-push-relay', publicKey: env.VAPID_PUBLIC || null }, cors);
    } catch (e) { return json({ ok: false, error: String(e).slice(0, 300) }, cors, 500); }
  }
};

function json(o, h, status) { return new Response(JSON.stringify(o), { status: status || 200, headers: h }); }
const te = new TextEncoder();
const b64u = { enc: b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: s => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); } };
function cat(...a) { const n = a.reduce((s, x) => s + x.length, 0), o = new Uint8Array(n); let p = 0; for (const x of a) { o.set(x, p); p += x.length; } return o; }

async function keygen() {
  const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const j = await crypto.subtle.exportKey('jwk', k.privateKey);
  const pub = cat(new Uint8Array([4]), b64u.dec(j.x), b64u.dec(j.y));
  return { publicKey: b64u.enc(pub), privateKey: j.d, note: 'Copy both into the Worker variables (VAPID_PUBLIC / VAPID_PRIVATE) and publicKey into push-config.js vapidKey. Generate ONCE.' };
}

async function vapidJwt(env, audience) {
  const pub = b64u.dec(env.VAPID_PUBLIC);
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u.enc(pub.slice(1, 33)), y: b64u.enc(pub.slice(33, 65)), d: env.VAPID_PRIVATE };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const h = b64u.enc(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const c = b64u.enc(te.encode(JSON.stringify({ aud: audience, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'mailto:admin@alphayantra.in' })));
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(h + '.' + c));
  return h + '.' + c + '.' + b64u.enc(sig);
}

/* RFC 8291 aes128gcm encryption of one payload for one subscription */
async function encrypt(sub, plaintext) {
  const ua = b64u.dec(sub.keys.p256dh), auth = b64u.dec(sub.keys.auth);
  const uaKey = await crypto.subtle.importKey('raw', ua, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hk = async (saltB, ikm, info, len) => { const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']); return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: saltB, info }, k, len * 8)); };
  const ikm = await hk(auth, shared, cat(te.encode('WebPush: info\0'), ua, localPub), 32);
  const cek = await hk(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hk(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aes, cat(te.encode(plaintext), new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return cat(salt, rs, new Uint8Array([localPub.length]), localPub, ct);
}

async function sendOne(env, m) {
  const sub = m.sub || {};
  if (!sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return { status: 'dead', detail: 'bad subscription' };
  const body = await encrypt(sub, JSON.stringify(m.payload || {}));
  const aud = new URL(sub.endpoint).origin;
  const jwt = await vapidJwt(env, aud);
  const headers = { 'Content-Type': 'application/octet-stream', 'Content-Encoding': 'aes128gcm', TTL: String(m.ttl || 43200), Urgency: m.urgency || 'high',
    Authorization: 'vapid t=' + jwt + ', k=' + env.VAPID_PUBLIC };
  if (m.topic) headers.Topic = String(m.topic).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
  const r = await fetch(sub.endpoint, { method: 'POST', headers, body });
  if (r.status === 201 || r.status === 200) return { status: 'ok' };
  if (r.status === 404 || r.status === 410) return { status: 'dead' };
  return { status: 'err', code: r.status, detail: (await r.text()).slice(0, 200) };
}
