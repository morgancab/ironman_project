// Charge l'app dans un faux navigateur minimal (sans dépendance) : le vrai code de index.html et races.js tourne tel quel.
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('index.html', root), 'utf8');
const main = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((x) => x.includes('window.IM='));
if (!main) throw new Error('script principal introuvable');
const mainScript = new vm.Script(main, { filename: 'index.html' });
const racesScript = new vm.Script(readFileSync(new URL('races.js', root), 'utf8'), { filename: 'races.js' });

function element() {
  const el = {
    innerHTML: '', textContent: '', className: '', value: '', style: {}, children: [], dataset: {}, scrollTop: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, setAttribute() {}, removeAttribute() {}, getAttribute: () => null,
    querySelector: () => null, querySelectorAll: () => [], closest: () => null, focus() {}, scrollIntoView() {}, scrollTo() {},
    getBoundingClientRect: () => ({ top: 0, left: 0, width: 400, height: 400 }),
  };
  return el;
}

// Date du lundi de la semaine d'une date « AAAA-MM-JJ », et le calendrier d'un plan de n semaines
const utc = (s) => new Date(s + 'T12:00:00Z');
export const iso = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => iso(new Date(utc(s).getTime() + n * 864e5));
export function raceConfig({ format = 'full', weeks = 25, date = '2027-06-27', sessions = 8, level = 2, peak = 0, dist = null }) {
  const dow = (utc(date).getUTCDay() + 6) % 7, mon = addDays(date, -dow);
  const D = { sprint: [750, 20000, 5000], olympic: [1500, 40000, 10000], half: [1900, 90000, 21100], full: [3800, 180000, 42195], custom: [2000, 60000, 15000] }[format];
  const [swimM, bikeM, runM] = dist || D;
  return { id: 'test', name: 'Course de test', city: '', date, format, swimM, bikeM, runM, bikeUp: 0, runUp: 0, start: addDays(mon, -(weeks - 1) * 7), weeks, level, peak, sessions };
}

// state : contenu de localStorage (done, ui, links, sv, race) ; today : AAAA-MM-JJ ; hash : page à ouvrir
export function loadApp({ race, today = '2027-01-15', hash = '#dash', state = {} } = {}) {
  const store = new Map(), els = new Map();
  store.set('ironman-sables-2027:v1', JSON.stringify({ done: {}, links: {}, sv: {}, ...state, ui: { welcomed: true, seen: 1, noStats: true, ...(state.ui || {}) }, race }));
  const doc = element();
  Object.assign(doc, { hidden: false, title: '', body: element(), createElement: () => element(), getElementById: (id) => { if (!els.has(id)) els.set(id, element()); return els.get(id); }, activeElement: null });
  const location = { hash, search: '?today=' + today, protocol: 'file:', hostname: '', href: 'file:///index.html?today=' + today + hash, reload() {}, replace() {} };
  const ctx = {
    document: doc, location, console,
    navigator: {}, history: { pushState() {}, replaceState() {}, go() {} },
    localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
    addEventListener() {}, removeEventListener() {}, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {},
    scrollTo() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), fetch: () => new Promise(() => {}), confirm: () => true, innerHeight: 900, innerWidth: 430,
    crypto: { getRandomValues: (a) => a },
  };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  racesScript.runInContext(ctx);
  mainScript.runInContext(ctx);
  return { IM: ctx.IM, view: () => doc.getElementById('view').innerHTML, sheet: () => doc.getElementById('sheet').innerHTML, RACE_CAT: ctx.RACE_CAT, store };
}
// Toutes les séances du plan, et tout leur texte après remplacement des repères
export function sessions(IM) { return IM.PLAN.flatMap((w) => w.days.flatMap((d) => d.sessions)); }
export function textOf(IM, s) { return [s.title, s.tag, s.sum, s.goal, s.tip, ...(s.lines || [])].filter((x) => x != null).map((x) => IM.tx(String(x))).join(' | '); }
