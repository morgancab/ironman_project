#!/usr/bin/env node
/* Mise à jour du catalogue de triathlons (races.js), sans dépendance ni IA. Voir CATALOGUE.md.
   Usage : node scripts/update-races.mjs [--dry] [--report fichier.md]
   Lit des calendriers publics, compare au catalogue, ajoute les nouvelles courses et les dates manquantes.
   Ne supprime jamais une course, et ne remplace une date que si la source est plus fiable : sinon le désaccord est signalé.
   Code de sortie : 0 = tout va bien, 1 = au moins une source n'a rien renvoyé (sa mise en page a sans doute changé). */
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const UA = 'Mozilla/5.0 (compatible; PlanTriathlonCatalog/1.0; +https://github.com/morgancab/ironman_project)';
const FILE = new URL('../races.js', import.meta.url);
const HEAD = '// Catalogue de triathlons : [nom, ville, pays, format, mois habituel (1-12, 0 = inconnu), options]. Mis à jour par scripts/update-races.mjs, voir CATALOGUE.md.\nwindow.RACE_CAT=[\n';
// Au-delà, le lancement est jugé anormal (site modifié, mauvaise lecture) : il passe par une proposition au lieu d'être publié
const MAX_AUTO_ADD = 50, MAX_AUTO_CHANGE = 10;
const TODAY = new Date().toISOString().slice(0, 10);
const MAX_DATE = (Number(TODAY.slice(0, 4)) + 2) + TODAY.slice(4);
// Fiabilité d'une date : 3 = organisateur, 2 = annoncée « confirmée » par un calendrier, 1 = calendrier sans statut
const NOTE = {
  3: 'Date du site officiel de l’organisateur : à reconfirmer à l’inscription.',
  2: 'Date annoncée comme confirmée par un calendrier : à reconfirmer à l’inscription.',
  1: 'Date relevée dans un calendrier : à confirmer sur le site officiel.',
  0: 'Mois relevé dans un calendrier : date à confirmer sur le site officiel.',
};
const COUNTRY = { france: 'FR', germany: 'DE', austria: 'AT', switzerland: 'CH', spain: 'ES', italy: 'IT', 'united kingdom': 'GB', uk: 'GB', england: 'GB', wales: 'GB', scotland: 'GB', netherlands: 'NL', denmark: 'DK', sweden: 'SE', estonia: 'EE', 'united states': 'US', usa: 'US', canada: 'CA', australia: 'AU', 'new zealand': 'NZ', 'south africa': 'ZA', brazil: 'BR', mexico: 'MX', belgium: 'BE', portugal: 'PT', luxembourg: 'LU', japan: 'JP', china: 'CN', israel: 'IL', 'united arab emirates': 'AE', 'chinese taipei': 'TW', taiwan: 'TW', 'south korea': 'KR', korea: 'KR', poland: 'PL', slovakia: 'SK', uzbekistan: 'UZ', oman: 'OM', 'czech republic': 'CZ', czechia: 'CZ', serbia: 'RS', croatia: 'HR', greece: 'GR', norway: 'NO', romania: 'RO' };
const MONTHS = { january: 1, enero: 1, february: 2, febrero: 2, march: 3, marzo: 3, april: 4, abril: 4, may: 5, mayo: 5, june: 6, junio: 6, july: 7, julio: 7, august: 8, agosto: 8, september: 9, septiembre: 9, october: 10, octubre: 10, november: 11, noviembre: 11, december: 12, diciembre: 12 };
const MON3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.]+/g, ' ').trim();
const pad = (n) => String(n).padStart(2, '0');
const validDate = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + 'T12:00:00Z')) && new Date(d + 'T12:00:00Z').toISOString().slice(0, 10) === d;
const cleanName = (s) => String(s || '').replace(/\*+/g, '').replace(/,\s*Romania$/, '').replace(/\s+/g, ' ').trim();
const STOP = new Set('triathlon triathlons tri de du des d la le les l et the of en sur international race series s m l xl xxl distance format olympique olympic world north south american european middle east championship championships'.split(' '));
const BRAND_WORDS = new Set('ironman 70.3 70 3 challenge t100'.split(' '));
const brand = (n) => { const x = norm(n); return /ironman/.test(x) && /70\.?3/.test(x) ? 'im703' : /ironman/.test(x) ? 'im' : /\bchallenge\b/.test(x) ? 'ch' : /\bt100\b/.test(x) ? 't100' : ''; };
const words = (s) => norm(s).replace(/\./g, ' ').split(' ').filter((w) => w && !STOP.has(w) && !BRAND_WORDS.has(w));
const cityOf = (c) => norm(String(c || '').replace(/\(.*?\)/g, ''));

