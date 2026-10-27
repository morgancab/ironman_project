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
        if (!authorized(req, env)) return cors(env, json({ error: 'unauthorized' }, 401));
        if (url.pathname === '/api/activities' && req.method === 'GET') return cors(env, await apiActivities(url, env));
        if (url.pathname === '/api/status' && req.method === 'GET') return cors(env, await apiStatus(env));
        if (url.pathname === '/api/sync' && req.method === 'POST') return cors(env, await apiSync(env));
        if (url.pathname === '/api/activity' && req.method === 'GET') return cors(env, await apiActivity(url, env));
        if (url.pathname === '/api/debug' && req.method === 'GET') return cors(env, await apiDebug(env));
        return cors(env, json({ error: 'not_found' }, 404));
      }
      return new Response('Ironman Garmin worker : OK', { status: 200 });
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500);
    }
  }
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

async function sync(env) {
  try {
    const raw = await loadActivities(env);
    if (!Array.isArray(raw)) throw new Error('réponse inattendue d’intervals.icu');
    const good = raw.filter(usable);
    const acts = good.map(compact).sort((x, y) => y.s.localeCompare(x.s));
    const withZ = good.filter((a) => Array.isArray(a.icu_hr_zones)).sort((x, y) => String(y.start_date_local).localeCompare(String(x.start_date_local)))[0];
    if (withZ) await env.KV.put('meta', JSON.stringify({ hrz: withZ.icu_hr_zones, lthr: withZ.lthr || 0, maxhr: withZ.athlete_max_hr || 0 }));
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
  const [acts, synced, error, meta] = await Promise.all([env.KV.get('acts', 'json'), env.KV.get('synced'), env.KV.get('error'), env.KV.get('meta', 'json')]);
  return { acts: acts || [], synced: Number(synced) || 0, error: error || '', meta: meta || null };
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
  return json({ connected: st.synced > 0, updated: st.synced, error: st.error, meta: st.meta, activities: acts });
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
  const cached = await env.KV.get('det2:' + id, 'json');
  if (cached) return json(cached);
  const [d, st] = await Promise.all([
    intervalsGet(env, '/activity/' + id + '?intervals=true'),
    intervalsGet(env, '/activity/' + id + '/streams.json?types=time,heartrate,velocity_smooth,altitude,distance').catch(() => null),
  ]);
  const out = buildDetail(d, st);
  await env.KV.put('det2:' + id, JSON.stringify(out), { expirationTtl: 60 * 86400 });
  return json(out);
}
