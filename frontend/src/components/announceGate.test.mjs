// Run with: node src/components/announceGate.test.mjs
// Guards the two failures that matter: the announcement opening on top of the
// tutorial, and a brand-new user never being shown it at all.
import { strict as assert } from 'node:assert';
import { advance, canAnnounce, initialGate, IDLE, WAITING } from './announceGate.js';

// Replay a sequence of isTutorialActive values.
const run = (gate, flags) => flags.reduce(advance, gate);

// The starting state is decided from localStorage at first render, so a new
// user is blocked from the very first frame rather than after the backend is up.
assert.equal(initialGate(null), WAITING, 'new user was not blocked on first render');
assert.equal(initialGate('true'), IDLE, 'returning user was blocked on first render');
assert.ok(!canAnnounce(initialGate(null)), 'new user could announce immediately');

// Returning user, no tutorial in play.
assert.ok(canAnnounce(IDLE), 'returning user was blocked');
assert.equal(run(IDLE, [false, false, false]), IDLE, 'idle did not stay put');

// New user. The gate is set to 'waiting' before the tutorial starts, which
// covers the 800ms delay in App.jsx where nothing is active yet.
assert.ok(!canAnnounce(WAITING), 'opened before the tutorial had started');
assert.ok(!canAnnounce(run(WAITING, [false, false])), 'opened while still pending');
assert.ok(!canAnnounce(run(WAITING, [false, true, true])), 'opened on top of the tutorial');
assert.ok(canAnnounce(run(WAITING, [false, true, true, false])), 'new user never saw it');

// Returning user who starts the tutorial from the menu: hidden during, back after.
assert.ok(!canAnnounce(run(IDLE, [true])), 'stayed up when the tutorial opened');
assert.ok(canAnnounce(run(IDLE, [true, false])), 'did not come back after the tutorial');

// A second tutorial run hides it again rather than sticking on 'done'.
assert.ok(!canAnnounce(run(IDLE, [true, false, true])), 'stuck open on a repeat run');

console.log('announceGate: ok');
