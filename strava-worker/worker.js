// Worker Cloudflare : relais « Garmin → intervals.icu → app » pour l'app Ironman Sables 2027.
//
//  Garmin Connect ──(synchro native)──▶ intervals.icu ◀──(clé API)── ce Worker ──▶ l'app (iPhone)
//
// L'app interroge /api/activities (toutes les 2 min tant qu'elle est ouverte). Si les données en cache ont plus de
// 4 minutes, le Worker relit intervals.icu (1 seul appel) ; sinon il répond depuis le cache KV.
// Si intervals.icu est indisponible ou refuse l'accès, le dernier cache reste servi et l'erreur est signalée à l'app.
//
// Routes (toutes protégées par l'en-tête Authorization: Bearer APP_KEY) :
//   GET  /api/activities?since=YYYY-MM-DD   activités compactes + état
//   POST /api/sync                          force une relecture d'intervals.icu
//   GET  /api/status                        état de la connexion
//   GET  /api/activity?id=i123              détail d'une activité : séries/tours, courbes (FC, vitesse, altitude), découpage par km
//   GET|POST|PUT|DELETE /api/events[/<id>]       calendrier d'intervals.icu : séances planifiées (envoyées ensuite vers Garmin par intervals.icu)
//   GET  /api/event-file?id=..&ext=fit      export d'une séance planifiée (fichier de séance Garmin .fit / .zwo), en base64
//   PUT  /api/sport-settings/<id>           modifie un réglage de sport d'intervals.icu (seuil d'allure…)
//   GET  /api/sport-settings                réglages par sport d'intervals.icu (seuils, zones) : lecture seule
//   GET  /api/debug                         diagnostic : champs bruts de la 1re activité (sans données personnelles longues)
//
// Secrets  : INTERVALS_API_KEY (intervals.icu → Réglages → Developer Settings), APP_KEY (clé choisie, saisie dans l'app)
// Variables: ALLOWED_ORIGIN, SINCE, INTERVALS_ATHLETE_ID (optionnel, « 0 » = le propriétaire de la clé)
// Stockage : namespace KV lié sous le nom « KV » (clés : acts, meta, synced, error, det2:<id> = détail en cache 60 j)

const BASE = 'https://intervals.icu/api/v1';
const STALE_MS = 4 * 60 * 1000;

export default {
  async fetch(req, env) {
    return addCors(req, env, await route(req, env));
  },
};

