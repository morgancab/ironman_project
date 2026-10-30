// Séances manquées : recommandation, report, annulation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadApp, raceConfig, sessions, addDays } from './harness.mjs';

const race = raceConfig({ format: 'full', weeks: 25, date: '2027-06-27' });   // début le lundi 4 janvier 2027
const TODAY = '2027-02-10';                                                  // mercredi, semaine 6
const open = (today = TODAY, state = {}, r = race) => loadApp({ race: r, today, state });
const snapshot = (IM) => JSON.stringify(sessions(IM).map((s) => [s.id, s.w, s.d, s.sp, s.min, s.title]));
const gOf = (s) => (s.w - 1) * 7 + s.d;
const todayIdx = (d) => Math.round((new Date(d + 'T12:00:00') - new Date(race.start + 'T12:00:00')) / 864e5);

test('sont manquées : séances passées et non faites, sur 7 jours', () => {
  const { IM } = open();
  const l = IM.missedList(), t = todayIdx(TODAY);
  assert.ok(l.length > 0);
  l.forEach((s) => { assert.ok(gOf(s) < t && gOf(s) >= t - 7, s.id); assert.notEqual(s.sp, 'rest'); });
});

test('une séance cochée ou liée à Garmin n’est pas manquée', () => {
  const first = open().IM.missedList()[0];
  assert.ok(!open(TODAY, { done: { [first.id]: true } }).IM.missedList().some((s) => s.id === first.id));
});

test('avant le début du plan, rien n’est manqué', () => {
  assert.equal(open('2027-01-02').IM.missedList().length, 0);
  assert.equal(open('2027-01-04').IM.missedList().length, 0);
});

test('recommandation : renfo et enchaînement ne se rattrapent pas', () => {
  const { IM } = open();
  sessions(IM).filter((s) => s.sp === 'str' || s.sp === 'brick').slice(0, 20).forEach((s) => assert.equal(IM.missAdvice(s).rec, 'skip', s.id));
});

test('recommandation : semaine de décharge ou affûtage, on laisse tomber', () => {
  const { IM } = open();
  IM.PLAN.filter((w) => w.kind === 'rec' || w.kind === 'taper').forEach((w) => w.days.flatMap((d) => d.sessions).filter((s) => s.sp !== 'rest' && s.sp !== 'race').forEach((s) => assert.equal(IM.missAdvice(s).rec, 'skip', s.id)));
});

test('une date proposée respecte la semaine', () => {
  for (const today of ['2027-02-10', '2027-03-03', '2027-04-14', '2027-05-19']) {
    const { IM } = open(today), t = todayIdx(today);
    sessions(IM).filter((s) => s.sp !== 'rest' && s.sp !== 'race' && s.w < 25).forEach((s) => {
      const o = IM.missAdvice(s);
      for (const g of [o.move, o.short]) if (g !== null) {
        assert.ok(g >= t && g <= t + 6, today + ' ' + s.id + ' : jour ' + g);
        const wk = IM.PLAN[Math.floor(g / 7)];
        assert.ok(wk.kind !== 'taper' && wk.kind !== 'race', s.id + ' : semaine ' + wk.kind);
        const day = wk.days[g % 7].sessions.filter((x) => x.sp !== 'rest');
        assert.ok(day.reduce((a, x) => a + x.min, 0) + (g === o.short ? o.shortMin : s.min) <= 120 || g === o.move, s.id + ' : journée surchargée');
        assert.ok(!day.some((x) => x.sp === s.sp), s.id + ' : deux séances de la même discipline');
      }
    });
  }
});

test('jamais de report autour d’une course intermédiaire', () => {
  const steps = [{ id: 's1', name: 'Tri', kind: 'tri', format: 'olympic', date: '2027-02-13', prio: 'prep', added: '2027-01-01' }];
  const { IM } = open(TODAY, { ui: { steps } }), block = todayIdx('2027-02-13');
  sessions(IM).filter((s) => s.sp === 'run' || s.sp === 'swim' || s.sp === 'bike').forEach((s) => {
    const o = IM.missAdvice(s);
    for (const g of [o.move, o.short]) if (g !== null) assert.ok(Math.abs(g - block) > 1, s.id + ' : jour ' + g);
  });
});

test('reporter, puis annuler, rétablit exactement le plan', () => {
  const { IM } = open(), before = snapshot(IM);
  const s = IM.missedList().find((x) => IM.missAdvice(x).move !== null);
  assert.ok(s, 'une séance reportable');
  const id = s.id, g = IM.missAdvice(s).move;
  IM.missDo(id, 'move');
  const moved = sessions(IM).find((x) => x.id === id);
  assert.equal(gOf(moved), g);
  assert.ok(moved.moved);
  assert.ok(!IM.missedList().some((x) => x.id === id));
  assert.equal(sessions(IM).filter((x) => x.id === id).length, 1, 'pas de doublon');
  IM.missUndo(id);
  assert.equal(snapshot(IM), before);
});

test('version courte : plus courte, et annulable', () => {
  const { IM } = open('2027-03-03'), before = snapshot(IM);
  const s = sessions(IM).find((x) => { const o = IM.missAdvice(x); return x.sp === 'bike' && o.short !== null && x.min > o.shortMin; });
  assert.ok(s, 'une séance raccourcissable');
  const id = s.id, m0 = s.min, sh = IM.missAdvice(s).shortMin;
  IM.missDo(id, 'short');
  const after = sessions(IM).find((x) => x.id === id);
  assert.equal(after.min, sh);
  assert.ok(after.min < m0);
  IM.missUndo(id);
  assert.equal(snapshot(IM), before);
});

test('laisser tomber : plus proposée, le plan ne bouge pas', () => {
  const { IM } = open(), before = snapshot(IM);
  const id = IM.missedList()[0].id;
  IM.missDo(id, 'skip');
  assert.ok(!IM.missedList().some((x) => x.id === id));
  assert.equal(snapshot(IM), before);
});

test('reprendre le plan efface toute la liste', () => {
  const { IM } = open();
  assert.ok(IM.missedList().length >= 3);
  IM.missAll();
  assert.equal(IM.missedList().length, 0);
});

test('la décision survit au rechargement', () => {
  const a = open();
  const s = a.IM.missedList().find((x) => a.IM.missAdvice(x).move !== null), id = s.id, g = a.IM.missAdvice(s).move;
  a.IM.missDo(id, 'move');
  const saved = JSON.parse(a.store.get('ironman-sables-2027:v1'));
  const b = loadApp({ race, today: TODAY, state: { done: saved.done, ui: saved.ui } });
  assert.equal(gOf(sessions(b.IM).find((x) => x.id === id)), g);
});

test('l’accueil et la semaine affichent les bons choix, sur tous les formats', () => {
  for (const format of ['sprint', 'olympic', 'half', 'full']) for (const weeks of [6, 25]) {
    const r = raceConfig({ format, weeks }), today = addDays(r.start, 17);
    const home = loadApp({ race: r, today, hash: '#dash' }).view();
    assert.match(home, /Séance|séances/, format + ' ' + weeks);
    assert.doesNotMatch(home.replace(/<[^>]+>/g, ' '), /undefined|NaN/);
    assert.doesNotMatch(loadApp({ race: r, today, hash: '#week' }).view().replace(/<[^>]+>/g, ' '), /undefined|NaN/);
  }
});
