// Règles d'entraînement : ce qu'un coach refuserait de voir dans un plan. Les plans testés sont ceux créés par l'app : volume au pic selon le format et le niveau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, raceConfig, sessions, textOf, addDays } from './harness.mjs';

const PEAK = { sprint: [4, 5.5, 7], olympic: [5, 7, 9], half: [7, 10, 12.5], full: [10, 13, 15.6] };   // FORMATS de index.html : débutant, intermédiaire, confirmé
const SESS = { sprint: 6, olympic: 6, half: 7, full: 8 };
const LONG = { sprint: 60, olympic: 80, half: 120, full: 150 }, SWIM = { sprint: 1900, olympic: 2700, half: 3600, full: 4200 };

function eachReal(fn, weeks = [6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 25, 26, 30, 36, 44, 52]) {
  for (const format of Object.keys(PEAK)) for (const n of weeks) for (let l = 0; l < 3; l++) {
    const race = raceConfig({ format, weeks: n, peak: PEAK[format][l], sessions: SESS[format] });
    fn(loadApp({ race, today: addDays(race.start, 3) }).IM, format + ' ' + n + ' sem., niveau ' + (l + 1), format, n);
  }
}
const charge = (IM) => IM.PLAN.filter((w) => w.kind[0] === 'c');

test('progression : pas de bond entre deux semaines de charge', () => {
  eachReal((IM, tag) => {
    const c = charge(IM);
    for (let i = 1; i < c.length; i++) assert.ok(c[i].min <= c[i - 1].min * 1.2 + 15, tag + ' : S' + c[i - 1].n + ' ' + c[i - 1].min + ' → S' + c[i].n + ' ' + c[i].min);
  });
});

test('progression : le volume ne recule pas d’une semaine de charge à l’autre', () => {
  eachReal((IM, tag) => {
    const c = charge(IM);
    for (let i = 1; i < c.length; i++) assert.ok(c[i].min >= c[i - 1].min - 10, tag + ' : S' + c[i - 1].n + ' ' + c[i - 1].min + ' → S' + c[i].n + ' ' + c[i].min);
  });
});

test('le pic arrive juste avant l’affûtage, une seule fois', () => {
  eachReal((IM, tag, f) => {
    const c = charge(IM), peak = Math.max(...c.map((w) => w.min));
    assert.ok(c[c.length - 1].min >= peak - 10, tag + ' : dernière charge ' + c[c.length - 1].min + ', pic ' + peak);
    if (c.length >= 8 && f === 'full') assert.ok(c.filter((w) => w.min >= peak - 5).length <= 3, tag + ' : trop de semaines au pic');
  });
});

test('une décharge allège vraiment', () => {
  eachReal((IM, tag) => IM.PLAN.forEach((w, i) => {
    if (w.kind === 'rec') assert.ok(w.min <= IM.PLAN[i - 1].min * 0.9, tag + ' : décharge S' + w.n + ' ' + w.min + ' après ' + IM.PLAN[i - 1].min);
  }));
});

test('l’affûtage reste sous le pic et décroît jusqu’à la course', () => {
  eachReal((IM, tag) => {
    const peak = Math.max(...charge(IM).map((w) => w.min)), t = IM.PLAN.filter((w) => w.kind === 'taper');
    t.forEach((w) => assert.ok(w.min <= peak * 0.85, tag + ' : affûtage ' + w.min + ', pic ' + peak));
    if (t.length === 2) assert.ok(t[1].min < t[0].min, tag);
    assert.ok(IM.PLAN[IM.PLAN.length - 1].min <= t[t.length - 1].min + 5, tag + ' : semaine de course');
  });
});

test('limites par format : sortie longue et natation', () => {
  eachReal((IM, tag, f) => sessions(IM).forEach((s) => {
    if (s.sp === 'run' && s.d === 6) assert.ok(s.min <= LONG[f], tag + ' : sortie longue ' + s.min + ' min');
    if (s.sp === 'swim') assert.ok(s.m <= SWIM[f], tag + ' : natation ' + s.m + ' m');
  }));
});

test('jours intenses par semaine : 3 au plus sur format court, 4 sur longue distance', () => {
  const INTENSE = /allure|sweet|tempo|force-endurance|progressif/i;
  eachReal((IM, tag, f) => IM.PLAN.slice(0, -1).forEach((w) => {
    const days = w.days.filter((d) => d.sessions.some((s) => ['bike', 'run', 'brick'].includes(s.sp) && INTENSE.test(s.sum || ''))).length;
    assert.ok(days <= (f === 'sprint' || f === 'olympic' ? 3 : 4), tag + ' : S' + w.n + ' a ' + days + ' jours intenses');
  }));
});

test('l’allure de course correspond à la distance', () => {
  const rpe = {};
  for (const f of ['sprint', 'olympic', 'half', 'full']) {
    const race = raceConfig({ format: f, weeks: 25 }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    rpe[f] = Number(/RPE (\d)/.exec(IM.tx('{r:im}'))[1]);
    assert.match(IM.tx('{b:im}'), /RPE/);
  }
  assert.ok(rpe.sprint > rpe.half && rpe.half > rpe.full, JSON.stringify(rpe));
  const sprint = loadApp({ race: raceConfig({ format: 'sprint', weeks: 12 }), today: '2027-05-01' }).IM;
  assert.match(sprint.tx('{b:im}'), /92–100 % FTP/);
});

test('un sprint ou un olympique ne demande pas de longs blocs à allure de course', () => {
  const LIM = { sprint: { bike: 30, run: 15 }, olympic: { bike: 40, run: 25 } };
  for (const f of Object.keys(LIM)) for (const n of [8, 12, 16]) {
    const race = raceConfig({ format: f, weeks: n, peak: PEAK[f][1], sessions: 6 }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    sessions(IM).filter((s) => s.sp === 'bike' || s.sp === 'run').forEach((s) => {
      const m = /(\d+) × (\d+) min .*allure/.exec(s.sum || '');
      if (m) assert.ok(m[1] * m[2] <= LIM[f][s.sp], f + ' ' + s.id + ' : ' + s.sum);
    });
  }
});

test('une séance de qualité en course contient assez de travail', () => {
  for (const [f, min] of [['sprint', 6], ['olympic', 10], ['half', 16], ['full', 30]]) {
    const race = raceConfig({ format: f, weeks: 25, peak: PEAK[f][1], sessions: SESS[f] }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    sessions(IM).filter((s) => s.sp === 'run' && /^Course · Allure/.test(s.title) && s.w > 16 && s.w < 23).forEach((s) => {
      const m = /(\d+) × (\d+) min/.exec(s.sum);
      assert.ok(m && m[1] * m[2] >= min, f + ' ' + s.id + ' : ' + s.sum);
    });
  }
});

test('un format court ne parle pas de surcharge glucidique ni de sacs de transition', () => {
  for (const f of ['sprint', 'olympic']) {
    const race = raceConfig({ format: f, weeks: 12 }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    IM.PLAN[11].days.flatMap((d) => d.sessions).forEach((s) => assert.doesNotMatch(textOf(IM, s), /8–10 g\/kg|sacs/, f + ' ' + s.id));
  }
});

test('course à pied : la sortie longue à allure de course n’est pas chaque semaine', () => {
  const { IM } = loadApp({ today: '2027-02-10' });
  const spe = IM.PLAN.filter((w) => w.ph.k === 'spe' && w.kind[0] === 'c');
  const hard = spe.flatMap((w) => w.days[6].sessions).filter((s) => /allure Ironman/.test(s.title));
  assert.ok(hard.length >= 1 && hard.length < spe.length, hard.length + ' sur ' + spe.length);
});