async function route(req, env) {
  {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(env, new Response(null, { status: 204 }));
    try {
      if (url.pathname.startsWith('/api/')) {
        if (url.pathname === '/api/admin/stats' && req.method === 'GET') return authorized(req, env) ? adminStats(url, env) : json({ error: 'unauthorized' }, 401);
        const cr = credentials(req, env);
        if (!cr) return cors(env, json({ error: 'unauthorized' }, 401));
        env = cr;
        if (url.pathname === '/api/activities' && req.method === 'GET') return cors(env, await apiActivities(url, env));
        if (url.pathname === '/api/status' && req.method === 'GET') return cors(env, await apiStatus(env));
        if (url.pathname === '/api/sync' && req.method === 'POST') return cors(env, await apiSync(env));
        if (url.pathname.startsWith('/api/events')) return apiEvents(req, url, env);
        if (url.pathname === '/api/event-file' && req.method === 'GET') return apiEventFile(url, env);
        if (url.pathname.startsWith('/api/sport-settings/') && req.method === 'PUT') return apiSportSettingsPut(req, url, env);
        if (url.pathname === '/api/sport-settings' && req.method === 'GET') return json((await intervalsReq(env, 'GET', `/athlete/${encodeURIComponent(env.INTERVALS_ATHLETE_ID || '0')}/sport-settings`)).data);
        if (url.pathname === '/api/activity' && req.method === 'GET') return cors(env, await apiActivity(url, env));
        if (url.pathname === '/api/debug' && req.method === 'GET') return cors(env, await apiDebug(env));
        return cors(env, json({ error: 'not_found' }, 404));
      }
      if (url.pathname === '/pub/races' && req.method === 'GET') return pubRaces(url, env);
      if (url.pathname === '/pub/ev' && req.method === 'POST') return pubEvent(req, env);
      if (url.pathname.startsWith('/pub/sync/')) return pubSync(req, url, env);
      if (url.pathname === '/pub/config' && req.method === 'GET') return json({ googleClientId: env.GOOGLE_CLIENT_ID && env.SESSION_SECRET && env.DB ? env.GOOGLE_CLIENT_ID : '' });   // pas annoncée tant que le secret de session ou la base manquent : l'app ne se verrouille pas par erreur
      if (url.pathname === '/pub/auth/google' && req.method === 'POST') return authGoogle(req, env);
      if (url.pathname.startsWith('/pub/account')) return accountRoutes(req, url, env);
      return new Response('Ironman Garmin worker : OK', { status: 200 });
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  }
}

/* ---------- Recherche de courses (publique, sans compte) : épreuves de la fédération internationale (World Triathlon) ----------
   Route : GET /pub/races?q=<texte>&from=<AAAA-MM-JJ>   Secret : WT_API_KEY (clé gratuite : https://apps-api.triathlon.org/register)
   La clé reste ici : le navigateur ne la voit jamais. Réponses mises en cache 6 h (1 h si aucun résultat) : même recherche = pas de nouvel appel.
   On utilise /events?name= (liste filtrée par date) : l'endpoint /search/events ne renvoie aucune épreuve à venir.
   Sans clé, ou si l'API est indisponible, on répond {ok:false} et l'app retombe sur son catalogue intégré. */
async function pubRaces(url, env) {
  const q = (url.searchParams.get('q') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
  const fromRaw = url.searchParams.get('from') || '';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : ymd(new Date());
  if (q.length < 3) return json({ ok: true, events: [] });
  if (!env.WT_API_KEY) return json({ ok: false, reason: 'no-key', events: [] });
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  const ck = new Request('https://cache.local/pub-races2?q=' + encodeURIComponent(q.toLowerCase()) + '&from=' + from);
  if (cache) {
    const hit = await cache.match(ck);
    if (hit) return hit;
  }
  let r;
  try {
    r = await fetch('https://api.triathlon.org/v1/events?' + new URLSearchParams({ name: q, start_date: from, per_page: '10', order: 'asc' }), {
      headers: { apikey: env.WT_API_KEY, Accept: 'application/json', 'User-Agent': 'triathlon-plan-app' },
    });
  } catch (e) {
    return json({ ok: false, reason: 'unreachable', events: [] });
  }
  if (!r.ok) return json({ ok: false, reason: 'upstream-' + r.status, events: [] });
  let j;
  try {
    j = await r.json();
  } catch (e) {
    return json({ ok: false, reason: 'bad-json', events: [] });
  }
  const events = (Array.isArray(j.data) ? j.data : [])
    .map((e) => ({
      id: e.event_id,
      title: e.event_title || e.title || '',
      venue: e.event_venue || '',
      country: e.event_country || '',
      cc: e.event_country_isoa2 || '',
      date: String(e.event_date || '').slice(0, 10),
      end: String(e.event_finish_date || '').slice(0, 10),
      specs: (e.event_specifications || []).map((s) => s.cat_name).filter(Boolean),
    }))
    .filter((e) => e.title && /^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date >= from)
    .slice(0, 10);
  const res = new Response(JSON.stringify({ ok: true, events }), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=' + (events.length ? 21600 : 3600) } });
  if (cache) await cache.put(ck, res.clone());
  return res;
}

/* ---------- Comptes : connexion Google ----------
   Le navigateur obtient un jeton d'identité (JWT RS256) auprès de Google ; ici on vérifie sa signature avec les clés publiques de Google,
   l'émetteur, l'audience (GOOGLE_CLIENT_ID) et l'expiration, puis on crée / met à jour l'utilisateur et on délivre un jeton de session signé
   (HMAC-SHA256 avec le secret SESSION_SECRET, valable 90 jours). Données conservées : identifiant Google (sub), e-mail, nom, dates de connexion,
   et le plan de l'utilisateur (JSON). Routes (en-tête X-Session) : GET /pub/account · GET|PUT /pub/account/data · GET /pub/account/export · DELETE /pub/account */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (t) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (t.length % 4)) % 4)), (c) => c.charCodeAt(0));
