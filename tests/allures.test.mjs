// Cohérence des allures : un bloc à allure de course doit être plus rapide que l'échauffement et le retour au calme.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, raceConfig, addDays } from './harness.mjs';

const secs = (s) => { const [m, x] = s.split(':').map(Number); return m * 60 + x; };
const paces = (t) => [...t.matchAll(/(\d+:\d\d)(?:–(\d+:\d\d))? \/km/g)].flatMap((m) => [m[1], m[2]].filter(Boolean)).map(secs);
const speeds = (t) => [...t.matchAll(/(\d+)(?:–(\d+))? km\/h/g)].flatMap((m) => [m[1], m[2]].filter(Boolean)).map(Number);

// 60 sorties récentes : plus la fréquence cardiaque monte, plus l'athlète va vite
function activities(today, runBase, bikeBase) {
  const acts = [];
  for (let i = 1; i <= 60; i++) {
    const hr = 125 + (i % 9) * 5, run = i % 2 === 0, d = addDays(today, -i * 2);
    const v = run ? runBase + (hr - 140) * 0.012 : (bikeBase + (hr - 140) * 0.18) / 3.6, sec = run ? 3600 : 7200;
    acts.push({ id: 'x' + i, s: d + 'T08:00:00', t: run ? 'Run' : 'Ride', n: 'Sortie', d: sec, e: sec, m: Math.round(v * sec), h: hr, z: run ? 60 : 300, l: 50 });
  }
  for (let i = 1; i <= 6; i++) acts.push({ id: 's' + i, s: addDays(today, -i * 5) + 'T07:00:00', t: 'Swim', n: 'Nage', d: 2400, e: 2400, m: 2000, h: 130, z: 0, l: 30 });
  return acts;
}
function app(format, { runBase = 2.8, bikeBase = 27, weeks = 25 } = {}) {
  const race = raceConfig({ format, weeks }), today = addDays(race.start, 60);
  return loadApp({ race, today, state: { sv: { url: 'https://x.invalid', key: 'k', conn: true, acts: activities(today, runBase, bikeBase), hrz: [125, 145, 155, 165, 172, 180, 195], meta: { lthr: 165, maxhr: 190 } } } }).IM;
}

for (const format of ['sprint', 'olympic', 'half', 'full']) for (const [runBase, bikeBase] of [[2.3, 22], [2.8, 27], [3.4, 33]]) {
  test('course à pied : allure de course plus rapide que l’échauffement · ' + format + ' · ' + runBase + ' m/s', () => {
    const IM = app(format, { runBase, bikeBase }), im = paces(IM.tx('{r:im}')), z2 = paces(IM.tx('{r:z2}')), soft = paces(IM.tx('{r:soft}'));
    assert.ok(im.length && z2.length, IM.tx('{r:im}') + ' / ' + IM.tx('{r:z2}'));
    assert.ok(Math.max(...im) <= Math.min(...z2), 'allure de course ' + IM.tx('{r:im}') + ', endurance ' + IM.tx('{r:z2}'));
    if (soft.length) assert.ok(Math.max(...im) < Math.min(...soft), 'allure de course ' + IM.tx('{r:im}') + ', très facile ' + IM.tx('{r:soft}'));
  });
  test('vélo : allure de course plus rapide que l’endurance · ' + format + ' · ' + bikeBase + ' km/h', () => {
    const IM = app(format, { runBase, bikeBase }), im = speeds(IM.tx('{b:im}')), z2 = speeds(IM.tx('{b:z2}'));
    assert.ok(im.length && z2.length, IM.tx('{b:im}') + ' / ' + IM.tx('{b:z2}'));
    assert.ok(Math.min(...im) >= Math.max(...z2), 'allure de course ' + IM.tx('{b:im}') + ', endurance ' + IM.tx('{b:z2}'));
  });
  test('natation : allure de course plus rapide que l’échauffement · ' + format, () => {
    const IM = app(format, { runBase, bikeBase }), one = (t) => [...t.matchAll(/(\d+:\d\d)/g)].map((m) => secs(m[1]));
    assert.ok(Math.max(...one(IM.tx('{s:im}'))) < Math.min(...one(IM.tx('{s:easy}'))), IM.tx('{s:im}') + ' / ' + IM.tx('{s:easy}'));
  });
}

test('sans Garmin, avec des repères saisis : même cohérence', () => {
  for (const format of ['sprint', 'olympic', 'half', 'full']) {
    const race = raceConfig({ format, weeks: 25 });
    const IM = loadApp({ race, today: addDays(race.start, 3), state: { ui: { prof: { thr: 300, css: 110 } } } }).IM;
    assert.ok(Math.max(...paces(IM.tx('{r:im}'))) <= Math.min(...paces(IM.tx('{r:z2}'))), format + ' : ' + IM.tx('{r:im}') + ' / ' + IM.tx('{r:z2}'));
  }
});
