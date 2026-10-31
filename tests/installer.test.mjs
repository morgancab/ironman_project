// Page publique d'installation : elle doit rester installable et accessible à son adresse courte.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const html = readFileSync(new URL('installer.html', root), 'utf8');

test('la page déclare l’app installable', () => {
  assert.match(html, /<link rel="manifest" href="manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon"/);
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
});

test('ses fichiers existent et son script est valide', () => {
  for (const f of html.matchAll(/(?:src|href)="([\w-]+\.(?:png|svg|webmanifest))"/g)) assert.ok(existsSync(new URL(f[1], root)), f[1]);
  for (const s of html.matchAll(/<script>([\s\S]*?)<\/script>\s*(?:<\/body>|<style>)/g)) new Function(s[1]);
});

test('chaque panneau appelé par le script existe dans la page', () => {
  const panels = html.match(/\[('p-[^\]]+)\]\.forEach/)[1].match(/p-[a-z]+/g);
  assert.equal(panels.length, 6);
  for (const p of panels) assert.ok(html.includes('id="' + p + '"'), p);
});

test('l’adresse courte /installer mène à la page', () => {
  const { rewrites } = JSON.parse(readFileSync(new URL('vercel.json', root), 'utf8'));
  assert.ok(rewrites.some((r) => r.source === '/installer' && r.destination === '/installer.html'));
});