const SESSION_DAYS = 90;
async function googleKeys() {
  const ck = new Request('https://cache.local/google-jwks');
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) { const hit = await cache.match(ck); if (hit) return hit.json(); }
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('clés Google indisponibles');
  const text = await r.text();
  if (cache) await cache.put(ck, new Response(text, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' } }));
  return JSON.parse(text);
}
async function verifyGoogle(env, credential) {
  const parts = String(credential || '').split('.');
  if (parts.length !== 3) throw new Error('jeton invalide');
  const header = JSON.parse(dec.decode(unb64u(parts[0]))), p = JSON.parse(dec.decode(unb64u(parts[1])));
  if (header.alg !== 'RS256') throw new Error('algorithme refusé');
  const jwk = ((await googleKeys()).keys || []).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('clé inconnue');
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, unb64u(parts[2]), enc.encode(parts[0] + '.' + parts[1]));
  if (!ok) throw new Error('signature invalide');
  if (p.iss !== 'accounts.google.com' && p.iss !== 'https://accounts.google.com') throw new Error('émetteur invalide');
  if (!env.GOOGLE_CLIENT_ID || p.aud !== env.GOOGLE_CLIENT_ID) throw new Error('audience invalide');
  if (!p.exp || p.exp * 1000 < Date.now()) throw new Error('jeton expiré');
  if (!p.sub || !p.email || p.email_verified === false) throw new Error('e-mail non vérifié');
  return { sub: String(p.sub), email: String(p.email).slice(0, 200), name: String(p.name || '').slice(0, 100) };
}
async function hmacKey(env) {
  if (!env.SESSION_SECRET) throw new Error('SESSION_SECRET manquant');
  return crypto.subtle.importKey('raw', enc.encode(env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function makeSession(env, sub) {
  const body = b64u(enc.encode(JSON.stringify({ sub, exp: Date.now() + SESSION_DAYS * 86400000 })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), enc.encode(body));
  return body + '.' + b64u(sig);
}
async function readSession(req, env) {
  const t = (req.headers.get('X-Session') || '').split('.');
  if (t.length !== 2 || !env.SESSION_SECRET) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), unb64u(t[1]), enc.encode(t[0]));
    if (!ok) return null;
    const p = JSON.parse(dec.decode(unb64u(t[0])));
    return p && p.sub && p.exp > Date.now() ? p.sub : null;
  } catch (e) { return null; }
}
async function authGoogle(req, env) {
  if (!env.DB || !env.GOOGLE_CLIENT_ID || !env.SESSION_SECRET) return json({ ok: false, error: 'connexion non configurée' }, 501);
  let b = null;
  try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'corps invalide' }, 400); }
  let u;
  try { u = await verifyGoogle(env, b && b.credential); } catch (e) { return json({ ok: false, error: String((e && e.message) || e) }, 401); }
  const now = Date.now();
  await env.DB.prepare('INSERT INTO users (id, email, name, created, last_login, v) VALUES (?, ?, ?, ?, ?, 0) ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, last_login = excluded.last_login').bind(u.sub, u.email, u.name, now, now).run();
  return json({ ok: true, token: await makeSession(env, u.sub), user: { email: u.email, name: u.name } });
}
async function accountRoutes(req, url, env) {
  if (!env.DB) return json({ ok: false, error: 'indisponible' }, 501);
  const sub = await readSession(req, env);
  if (!sub) return json({ ok: false, error: 'non connecté' }, 401);
  const path = url.pathname.slice('/pub/account'.length);
  if (path === '' && req.method === 'GET') {
    const u = await env.DB.prepare('SELECT email, name, created, last_login, v, data_updated FROM users WHERE id = ?').bind(sub).first();
    return u ? json({ ok: true, user: { email: u.email, name: u.name, created: u.created }, v: u.v, updated: u.data_updated || 0 }) : json({ ok: false, error: 'compte introuvable' }, 404);
  }
  if (path === '' && req.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(sub).run();
    return json({ ok: true });
  }
  if (path === '/export' && req.method === 'GET') {
    const u = await env.DB.prepare('SELECT email, name, created, last_login, v, data, data_updated FROM users WHERE id = ?').bind(sub).first();
    if (!u) return json({ ok: false, error: 'compte introuvable' }, 404);
    let data = null;
    try { data = u.data ? JSON.parse(u.data) : null; } catch (e) { data = null; }
    return json({ ok: true, export: { email: u.email, name: u.name, created: new Date(u.created).toISOString(), last_login: new Date(u.last_login).toISOString(), plan_data: data } });
  }
  if (path === '/data') {
    const u = await env.DB.prepare('SELECT data, v, data_updated FROM users WHERE id = ?').bind(sub).first();
    if (!u) return json({ ok: false, error: 'compte introuvable' }, 404);
    if (req.method === 'GET') {
      if (url.searchParams.get('meta') === '1') return json({ ok: true, v: u.v, updated: u.data_updated || 0 });
      let data = null;
      try { data = u.data ? JSON.parse(u.data) : null; } catch (e) { data = null; }
      return json({ ok: true, v: u.v, updated: u.data_updated || 0, data });
    }
    if (req.method === 'PUT') {
      let b = null;
      try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'corps invalide' }, 400); }
      const text = JSON.stringify((b && b.data) || null);
      if (!b || !b.data || typeof b.data !== 'object' || text.length > SYNC_MAX) return json({ ok: false, error: 'données invalides ou trop grosses' }, 413);
      if (Number(b.base) !== u.v) return json({ ok: false, error: 'conflit', v: u.v, updated: u.data_updated || 0 }, 409);
      const now = Date.now();
      await env.DB.prepare('UPDATE users SET data = ?, v = v + 1, data_updated = ? WHERE id = ?').bind(text, now, sub).run();
      return json({ ok: true, v: u.v + 1, updated: now });
    }
  }
  return json({ error: 'not_found' }, 404);
}