async function get(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
// Format principal d'une course à partir de ses distances (la plus longue l'emporte)
function formatOf(metres) {
  const m = Math.max(0, ...metres);
  return m >= 200000 ? 'full' : m >= 85000 ? 'half' : m >= 40000 ? 'olympic' : m >= 15000 ? 'sprint' : null;
}

/* ---------- Sources ---------- */
async function challengeFamily() {
  const html = await get('https://challengefamily.com/races/');
  return html.split(/data-elementor-type="loop-item"/).slice(1).flatMap((c) => {
    const heads = [...c.matchAll(/elementor-heading-title[^>]*>\s*<a [^>]*>([^<]+)<\/a>/g)].map((x) => x[1].trim());
    const text = c.replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, '|').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
    const m = /(\d{1,2}) ([A-Z][a-z]{2}) (\d{4}) \d\d:\d\d[\s|]+([^|]+?),\s*([^|]+?)\s*\|/.exec(text);
    if (!m || !MON3[m[2].toLowerCase()] || heads.length < 2) return [];
    const kinds = norm(text);
    const format = /long distance/.test(kinds) ? 'full' : /middle distance|100 distance/.test(kinds) ? 'half' : /standard distance/.test(kinds) ? 'olympic' : /sprint distance/.test(kinds) ? 'sprint' : null;
    if (!format) return [];   // marathons et autres épreuves sans triathlon
    return [{ name: heads[0] + ' ' + heads[1], city: m[4], country: m[5], format, date: m[3] + '-' + pad(MON3[m[2].toLowerCase()]) + '-' + pad(m[1]), rank: 3 }];
  });
}
async function finishers(size) {
  // version française : la version anglaise traduit le nom des courses
  const html = await get('https://www.finishers.com/disciplines/triathlons/triathlons-' + size + '/triathlons-' + size + '-en-france');
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  const ev = (((JSON.parse(m[1]).props || {}).pageProps || {}).calendarSection || {}).events || {};
  return Object.values(ev).flat().filter((e) => (e.disciplines || []).includes('triathlon')).flatMap((e) => {
    const found = formatOf((e.distances || []).map((x) => x.distance || 0));
    if (!found) return [];
    const city = e.city + (e.citySuffix ? ' (' + e.citySuffix + ')' : '');
    // statut « tba » : la date affichée n'est qu'une estimation, on ne garde que le mois
    return [e.status === 'confirmed'
      ? { name: e.name, city, cc: e.countryCode, format: found, date: e.date, rank: 2 }
      : { name: e.name, city, cc: e.countryCode, format: found, month: Number(String(e.date).slice(5, 7)), monthDate: e.date, rank: 0 }];
  });
}
async function sportsPal(path, format) {
  const html = await get('https://thesportspal.com/' + path);
  const ld = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)].map((x) => JSON.parse(x[1]));
  return ld.filter((o) => o['@type'] === 'ItemList').flatMap((o) => o.itemListElement || []).map((x) => x.item).filter((e) => e && e['@type'] === 'Event' && e.startDate).map((e) => {
    const a = (e.location && e.location.address) || {};
    return { name: e.name, city: a.addressLocality || '', country: a.addressCountry || '', format, date: String(e.startDate).slice(0, 10), rank: 1 };
  });
}
async function triatlonNoticias() {
  const y0 = Number(TODAY.slice(0, 4)), out = [];
  let read = 0;
  for (const y of [y0, y0 + 1]) {
    let html;
    try { html = await get('https://en.triatlonnoticias.com/calendario/calendario-ironman-703-europa-' + y + '/'); } catch (e) { continue; }
    read++;
    for (const r of html.matchAll(/<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/g)) {
      const [when, name, country, status] = r.slice(1).map((x) => x.replace(/<[^>]+>/g, '').replace(/&#\d+;|\*/g, '').trim());
      if (!/70\.?3/.test(name) || !/^confirmed$/i.test(status)) continue;
      const a = /^(\p{L}+)\s+(\d{1,2})/u.exec(when) || [], b = /^(\d{1,2})\s+(\p{L}+)/u.exec(when) || [];
      const mon = MONTHS[norm(a[1] || b[2])], day = a[2] || b[1];
      if (mon && day) out.push({ name, city: '', country: country.replace(/,\s*$/, ''), format: 'half', date: y + '-' + pad(mon) + '-' + pad(day), rank: 2 });
    }
  }
  if (!read) throw new Error('page introuvable');
  return out;
}
const SOURCES = [
  ['Challenge Family', challengeFamily],
  ['Finishers (France, L)', () => finishers('l')],
  ['Finishers (France, M)', () => finishers('m')],
  ['Finishers (France, S)', () => finishers('s')],
  ['SportsPal (70.3 Europe)', () => sportsPal('middle-distance-triathlon-europe', 'half')],
  ['SportsPal (distance complète Europe)', () => sportsPal('long-distance-triathlon-europe', 'full')],
  ['Triatlón Noticias (70.3 Europe)', triatlonNoticias],
];

/* ---------- Rapprochement avec le catalogue ---------- */
function sameEvent(rec, e) {
  const bR = brand(rec.name), bE = brand(e[0]);
  const rn = words(rec.name), en = words(e[0]);
  const city = (c) => cityOf(c).split(' ').slice(0, 3).join(' ');
  const sameCity = !!city(rec.city) && city(rec.city) === city(e[1]);
  const close = rn.some((w) => en.some((x) => w === x || (w.length >= 6 && x.length >= 6 && w.slice(0, 6) === x.slice(0, 6))));   // tolère une faute de frappe (Carcassone)
  if (norm(rec.name) === norm(e[0])) return 200;
  // « Challenge Israman » et « Israman » : une marque d'un seul côté, même ville et un mot commun
  if ((bR === 'ch' && !bE) || (bE === 'ch' && !bR)) return sameCity && close ? 60 : 0;
  if (bR !== bE) return 0;
  if (bR) {
    const rw = new Set([...rn, ...words(cityOf(rec.city))]), ew = new Set([...en, ...words(cityOf(e[1]))]);
    return [...rw].filter((w) => ew.has(w)).length;
  }
  if (rn.length && rn.length === en.length && rn.every((w) => en.includes(w))) return 100;
  if (sameCity && close) return 50;
  const [sm, lg] = rn.length <= en.length ? [rn, en] : [en, rn];
  if (sm.length && sm.every((w) => lg.includes(w)) && sm.some((w) => w.length >= 5)) return 40;
  // même ville, même mois : c'est presque toujours la même course sous un autre nom
  const m = rec.month || (rec.date ? Number(rec.date.slice(5, 7)) : 0);
  if (sameCity && m && m === e[4]) return 30;
  return 0;
}
function matches(rec, cat) {
  let best = 0, out = [];
  cat.forEach((e, i) => { const s = sameEvent(rec, e); if (s > best) { best = s; out = [i]; } else if (s && s === best) out.push(i); });
  return out;
}
const catRank = (o) => (!o || !o.date ? -1 : o.ff ? 3 : o.rank != null ? o.rank : /organisateur|Challenge Family/.test(o.note || '') ? 3 : 1);

/* ---------- Programme ---------- */
const args = process.argv.slice(2), dry = args.includes('--dry'), repI = args.indexOf('--report');
const raw = readFileSync(FILE, 'utf8');
const cat = JSON.parse(raw.slice(raw.indexOf('window.RACE_CAT=') + 16).trim().replace(/;$/, ''));
const n0 = cat.length, rep = { sources: [], broken: [], added: [], dated: [], changed: [], conflicts: [], expired: [], skipped: [] };

const recs = [];
for (const [label, fn] of SOURCES) {
  try {
    const list = (await fn()).filter((r) => r.name && (r.date ? validDate(r.date) && r.date >= TODAY && r.date <= MAX_DATE : r.monthDate >= TODAY));
    rep.sources.push([label, list.length]);
    if (!list.length) rep.broken.push(label + ' : aucune course lue');
    list.forEach((r) => recs.push({ ...r, name: cleanName(r.name), src: label }));
  } catch (e) {
    rep.sources.push([label, 'échec']);
    rep.broken.push(label + ' : ' + (e.message || e));
  }
  await new Promise((r) => setTimeout(r, 1000));   // on reste discret
}

// Dates passées : on les retire, l'app revient au mois habituel
cat.forEach((e) => {
  const o = e[5];
  if (o && o.date && o.date < TODAY) { rep.expired.push(e[0] + ' (' + o.date + ')'); delete o.date; delete o.ff; delete o.rank; delete o.src; o.note = 'Date de la prochaine édition à confirmer.'; }
});

// Regroupe les relevés par course du catalogue, ou par nom pour les nouvelles
const byLine = new Map(), fresh = new Map();
recs.forEach((r) => {
  const idx = matches(r, cat);
  if (idx.length) idx.forEach((i) => { if (!byLine.has(i)) byLine.set(i, []); byLine.get(i).push(r); });
  else {
    const k = brand(r.name) + '|' + words(r.name).sort().join(' ') + '|' + cityOf(r.city);
    if (!fresh.has(k)) fresh.set(k, []);
    fresh.get(k).push(r);
  }
});
function choose(list) {
  const ex = list.filter((r) => r.date);
  if (!ex.length) return { none: true };
  const top = Math.max(...ex.map((r) => r.rank)), dates = [...new Set(ex.filter((r) => r.rank === top).map((r) => r.date))];
  return { top, dates, all: new Set(ex.map((r) => r.date)), src: ex.find((r) => r.rank === top).src };
}
byLine.forEach((list, i) => {
  const e = cat[i], o = e[5] = e[5] || {}, c = choose(list);
  if (c.none) return;
  if (o.date && c.all.has(o.date) && catRank(o) >= c.top) return;
  if (o.date && c.dates.includes(o.date)) return;
  if (c.dates.length > 1) { rep.conflicts.push(e[0] + ' : ' + c.dates.join(' ou ') + ' (' + c.src + ')' + (o.date ? ', catalogue ' + o.date : '')); return; }
  const d = c.dates[0], mon = Number(d.slice(5, 7));
  if (!o.date) {
    o.date = d; e[4] = mon; o.note = NOTE[c.top]; o.src = c.src; o.rank = c.top;
    rep.dated.push(e[0] + ' : ' + d + ' (' + c.src + ')');
  } else if (c.top > catRank(o)) {
    rep.changed.push(e[0] + ' : ' + o.date + ' → ' + d + ' (' + c.src + ')');
    o.date = d; e[4] = mon; o.note = NOTE[c.top]; o.src = c.src; o.rank = c.top; delete o.ff;
  } else rep.conflicts.push(e[0] + ' : catalogue ' + o.date + ', ' + c.src + ' ' + d);
});
fresh.forEach((list) => {
  const r = list.slice().sort((a, b) => b.rank - a.rank)[0], c = choose(list);
  if (!c.none && c.dates.length > 1) { rep.conflicts.push('(nouvelle) ' + r.name + ' : ' + c.dates.join(' ou ') + ' (' + c.src + ')'); return; }
  const cc = r.cc || COUNTRY[norm(r.country)];
  if (!cc) { rep.skipped.push(r.name + ' : pays inconnu « ' + r.country + ' »'); return; }
  const formats = ['full', 'half', 'olympic', 'sprint'], format = list.map((x) => x.format).filter(Boolean).sort((a, b) => formats.indexOf(a) - formats.indexOf(b))[0];
  const date = c.none ? '' : c.dates[0], month = date ? Number(date.slice(5, 7)) : r.month;
  cat.push([r.name, r.city || r.name, cc, format, month, date ? { date, note: NOTE[c.top], src: c.src, rank: c.top } : { note: NOTE[0], src: r.src }]);
  rep.added.push(r.name + ' · ' + (r.city || '?') + ' · ' + (date || 'mois ' + month) + ' (' + (c.src || r.src) + ')');
});

// Contrôle avant écriture : un catalogue invalide n'est jamais publié
const FORMATS = ['full', 'half', 'olympic', 'sprint'];
const bad = cat.filter((e) => !Array.isArray(e) || typeof e[0] !== 'string' || !e[0].trim() || typeof e[2] !== 'string' || !FORMATS.includes(e[3]) || !Number.isInteger(e[4]) || e[4] < 0 || e[4] > 12 || (e[5] && e[5].date && !validDate(e[5].date)));
if (bad.length || cat.length < n0) {
  console.error('Catalogue invalide, rien n’est écrit : ' + bad.length + ' ligne(s) incorrecte(s), ' + n0 + ' → ' + cat.length + ' lignes.\n' + bad.slice(0, 5).map((e) => JSON.stringify(e)).join('\n'));
  process.exit(2);
}
// Écriture : une course par ligne, pour que les changements restent lisibles
const out = HEAD + cat.map((e) => JSON.stringify(e)).join(',\n') + '\n];\n';
const changed = out !== raw;
if (changed && !dry) writeFileSync(FILE, out);

const sec = (t, l) => (l.length ? '\n### ' + t + ' (' + l.length + ')\n\n' + l.map((x) => '- ' + x).join('\n') + '\n' : '');
const md = '## Mise à jour du catalogue de triathlons\n\nCatalogue : ' + n0 + ' → ' + cat.length + ' lignes.\n\n| Source | Courses lues |\n|---|---|\n' + rep.sources.map((s) => '| ' + s[0] + ' | ' + s[1] + ' |').join('\n') + '\n' +
  sec('⚠️ Sources en échec', rep.broken) + sec('🟠 À arbitrer : sources en désaccord, rien n’a été changé', rep.conflicts) + sec('🔴 Dates remplacées par une source plus fiable', rep.changed) + sec('Dates ajoutées', rep.dated) + sec('Dates passées retirées', rep.expired) + sec('Nouvelles courses', rep.added) + sec('Ignorées', rep.skipped) +
  '\nRègles et limites : voir CATALOGUE.md. Avant de valider, vérifie surtout les doublons parmi les nouvelles courses.\n';
if (repI >= 0) writeFileSync(args[repI + 1], md); else console.log(md);
console.error((changed ? 'Changements' : 'Aucun changement') + (dry ? ' (essai, rien d’écrit)' : '') + ' : ' + rep.added.length + ' nouvelles, ' + rep.dated.length + ' dates ajoutées, ' + rep.changed.length + ' remplacées, ' + rep.conflicts.length + ' à arbitrer, ' + rep.broken.length + ' source(s) en échec.');
// Publication automatique, sauf lancement anormal
const safe = rep.added.length <= MAX_AUTO_ADD && rep.changed.length <= MAX_AUTO_CHANGE;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, 'safe=' + safe + '\n');
process.exit(rep.broken.length ? 1 : 0);
