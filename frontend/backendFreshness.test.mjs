// Run with: node backendFreshness.test.mjs
// Guards the failure that shipped a 500: a backend artifact older than the
// Python sources getting bundled without complaint.
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isStale, newestMtime } from './backendFreshness.js';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'freshness-'));
const backend = path.join(root, 'backend');
fs.mkdirSync(path.join(backend, 'templates'), { recursive: true });
fs.writeFileSync(path.join(backend, 'main.py'), 'x');
fs.writeFileSync(path.join(backend, 'templates', 'setup.html'), 'x');

// The artifact is built after the sources, which is the healthy case.
const built = path.join(backend, 'dist', 'backend_server');
fs.mkdirSync(built, { recursive: true });
const binary = path.join(built, 'backend_server');
fs.writeFileSync(binary, 'x');

const touch = (p, msAgo) => {
  const t = new Date(Date.now() - msAgo);
  fs.utimesSync(p, t, t);
};

touch(path.join(backend, 'main.py'), 60_000);
touch(path.join(backend, 'templates', 'setup.html'), 60_000);
touch(binary, 0);

assert.ok(!isStale(binary, [backend]), 'fresh artifact was reported stale');

// dist/ is a build output; scanning it would compare the artifact against itself
// and report fresh forever.
assert.ok(
  newestMtime([backend]) < fs.statSync(binary).mtimeMs,
  'dist/ leaked into the source scan',
);

// The actual bug: a template edited after the backend was built.
touch(path.join(backend, 'templates', 'setup.html'), 0);
touch(binary, 30_000);
assert.ok(isStale(binary, [backend]), 'edited template did not trip the guard');

// A .py edit trips it too, not just templates.
touch(path.join(backend, 'templates', 'setup.html'), 60_000);
touch(path.join(backend, 'main.py'), 0);
assert.ok(isStale(binary, [backend]), 'edited source did not trip the guard');

// Nothing built yet is ensure-backend.js's existing dummy-backend path, not ours.
assert.ok(!isStale(path.join(built, 'nope'), [backend]), 'absent artifact was reported stale');

fs.rmSync(root, { recursive: true, force: true });
console.log('backendFreshness: ok');