/* ---------- Sauvegarde cloud chiffrée, sans compte ----------
   L'utilisateur possède un « code de récupération » (généré dans l'app, jamais envoyé). L'app en déduit :
     id  = SHA-256("id:"+code)  : adresse de la sauvegarde ;  wk = SHA-256("w:"+code) : preuve d'écriture ;  clé AES-GCM = SHA-256("enc:"+code).
   Le serveur ne reçoit que id, wk et un blob CHIFFRÉ : il ne peut pas lire les données (ni savoir qui est l'utilisateur).
   Il garde sha256(wk) comme vérificateur : lecture = connaître l'id, écriture / suppression = connaître wk.
   Versionnage optimiste : PUT {blob, base} refusé (409) si base != version actuelle, pour ne jamais écraser une autre version sans le savoir.
   Routes : GET /pub/sync/<id>[?meta=1]   PUT /pub/sync/<id> (X-Sync-Write)   DELETE /pub/sync/<id> (X-Sync-Write) */
const SYNC_MAX = 300000;
async function sha256hex(t) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function pubSync(req, url, env) {
  if (!env.DB) return json({ ok: false, error: 'indisponible' }, 501);
  const id = url.pathname.slice('/pub/sync/'.length);
  if (!/^[0-9a-f]{64}$/.test(id)) return json({ ok: false, error: 'id invalide' }, 400);
  const row = await env.DB.prepare('SELECT verifier, blob, v, updated FROM sync WHERE id = ?').bind(id).first();
  if (req.method === 'GET') {
    if (!row) return json({ ok: false, error: 'introuvable' }, 404);
    return json(url.searchParams.get('meta') === '1' ? { ok: true, v: row.v, updated: row.updated } : { ok: true, v: row.v, updated: row.updated, blob: row.blob });
  }
  const wk = (req.headers.get('X-Sync-Write') || '').trim();
  if (!/^[0-9a-f]{64}$/.test(wk)) return json({ ok: false, error: 'preuve d’écriture manquante' }, 401);
  const ver = await sha256hex(wk);
  if (row && row.verifier !== ver) return json({ ok: false, error: 'refusé' }, 403);
  if (req.method === 'DELETE') {
    if (row) await env.DB.prepare('DELETE FROM sync WHERE id = ?').bind(id).run();
    return json({ ok: true });
  }
  if (req.method !== 'PUT') return json({ error: 'not_found' }, 404);
  let b = null;
  try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'corps invalide' }, 400); }
  const blob = String((b && b.blob) || '');
  if (!/^[A-Za-z0-9+/=]{16,}$/.test(blob) || blob.length > SYNC_MAX) return json({ ok: false, error: 'blob invalide ou trop gros' }, 413);
  const now = Date.now();
  if (!row) {
    await env.DB.prepare('INSERT INTO sync (id, verifier, blob, v, updated) VALUES (?, ?, ?, 1, ?)').bind(id, ver, blob, now).run();
    return json({ ok: true, v: 1, updated: now });
  }
  if (Number(b.base) !== row.v) return json({ ok: false, error: 'conflit', v: row.v, updated: row.updated }, 409);
  await env.DB.prepare('UPDATE sync SET blob = ?, v = v + 1, updated = ? WHERE id = ?').bind(blob, now, id).run();
  return json({ ok: true, v: row.v + 1, updated: now });
}

/* ---------- Statistiques d'usage anonymes ----------
   Compteurs agrégés par jour dans D1 (table ev : jour, nom d'événement, propriété, total). Aucun identifiant, aucune adresse IP, aucun cookie :
   on ne peut pas retrouver une personne. Événements acceptés : liste blanche ci-dessous ; propriétés tronquées. Lecture : GET /api/admin/stats (clé propriétaire). */
const EVENTS = new Set(['gate_view', 'login', 'account_deleted', 'cloud_enabled', 'cloud_restore', 'open', 'install', 'setup_view', 'plan_created', 'plan_changed', 'race_pick', 'search_miss', 'garmin_connected']);
async function pubEvent(req, env) {
  if (!env.DB) return json({ ok: false }, 200);
  let b = null;
  try { b = await req.json(); } catch (e) { return json({ ok: false }, 400); }
  const name = String((b && b.e) || '');
  if (!EVENTS.has(name)) return json({ ok: false }, 400);
  const prop = String((b && b.p) || '').toLowerCase().replace(/[^a-z0-9àâäçéèêëîïôöùûüÿœ'’ .:|_+/-]/g, '').trim().slice(0, 60);
  await env.DB.prepare('INSERT INTO ev (day, name, prop, n) VALUES (?, ?, ?, 1) ON CONFLICT(day, name, prop) DO UPDATE SET n = n + 1').bind(ymd(new Date()), name, prop).run();
  return json({ ok: true });
}
async function adminStats(url, env) {
  if (!env.DB) return json({ error: 'base de statistiques non configurée' }, 501);
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get('days')) || 30));
  const since = ymd(new Date(Date.now() - days * 86400000));
  const rows = (await env.DB.prepare('SELECT day, name, prop, n FROM ev WHERE day >= ? ORDER BY day').bind(since).all()).results || [];
  const tot = {}, daily = {}, top = {};
  for (const r of rows) {
    tot[r.name] = (tot[r.name] || 0) + r.n;
    (daily[r.day] = daily[r.day] || {})[r.name] = ((daily[r.day] || {})[r.name] || 0) + r.n;
    if (r.prop) { (top[r.name] = top[r.name] || {})[r.prop] = (top[r.name][r.prop] || 0) + r.n; }
  }
  const ranked = {};
  for (const k of Object.keys(top)) ranked[k] = Object.entries(top[k]).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return json({ ok: true, days, since, totals: tot, daily, top: ranked });
}

