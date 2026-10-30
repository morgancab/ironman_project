// Génération des plans : tous les formats, de 4 à 52 semaines. Lancer avec : node --test "tests/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, raceConfig, sessions, textOf, addDays } from './harness.mjs';

const REF_SABLES = '345,390,440,315,470,525,575,370,590,635,675,420,695,740,785,460,805,850,880,495,885,935,695,415,175';   // minutes par semaine du plan d'origine : à changer seulement si le plan est revu volontairement
const FORMATS = ['sprint', 'olympic', 'half', 'full', 'custom'];
const WEEKS = Array.from({ length: 49 }, (_, i) => i + 4);
const CAP = { sprint: [120, 70], olympic: [150, 90], half: [240, 130] };   // CAPS de index.html : [vélo long, sortie longue]

function eachPlan(fn) {
  for (const format of FORMATS) for (const weeks of WEEKS) {
    const race = raceConfig({ format, weeks });
    fn(loadApp({ race, today: addDays(race.start, 3) }).IM, format, weeks, race);
  }
}

test('structure : semaines, jours et dates', () => {
  eachPlan((IM, f, n, race) => {
    const tag = f + ' ' + n + ' sem.';
    assert.equal(IM.PLAN.length, n, tag);
    IM.PLAN.forEach((w, i) => {
      assert.equal(w.n, i + 1, tag);
      assert.equal(w.days.length, 7, tag);
      assert.equal(w.start.getDay(), 1, tag + ' : la semaine commence un lundi');
      w.days.forEach((d) => assert.ok(d.sessions.length > 0, tag + ' : jour vide, S' + w.n + ' ' + d.name));
    });
  });
});

