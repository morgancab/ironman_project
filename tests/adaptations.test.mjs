// Courses intermédiaires, vacances, durées et catalogue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, raceConfig, sessions, addDays } from './harness.mjs';

const race = raceConfig({ format: 'full', weeks: 25, date: '2027-06-27' });        // début le lundi 4 janvier 2027
const snapshot = (IM) => JSON.stringify(sessions(IM).map((s) => [s.id, s.w, s.d, s.sp, s.min, s.title]));
const on = (IM, date) => { const d = new Date(date + 'T12:00:00'); return IM.PLAN.flatMap((w) => w.days).find((x) => x.date.getFullYear() === d.getFullYear() && x.date.getMonth() === d.getMonth() && x.date.getDate() === d.getDate()).sessions; };
const step = (o) => ({ id: 's1', name: 'Tri test', kind: 'tri', format: 'olympic', date: '2027-03-14', prio: 'prep', added: '2027-01-01', ...o });

test('course intermédiaire : le jour J remplace les séances', () => {
  const { IM } = loadApp({ race, today: '2027-02-01', state: { ui: { steps: [step()] } } });
  const d = on(IM, '2027-03-14');
  assert.equal(d.length, 1);
  assert.equal(d[0].sp, 'race');
  assert.equal(d[0].id, 'st.s1');
  assert.equal(sessions(IM).filter((s) => s.sp === 'race').length, 2);
});

test('la veille : activation seule, jamais une longue sortie', () => {
  for (const date of ['2027-03-14', '2027-03-15', '2027-03-17']) for (const prio of ['prep', 'key']) {
    const { IM } = loadApp({ race, today: '2027-02-01', state: { ui: { steps: [step({ date, prio })] } } });
    const eve = on(IM, addDays(date, -1)).filter((s) => s.sp !== 'rest');
    assert.ok(eve.length <= 1, date + ' : ' + eve.length + ' séances la veille');
    eve.forEach((s) => assert.ok(s.min <= 20, date + ' : ' + s.title + ' ' + s.min + ' min'));
  }
});

test('plafonds près de la course, et repos le lendemain', () => {
  const { IM } = loadApp({ race, today: '2027-02-01', state: { ui: { steps: [step({ date: '2027-03-15', prio: 'key', format: 'half' })] } } });
  on(IM, '2027-03-13').forEach((s) => { if (s.sp === 'bike') assert.ok(s.min <= 60, 'avant-veille à vélo : ' + s.min); if (s.sp === 'run') assert.ok(s.min <= 40); assert.notEqual(s.sp, 'brick'); assert.notEqual(s.sp, 'str'); });
  assert.equal(on(IM, '2027-03-16').map((s) => s.sp).join(), 'rest');
  for (let i = 3; i <= 10; i++) on(IM, addDays('2027-03-15', -i)).forEach((s) => { if (s.sp === 'bike') assert.ok(s.min <= 150, i + ' j avant : vélo ' + s.min); if (s.sp === 'run') assert.ok(s.min <= 75); });
});

test('natation : pas d’activation en course à pied la veille', () => {
  const { IM } = loadApp({ race, today: '2027-02-01', state: { ui: { steps: [step({ kind: 'swim', distM: 2000 })] } } });
  assert.equal(on(IM, '2027-03-13').map((s) => s.sp).join(), 'rest');
});

test('les jours antérieurs à l’ajout ne changent pas', () => {
  const base = loadApp({ race, today: '2027-03-12' }).IM;
  const { IM } = loadApp({ race, today: '2027-03-12', state: { ui: { steps: [step({ prio: 'key', format: 'half', added: '2027-03-12' })] } } });
  assert.equal(JSON.stringify(on(IM, '2027-03-11').map((s) => s.min)), JSON.stringify(on(base, '2027-03-11').map((s) => s.min)));
});

test('retirer une course ou une période rétablit exactement le plan', () => {
  const clean = snapshot(loadApp({ race, today: '2027-02-01' }).IM);
  const a = loadApp({ race, today: '2027-02-01', state: { ui: { steps: [step(), step({ id: 's2', date: '2027-03-20', prio: 'key', format: 'half' })] } } });
  assert.notEqual(snapshot(a.IM), clean);
  a.IM.state.ui.steps = [];
  a.IM.applyAway();
  assert.equal(snapshot(a.IM), clean, 'courses');
  const away = { id: 'a1', type: 'vacances', label: 'Vacances', from: '2027-02-08', to: '2027-02-14', mode: 'min', move: 'none', pool: false, bike: false };
  const b = loadApp({ race, today: '2027-02-01', state: { ui: { away: [away] } } });
  assert.notEqual(snapshot(b.IM), clean);
  b.IM.state.ui.away = [];
  b.IM.applyAway();
  assert.equal(snapshot(b.IM), clean, 'vacances');
});

test('une course hors du plan ne change rien', () => {
  const clean = snapshot(loadApp({ race, today: '2027-02-01' }).IM);
  for (const date of ['2026-06-01', '2027-06-25', '2028-01-01']) assert.equal(snapshot(loadApp({ race, today: '2027-02-01', state: { ui: { steps: [step({ date })] } } }).IM), clean, date);
});

test('durées au format XhXX', () => {
  const { IM } = loadApp({ race });
  for (const [m, t] of [[0, '0h00'], [5, '0h05'], [56, '0h56'], [60, '1h00'], [96, '1h36'], [600, '10h00'], [59.6, '1h00']]) assert.equal(IM.fh(m), t);
  for (const [s, t] of [[3352, '0h56'], [5763, '1h36'], [49500, '13h45']]) assert.equal(IM.hms(s), t);
  assert.equal(IM.fm(45), '45 min');
  assert.equal(IM.fm(96), '1h36');
  assert.equal(IM.fm(120), '2h00');
});

test('aucune durée à l’ancien format dans les séances ni les pages', () => {
  for (const hash of ['#week?w=5', '#plan', '#dash', '#more']) {
    const h = loadApp({ race, today: '2027-02-01', hash }).view().replace(/<[^>]+>/g, ' ');
    assert.doesNotMatch(h, /\b\d+ h \d\d\b/, hash);
  }
});

test('catalogue : lignes valides et sans doublon', () => {
  const { RACE_CAT, IM } = loadApp({ race });
  assert.ok(RACE_CAT.length >= 100);
  const seen = new Set();
  RACE_CAT.forEach((e) => {
    assert.ok(e[0] && !seen.has(e[0]), 'doublon ou nom vide : ' + e[0]);
    seen.add(e[0]);
    assert.ok(['full', 'half', 'olympic', 'sprint'].includes(e[3]), e[0]);
    assert.ok(Number.isInteger(e[4]) && e[4] >= 0 && e[4] <= 12, e[0]);
    const d = e[5] && e[5].date;
    if (d) { assert.match(d, /^\d{4}-\d{2}-\d{2}$/, e[0]); assert.equal(Number(d.slice(5, 7)), e[4], e[0] + ' : mois différent de la date'); }
  });
  assert.ok(IM.catSearch('hamburg').length >= 1);
});