/* ---------- utilitaires ---------- */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
// Les routes appellent cors(env, …) par habitude : l'en-tête est réellement posé par addCors (selon l'origine de la requête).
function cors(env, res) {
  return res;
}
// ALLOWED_ORIGIN : une ou plusieurs origines séparées par des virgules (« null » = page ouverte en file://, « * » = toutes).
function addCors(req, env, res) {
  const allowed = String(env.ALLOWED_ORIGIN || '*').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get('Origin');
  const value = allowed.includes('*') ? '*' : allowed.includes(origin) ? origin : allowed[0];
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', value);
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Icu-Key, X-Sync-Write, X-Session');
  h.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  h.set('Vary', 'Origin');
  return new Response(res.body, { status: res.status, headers: h });
}
function safeEq(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (!b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/* ---------- Deux façons de s'authentifier ----------
   1) Mode propriétaire : « Authorization: Bearer APP_KEY » → on utilise la clé intervals.icu enregistrée dans les secrets du Worker
      et le cache KV (fonctionnement historique, inchangé).
   2) Mode public : « X-Icu-Key: <clé API intervals.icu de l'utilisateur> » → relais SANS ÉTAT : la clé n'est jamais enregistrée,
      aucune activité n'est stockée sur le serveur (ni KV ni base) ; tout est relu chez intervals.icu à chaque appel.
   Dans les deux cas on renvoie un « env » dérivé : le reste du code ne change pas. */
const NOKV = { get: async () => null, put: async () => {}, delete: async () => {} };
function credentials(req, env) {
  if (authorized(req, env)) return env;
  const k = (req.headers.get('X-Icu-Key') || '').trim();
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(k)) return null;
  const since = new Date(Date.now() - 400 * 86400000);
  return { ...env, INTERVALS_API_KEY: k, INTERVALS_ATHLETE_ID: '0', SINCE: ymd(since), KV: NOKV, STATELESS: true, APP_KEY: '' };
}
async function keyHash(k) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k));
  return [...new Uint8Array(d)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
function authorized(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
  return !!m && safeEq(m[1], env.APP_KEY);
}
function ymd(d) {
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

/* ---------- intervals.icu ---------- */
// requête quelconque (POST/PUT/DELETE) vers intervals.icu
async function intervalsReq(env, method, path, body) {
  if (!env.INTERVALS_API_KEY) throw new Error('INTERVALS_API_KEY manquante');
  const r = await fetch(BASE + path, {
    method,
    headers: { Authorization: 'Basic ' + btoa('API_KEY:' + env.INTERVALS_API_KEY), Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': 'ironman-2027-app/1.0' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text.slice(0, 300) }; }
  return { status: r.status, data };
}
// Calendrier d'intervals.icu : GET (liste), POST (créer une ou plusieurs séances), DELETE /api/events/<id>
async function apiEvents(req, url, env) {
  const id = encodeURIComponent(env.INTERVALS_ATHLETE_ID || '0');
  const rest = url.pathname.slice('/api/events'.length).replace(/^\//, '').replace(/[^\w-]/g, '');
  let r;
  if (req.method === 'GET') {
    const o = (url.searchParams.get('oldest') || '').slice(0, 10), n = (url.searchParams.get('newest') || '').slice(0, 10);
    r = await intervalsReq(env, 'GET', `/athlete/${id}/events?oldest=${o}&newest=${n}`);
  } else if (req.method === 'POST') {
    const body = await req.json();
    r = await intervalsReq(env, 'POST', `/athlete/${id}/events${Array.isArray(body) ? '/bulk?upsert=uid' : ''}`, body);
  } else if (req.method === 'PUT' && rest) {
    r = await intervalsReq(env, 'PUT', `/athlete/${id}/events/${rest}`, await req.json());
  } else if (req.method === 'DELETE' && rest) {
    r = await intervalsReq(env, 'DELETE', `/athlete/${id}/events/${rest}`);
  } else return json({ error: 'not_found' }, 404);
  return json(r.data === null ? { ok: r.status < 300 } : r.data, r.status);
}
async function fetchIntervals(env, path) {
  const id = encodeURIComponent(env.INTERVALS_ATHLETE_ID || '0');
  return intervalsGet(env, `/athlete/${id}${path}`);
}
async function intervalsGet(env, path) {
  if (!env.INTERVALS_API_KEY) throw new Error('INTERVALS_API_KEY manquante');
  const r = await fetch(BASE + path, {
    headers: {
      Authorization: 'Basic ' + btoa('API_KEY:' + env.INTERVALS_API_KEY),
      Accept: 'application/json',
      'User-Agent': 'ironman-2027-app/1.0',
    },
  });
  if (r.status === 401 || r.status === 403) throw new Error('intervals.icu refuse la clé (' + r.status + ')');
  if (r.status === 429) throw new Error('intervals.icu : trop de requêtes, réessaie plus tard');
  if (!r.ok) throw new Error('intervals.icu : erreur ' + r.status);
  return r.json();
}
async function loadActivities(env) {
  const since = env.SINCE || '2026-12-01';
  const newest = ymd(new Date(Date.now() + 2 * 86400000));
  return fetchIntervals(env, `/activities?oldest=${since}&newest=${newest}`);
}

// intervals.icu n'expose pas les activités importées de Strava (« _note » / source STRAVA) : on les écarte.
function usable(a) {
  if (!a || a._note) return false;
  if (String(a.source || '').toUpperCase() === 'STRAVA') return false;
  return !!(a.moving_time || a.elapsed_time) && !!a.start_date_local;
}
const r1 = (x) => (x ? Math.round(x * 10) / 10 : 0);
function compact(a) {
  const o = {
    id: String(a.id),
    n: String(a.name || '').slice(0, 60),
    t: a.type || '',                                   // Ride, Run, Swim, WeightTraining, VirtualRide…
    s: a.start_date_local || '',                       // heure locale de l'athlète
    d: Math.round(a.moving_time || a.elapsed_time || 0), // secondes
    e: Math.round(a.elapsed_time || a.moving_time || 0),
    m: Math.round(a.distance || 0),                    // mètres
    h: a.average_heartrate ? Math.round(a.average_heartrate) : 0,
    w: Math.round(a.icu_average_watts || a.average_watts || 0),
    z: Math.round(a.total_elevation_gain || 0),
    x: Math.round(a.max_heartrate || 0),               // FC max
    c: r1(a.average_cadence),                          // cadence moyenne (course : pieds/min ÷ 2 ; nage : mouvements/min)
    k: Math.round(a.calories || 0),
    l: Math.round(a.icu_training_load || 0),           // charge d'entraînement
    cl: r1(a.icu_ctl),                                 // fitness (CTL) après l'activité
    al: r1(a.icu_atl),                                 // fatigue (ATL) après l'activité
  };
  if (Array.isArray(a.icu_hr_zone_times) && a.icu_hr_zone_times.some(Boolean)) o.zt = a.icu_hr_zone_times.map((v) => Math.round(v || 0)); // secondes par zone de FC
  if (a.device_name) o.dv = String(a.device_name).slice(0, 30);
  return o;
}

async function compute(env) {
  const raw = await loadActivities(env);
  if (!Array.isArray(raw)) throw new Error('réponse inattendue d’intervals.icu');
  const good = raw.filter(usable);
  const acts = good.map(compact).sort((x, y) => y.s.localeCompare(x.s));
  const withZ = good.filter((a) => Array.isArray(a.icu_hr_zones)).sort((x, y) => String(y.start_date_local).localeCompare(String(x.start_date_local)))[0];
  const meta = withZ ? { hrz: withZ.icu_hr_zones, lthr: withZ.lthr || 0, maxhr: withZ.athlete_max_hr || 0 } : null;
  return { acts, meta, skipped: raw.length - acts.length };
}
async function sync(env) {
  try {
    const { acts, meta, skipped } = await compute(env);
    if (meta) await env.KV.put('meta', JSON.stringify(meta));
    await env.KV.put('acts', JSON.stringify(acts));
    await env.KV.put('synced', String(Date.now()));
    await env.KV.delete('error');
    return { ok: true, count: acts.length, skipped };
  } catch (e) {
    await env.KV.put('error', String((e && e.message) || e));
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/* ---------- API pour l'app ---------- */
async function state(env) {
  const [acts, synced, error, meta] = await Promise.all([env.KV.get('acts', 'json'), env.KV.get('synced'), env.KV.get('error'), env.KV.get('meta', 'json')]);
  return { acts: acts || [], synced: Number(synced) || 0, error: error || '', meta: meta || null };
}
async function apiActivities(url, env) {
  if (env.STATELESS) {
    try {
      const { acts, meta } = await compute(env);
      const since = (url.searchParams.get('since') || '').slice(0, 10);
      return json({ connected: true, updated: Date.now(), error: '', meta, activities: since ? acts.filter((a) => (a.s || '').slice(0, 10) >= since) : acts });
    } catch (e) {
      const m = String((e && e.message) || e);
      return json({ connected: false, updated: 0, error: m, meta: null, activities: [] }, /refuse la clé/.test(m) ? 401 : 200);
    }
  }
  let st = await state(env);
  if (Date.now() - st.synced > STALE_MS) {
    await sync(env);
    st = await state(env);
  }
  const since = (url.searchParams.get('since') || '').slice(0, 10);
  const acts = since ? st.acts.filter((a) => (a.s || '').slice(0, 10) >= since) : st.acts;
  // « connected » : au moins une synchro réussie ; « error » : dernier problème rencontré (le cache reste servi)
  return json({ connected: st.synced > 0, updated: st.synced, error: st.error, meta: st.meta, activities: acts });
}
async function apiStatus(env) {
  if (env.STATELESS) {
    try {
      const a = await intervalsGet(env, '/athlete/0');
      return json({ configured: true, connected: true, updated: Date.now(), error: '', cached: 0, athlete: String((a && (a.name || a.firstname)) || '').slice(0, 40) });
    } catch (e) {
      return json({ configured: true, connected: false, error: String((e && e.message) || e) }, /refuse la clé/.test(String(e && e.message)) ? 401 : 200);
    }
  }
  const st = await state(env);
  return json({ configured: !!env.INTERVALS_API_KEY, connected: st.synced > 0, updated: st.synced, error: st.error, cached: st.acts.length });
}
async function apiSync(env) {
  if (env.STATELESS) {
    try {
      const { acts } = await compute(env);
      return json({ ok: true, count: acts.length });
    } catch (e) {
      const m = String((e && e.message) || e);
      return json({ ok: false, error: m }, /refuse la clé/.test(m) ? 401 : 502);
    }
  }
  const r = await sync(env);
  return json(r, r.ok ? 200 : 502);
}
async function apiDebug(env) {
  const raw = await loadActivities(env);
  const list = Array.isArray(raw) ? raw : [];
  const first = list.find(usable) || list[0] || null;
  const sources = {};
  list.forEach((a) => { const s = String(a.source || 'inconnue'); sources[s] = (sources[s] || 0) + 1; });
  return json({
    total: list.length,
    utilisables: list.filter(usable).length,
    sources,
    champs_premiere_activite: first ? Object.keys(first).sort() : [],
    exemple_compact: first && usable(first) ? compact(first) : null,
  });
}

/* ---------- détail d'une activité : séries/tours, courbes réduites, découpage par km ---------- */
const NPTS = 120;
function resample(time, data, step, n) {
  const sum = new Array(n).fill(0), cnt = new Array(n).fill(0);
  for (let i = 0; i < time.length; i++) {
    const v = data[i];
    if (v == null || !Number.isFinite(v)) continue;
    const b = Math.min(n - 1, Math.floor(time[i] / step));
    sum[b] += v;
    cnt[b]++;
  }
  return sum.map((s, i) => (cnt[i] ? Math.round((s / cnt[i]) * 100) / 100 : null));
}
// temps cumulé EN MOUVEMENT (les arrêts, feux rouges, pauses ne comptent pas)
function movingTime(time, dist) {
  const M = [0];
  for (let i = 1; i < time.length; i++) {
    const dt = time[i] - time[i - 1];
    const dd = dist[i] != null && dist[i - 1] != null ? dist[i] - dist[i - 1] : 0;
    M.push(M[i - 1] + (dt > 0 && dd / dt >= 0.5 ? dt : 0));
  }
  return M;
}
function splits(time, dist, hr, unit) {
  const out = [];
  let k = 1, prevT = 0, prevI = 0;
  for (let i = 1; i < time.length; i++) {
    while (dist[i] != null && dist[i - 1] != null && dist[i] >= k * unit && dist[i - 1] < k * unit) {
      const f = (k * unit - dist[i - 1]) / ((dist[i] - dist[i - 1]) || 1);
      const t = time[i - 1] + f * (time[i] - time[i - 1]);
      out.push(mkSplit(hr, prevI, i, t - prevT, unit));
      prevT = t; prevI = i; k++;
    }
  }
  const last = dist[dist.length - 1] || 0, rest = last - (k - 1) * unit;
  if (rest > unit * 0.2) out.push(mkSplit(hr, prevI, time.length - 1, time[time.length - 1] - prevT, Math.round(rest)));
  return out;
}
function mkSplit(hr, a, b, sec, dist) {
  let s = 0, c = 0;
  for (let i = a; i <= b; i++) if (hr && hr[i]) { s += hr[i]; c++; }
  return { t: Math.round(sec), d: Math.round(dist), h: c ? Math.round(s / c) : 0 };
}
function buildDetail(d, streams) {
  const iv = (d.icu_intervals || [])
    .map((x) => ({
      k: x.type === 'RECOVERY' ? 'R' : 'W',
      t: Math.round(x.moving_time || 0),
      d: Math.round(x.distance || 0),
      h: Math.round(x.average_heartrate || 0),
      v: Math.round((x.average_speed || 0) * 100) / 100,
      c: r1(x.average_cadence),
      u: Math.round(x.total_elevation_gain || 0),
    }))
    .filter((x) => x.t >= 3);
  const out = { id: d.id, type: d.type, iv, s: null, sp: null };
  const by = {};
  (streams || []).forEach((s) => { if (s && s.type && Array.isArray(s.data)) by[s.type] = s.data; });
  const time = by.time;
  if (time && time.length > 10) {
    const T = time[time.length - 1], n = Math.min(NPTS, Math.max(2, Math.ceil(T / 5))), step = Math.max(1, Math.ceil(T / n)), nb = Math.min(n, Math.floor(T / step) + 1);
    out.s = { step, h: by.heartrate ? resample(time, by.heartrate, step, nb) : null, v: by.velocity_smooth ? resample(time, by.velocity_smooth, step, nb) : null, a: by.altitude ? resample(time, by.altitude, step, nb) : null };
    const t = String(d.type || '');
    const unit = /Run/.test(t) ? 1000 : /Ride/.test(t) ? 5000 : 0;
    if (unit && by.distance) out.sp = { u: unit, l: splits(movingTime(time, by.distance), by.distance, by.heartrate, unit) };
  }
  return out;
}
async function apiActivity(url, env) {
  const id = (url.searchParams.get('id') || '').replace(/[^\w-]/g, '');
  if (!id) return json({ error: 'id manquant' }, 400);
  let ck = null;
  if (env.STATELESS && typeof caches !== 'undefined') {
    ck = new Request('https://cache.local/det/' + (await keyHash(env.INTERVALS_API_KEY)) + '/' + id);
    const hit = await caches.default.match(ck);
    if (hit) return hit;
  }
  const cached = await env.KV.get('det2:' + id, 'json');
  if (cached) return json(cached);
  const [d, st] = await Promise.all([
    intervalsGet(env, '/activity/' + id + '?intervals=true'),
    intervalsGet(env, '/activity/' + id + '/streams.json?types=time,heartrate,velocity_smooth,altitude,distance').catch(() => null),
  ]);
  const out = buildDetail(d, st);
  await env.KV.put('det2:' + id, JSON.stringify(out), { expirationTtl: 60 * 86400 });
  if (ck) {
    const res = new Response(JSON.stringify(out), { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, max-age=86400' } });
    await caches.default.put(ck, res.clone());
    return res;
  }
  return json(out);
}

// Export d'une séance planifiée tel que le génère intervals.icu (lecture seule) : base64 dans un JSON
async function apiEventFile(url, env) {
  const id = (url.searchParams.get('id') || '').replace(/[^\w-]/g, '');
  const ext = (url.searchParams.get('ext') || 'fit').replace(/[^a-z]/g, '');
  if (!id) return json({ error: 'id manquant' }, 400);
  if (!env.INTERVALS_API_KEY) return json({ error: 'INTERVALS_API_KEY manquante' }, 500);
  const a = encodeURIComponent(env.INTERVALS_ATHLETE_ID || '0');
  const r = await fetch(`${BASE}/athlete/${a}/events/${id}/download.${ext}`, { headers: { Authorization: 'Basic ' + btoa('API_KEY:' + env.INTERVALS_API_KEY), 'User-Agent': 'ironman-2027-app/1.0' } });
  const buf = new Uint8Array(await r.arrayBuffer());
  let bin = '';
  for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
  return json({ status: r.status, type: r.headers.get('Content-Type'), size: buf.length, base64: r.ok ? btoa(bin) : null, text: r.ok ? null : new TextDecoder().decode(buf).slice(0, 300) }, r.ok ? 200 : r.status);
}

// Réglages par sport : seuil d'allure, zones… (intervals.icu n'exporte les cibles d'allure vers Garmin que si le seuil d'allure est renseigné)
async function apiSportSettingsPut(req, url, env) {
  const sid = url.pathname.slice('/api/sport-settings/'.length).replace(/[^\d]/g, '');
  if (!sid) return json({ error: 'id manquant' }, 400);
  const body = await req.json();
  const a = encodeURIComponent(env.INTERVALS_ATHLETE_ID || '0');
  const r = await intervalsReq(env, 'PUT', `/athlete/${a}/sport-settings/${sid}`, body);
  return json(r.data === null ? { ok: r.status < 300 } : r.data, r.status);
}
