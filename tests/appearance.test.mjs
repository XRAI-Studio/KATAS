// Class standard 6.6: KATAS is dark-only. The page carries data-theme="dark" and
// color-scheme dark statically, runs no theme head script, and no stylesheet keys colours
// off prefers-color-scheme. The Next shell's layout (which renders the 404) matches.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('the viewer page is statically dark, with no theme head script', () => {
  const html = read('public/index.html');
  assert.match(html, /<html lang="en" data-theme="dark" style="color-scheme: dark">/);
  assert.match(html, /<meta name="color-scheme" content="dark">/);
  assert.doesNotMatch(html, /data-ts-theme|ts_theme/);
});

test('no stylesheet uses prefers-color-scheme', () => {
  assert.doesNotMatch(read('public/css/app.css'), /prefers-color-scheme/);
});

test('the Next shell layout (404 page) is statically dark', () => {
  const layout = read('src/app/layout.tsx');
  assert.match(layout, /<html lang="en" data-theme="dark" style=\{\{ colorScheme: "dark" \}\}>/);
  assert.match(layout, /colorScheme: "dark" \}/);
  assert.match(layout, /background: "#1a140e"/);
});
