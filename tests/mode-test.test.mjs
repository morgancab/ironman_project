// Mode test : il doit agir en local, et ne jamais rien changer sur le site en ligne.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const read = (f) => readFileSync(new URL(f, root), 'utf8');
const src = read('dev-appareil.js');

// dansCadre : la page tourne dans l'aperçu (iframe) ; sinon elle est ouverte directement
function run(hostname, search, protocol = 'https:', dansCadre = true) {
  const navigator = { userAgent: 'vrai navigateur', platform: 'vraie', maxTouchPoints: 0 }, written = [];
  const ctx = { navigator, location: { hostname, search, protocol, pathname: '/', hash: '', href: '' }, Object, setTimeout, setInterval, Promise, Event: class {}, Option: class {} };
  ctx.document = { write: (x) => written.push(x), addEventListener() {} };
  ctx.window = { addEventListener() {}, dispatchEvent() {} };
  ctx.window.top = dansCadre ? {} : ctx.window;
  vm.runInNewContext(src, ctx);
  return { navigator, written, A: ctx.window.DEV_APPAREILS };
}

test('en local, ?appareil= change ce que la page détecte', () => {
  const { navigator } = run('localhost', '?appareil=iphone-safari&profil=test', 'http:');
  assert.match(navigator.userAgent, /iPhone/);
  assert.equal(navigator.platform, 'iPhone');
  assert.equal(navigator.maxTouchPoints, 5);
});

test('ouverte directement avec ?appareil=, la page n’exécute pas une seconde copie de l’app', () => {
  const { navigator, written } = run('localhost', '?profil=sprint&appareil=iphone-safari', 'http:', false);
  assert.match(written.join(''), /<plaintext/);
  assert.equal(navigator.userAgent, 'vrai navigateur');
});

test('un profil de test sans appareil laisse la page normale', () => {
  const { navigator, written } = run('localhost', '?profil=sprint', 'http:', false);
  assert.equal(written.length, 0);
  assert.equal(navigator.userAgent, 'vrai navigateur');
});

test('sur le site en ligne, le fichier ne change rien', () => {
  for (const dansCadre of [true, false]) {
    const { navigator, written } = run('ironmanproject.vercel.app', '?profil=x&appareil=iphone-safari', 'https:', dansCadre);
    assert.equal(navigator.userAgent, 'vrai navigateur');
    assert.equal(written.length, 0);
  }
});

test('un appareil inconnu ne change rien', () => {
  assert.equal(run('localhost', '?appareil=nimporte', 'http:').navigator.userAgent, 'vrai navigateur');
});

test('chaque appareil est complet', () => {
  const { A } = run('localhost', '', 'http:');
  assert.ok(Object.keys(A).length >= 10);
  for (const [id, d] of Object.entries(A)) {
    assert.ok(d.groupe && d.nom && d.ua && d.pf, id);
    assert.ok(d.w > 300 && d.h > 500, id);
  }
});

test('les pages ne chargent le fichier de test qu’en local, et il n’est pas publié', () => {
  for (const f of ['index.html', 'installer.html']) {
    const line = read(f).split('\n').find((l) => l.includes('dev-appareil.js'));
    assert.ok(line && /localhost/.test(line) && /appareil\|profil/.test(line), f);
  }
  const ignore = read('.vercelignore');
  assert.match(ignore, /^dev\.html$/m);
  assert.match(ignore, /^dev-appareil\.js$/m);
});
