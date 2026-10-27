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
//   GET  /api/debug                         diagnostic : champs bruts de la 1re activité (sans données personnelles longues)
//
// Secrets  : INTERVALS_API_KEY (intervals.icu → Réglages → Developer Settings), APP_KEY (clé choisie, saisie dans l'app)
// Variables: ALLOWED_ORIGIN, SINCE, INTERVALS_ATHLETE_ID (optionnel, « 0 » = le propriétaire de la clé)
// Stockage : namespace KV lié sous le nom « KV » (clés : acts, synced, error)

const BASE = 'https://intervals.icu/api/v1';
const STALE_MS = 4 * 60 * 1000;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return cors(env, new Response(null, { status: 204 }));
    try {
      if (url.pathname.startsWith('/api/')) {
        if (!authorized(req, env)) return cors(env, json({ error: 'unauthorized' }, 401));
        if (url.pathname === '/api/activities' && req.method === 'GET') return cors(env, await apiActivities(url, env));
        if (url.pathname === '/api/status' && req.method === 'GET') return cors(env, await apiStatus(env));
        if (url.pathname === '/api/sync' && req.method === 'POST') return cors(env, await apiSync(env));
        if (url.pathname === '/api/debug' && req.method === 'GET') return cors(env, await apiDebug(env));
        return cors(env, json({ error: 'not_found' }, 404));
      }
      return new Response('Ironman Garmin worker : OK', { status: 200 });
    } catch (e) {
      return cors(env, json({ error: String((e && e.message) || e) }, 500));
    }
  },
};

/* ---------- utilitaires ---------- */
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
}
function cors(env, res) {
  const h = new Headers(res.headers);
  h.set('Access-Control-Allow-Origin', env.ALLOWED_ORIGIN || '*');
  h.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  h.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
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
function authorized(req, env) {
  const m = /^Bearer (.+)$/.exec(req.headers.get('Authorization') || '');
  return !!m && safeEq(m[1], env.APP_KEY);
}
function ymd(d) {
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

/* ---------- intervals.icu ---------- */
async function fetchIntervals(env, path) {
  if (!env.INTERVALS_API_KEY) throw new Error('INTERVALS_API_KEY manquante');
  const id = encodeURIComponent(env.INTERVALS_ATHLETE_ID || '0');
  const r = await fetch(`${BASE}/athlete/${id}${path}`, {
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
function compact(a) {
  return {
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
  };
}

async function sync(env) {
  try {
    const raw = await loadActivities(env);
    if (!Array.isArray(raw)) throw new Error('réponse inattendue d’intervals.icu');
    const acts = raw.filter(usable).map(compact).sort((x, y) => y.s.localeCompare(x.s));
    await env.KV.put('acts', JSON.stringify(acts));
    await env.KV.put('synced', String(Date.now()));
    await env.KV.delete('error');
    return { ok: true, count: acts.length, skipped: raw.length - acts.length };
  } catch (e) {
    await env.KV.put('error', String((e && e.message) || e));
    return { ok: false, error: String((e && e.message) || e) };
  }
}

/* ---------- API pour l'app ---------- */
async function state(env) {
  const [acts, synced, error] = await Promise.all([env.KV.get('acts', 'json'), env.KV.get('synced'), env.KV.get('error')]);
  return { acts: acts || [], synced: Number(synced) || 0, error: error || '' };
}
async function apiActivities(url, env) {
  let st = await state(env);
  if (Date.now() - st.synced > STALE_MS) {
    await sync(env);
    st = await state(env);
  }
  const since = (url.searchParams.get('since') || '').slice(0, 10);
  const acts = since ? st.acts.filter((a) => (a.s || '').slice(0, 10) >= since) : st.acts;
  // « connected » : au moins une synchro réussie ; « error » : dernier problème rencontré (le cache reste servi)
  return json({ connected: st.synced > 0, updated: st.synced, error: st.error, activities: acts });
}
async function apiStatus(env) {
  const st = await state(env);
  return json({ configured: !!env.INTERVALS_API_KEY, connected: st.synced > 0, updated: st.synced, error: st.error, cached: st.acts.length });
}
async function apiSync(env) {
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