test('une seule course, le bon jour', () => {
  for (const format of FORMATS) for (const weeks of [4, 5, 8, 12, 25, 52]) for (const off of [0, 1, 2, 3, 4, 5, 6]) {
    const date = addDays('2027-06-21', off), race = raceConfig({ format, weeks, date }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    const races = sessions(IM).filter((s) => s.sp === 'race');
    assert.equal(races.length, 1, format + ' ' + weeks);
    assert.equal(races[0].w, weeks, 'en dernière semaine');
    assert.equal(races[0].d, off, 'le jour de la course : ' + date);
  }
});

test('séances valides : identifiants uniques, valeurs finies', () => {
  eachPlan((IM, f, n) => {
    const seen = new Set();
    sessions(IM).forEach((s) => {
      const tag = f + ' ' + n + ' sem., ' + s.id;
      assert.ok(!seen.has(s.id), tag + ' : identifiant en double');
      seen.add(s.id);
      assert.ok(s.title, tag + ' : sans titre');
      assert.ok(Number.isFinite(s.min) && s.min >= 0, tag + ' : durée ' + s.min);
      assert.ok(Number.isFinite(s.m) && s.m >= 0, tag + ' : distance ' + s.m);
      if (s.sp !== 'rest' && s.sp !== 'race') assert.ok(s.min > 0, tag + ' : séance de durée nulle');
    });
  });
});

test('textes : rien de cassé, aucun repère oublié', () => {
  for (const format of FORMATS) for (const weeks of [4, 7, 12, 25, 52]) {
    const race = raceConfig({ format, weeks }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    sessions(IM).forEach((s) => {
      const t = textOf(IM, s);
      assert.doesNotMatch(t, /undefined|NaN|null|\[object|\{[brs]:/, format + ' ' + s.id + ' : ' + t);
    });
  }
});

test('une autre course que les Sables ne parle ni d’Ironman ni du chenal', () => {
  for (const format of FORMATS) for (const weeks of [6, 25, 52]) {
    const race = raceConfig({ format, weeks }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    sessions(IM).forEach((s) => assert.doesNotMatch(textOf(IM, s), /ironman|chenal|sables/i, format + ' ' + s.id));
  }
});

test('phases et blocs couvrent tout le plan, sans trou', () => {
  eachPlan((IM, f, n) => {
    let next = 1;
    IM.BLOCKS.forEach((b) => { assert.equal(b.a, next, f + ' ' + n + ' : bloc ' + b.n); assert.ok(b.b >= b.a); next = b.b + 1; });
    assert.equal(next, n + 1, f + ' ' + n + ' : blocs incomplets');
    assert.equal(IM.KINDS.length, n);
    assert.equal(IM.KINDS[n - 1], 'race');
  });
});

test('charge : affûtage plus léger que le pic, sorties longues plafonnées', () => {
  eachPlan((IM, f, n) => {
    const tag = f + ' ' + n + ' sem.', w = IM.PLAN, peak = Math.max(...w.filter((x) => x.kind !== 'taper' && x.kind !== 'race').map((x) => x.min));
    w.filter((x) => x.kind === 'taper').forEach((x) => assert.ok(x.min <= peak * 0.85, tag + ' : affûtage S' + x.n + ' = ' + x.min + ' min, pic ' + peak));
    const fmt = f === 'custom' ? 'olympic' : f;     // distances libres de test : 60 km à vélo
    if (CAP[fmt]) sessions(IM).forEach((s) => {
      if (s.sp === 'bike' && s.d === 5) assert.ok(s.min <= CAP[fmt][0], tag + ' : ' + s.id + ' = ' + s.min + ' min');
      if (s.sp === 'run' && s.d === 6) assert.ok(s.min <= CAP[fmt][1], tag + ' : ' + s.id + ' = ' + s.min + ' min');
    });
  });
});

test('affûtage en 2 semaines : la seconde est plus légère', () => {
  eachPlan((IM, f, n) => {
    const t = IM.PLAN.filter((x) => x.kind === 'taper');
    if (t.length === 2) assert.ok(t[1].min < t[0].min, f + ' ' + n + ' sem. : ' + t[0].min + ' puis ' + t[1].min);
  });
});

test('nombre de séances par semaine respecté', () => {
  for (const format of ['olympic', 'full']) for (const n of [3, 4, 5, 6, 7, 8]) for (const weeks of [12, 25]) {
    const race = raceConfig({ format, weeks, sessions: n }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    IM.PLAN.slice(0, -1).forEach((w) => {
      const c = w.days.flatMap((d) => d.sessions).filter((s) => s.sp !== 'rest').length;
      assert.ok(c <= n, format + ' ' + weeks + ' sem., S' + w.n + ' : ' + c + ' séances pour ' + n + ' demandées');
    });
  }
});

test('volume au pic demandé respecté', () => {
  for (const peak of [5, 8, 12]) {
    const race = raceConfig({ format: 'full', weeks: 25, peak }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
    const max = Math.max(...IM.PLAN.map((w) => w.min)) / 60;
    assert.ok(max <= peak * 1.2, 'pic demandé ' + peak + ' h, obtenu ' + max.toFixed(1) + ' h');
  }
});

test('stats cohérentes avec le plan', () => {
  const race = raceConfig({ format: 'half', weeks: 16 }), { IM } = loadApp({ race, today: addDays(race.start, 3) });
  const t = IM.stats().t;
  assert.equal(t.n, sessions(IM).filter((s) => s.sp !== 'rest').length);
  assert.equal(t.d, 0);
});

test('toutes les pages s’affichent, à tout moment du plan', () => {
  const pages = ['#dash', '#week', '#week?w=2', '#data', '#race', '#more', '#plan'];
  for (const format of FORMATS) for (const weeks of [4, 25, 52]) {
    const race = raceConfig({ format, weeks });
    for (const today of [addDays(race.start, -30), addDays(race.start, 3), race.date, addDays(race.date, 30)]) for (const hash of pages) {
      const { view } = loadApp({ race, today, hash });
      const h = view();
      assert.ok(h.length > 100, format + ' ' + weeks + ' ' + today + ' ' + hash + ' : page vide');
      assert.doesNotMatch(h.replace(/<[^>]+>/g, ' '), /undefined|NaN/, format + ' ' + weeks + ' ' + today + ' ' + hash);
    }
  }
});

test('plan de référence inchangé : Ironman des Sables, 25 semaines', () => {
  const { IM } = loadApp({ today: '2027-02-10' });
  assert.equal(IM.PLAN.map((w) => w.min).join(), REF_SABLES);
});

test('un plan ancien (Sables) sans course enregistrée reste valide', () => {
  const { IM } = loadApp({ today: '2027-02-10' });
  assert.equal(IM.PLAN.length, 25);
  assert.equal(sessions(IM).filter((s) => s.sp === 'race').length, 1);
});
