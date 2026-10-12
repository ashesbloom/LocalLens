// Run with: node src/components/whatsNew.test.mjs
// Guards the failures that matter: showing an updater nothing new, showing
// them old features again, and ambushing a brand-new user mid-tutorial.
import { strict as assert } from 'node:assert';
import { newerThan, whatsNewSteps, shouldShowWhatsNew, tourLabel } from './whatsNew.js';

assert.ok(newerThan('3.10.0', '3.9.9'), 'compared as strings, not numbers');
assert.ok(!newerThan('3.2.0', '3.2.0'), 'a version is newer than itself');
assert.ok(newerThan('4.0.0', '3.99.99'), 'major did not win');

const steps = [
    { title: 'old' },
    { title: 'dup', since: '3.2.0' },
    { title: 'community', since: '3.2.0' },
    { title: 'later', since: '3.3.0' },
];
const titles = (s) => s.map((x) => x.title);

// The first release with this mechanism: nobody has a stored version yet.
assert.deepEqual(titles(whatsNewSteps(steps, '3.2.0', null)), ['dup', 'community'], 'first tour wrong');
// Seen this release already: nothing.
assert.deepEqual(whatsNewSteps(steps, '3.2.0', '3.2.0'), [], 'repeated a tour');
// Next release: only what is newer than what they saw.
assert.deepEqual(titles(whatsNewSteps(steps, '3.3.0', '3.2.0')), ['later'], 'old steps came back');
// Skipped a release: they get both.
assert.deepEqual(titles(whatsNewSteps(steps, '3.3.0', '3.1.0')), ['dup', 'community', 'later'], 'missed release dropped');
// Steps tagged for a version not shipped yet stay hidden.
assert.deepEqual(titles(whatsNewSteps(steps, '3.2.1', null)), ['dup', 'community'], 'leaked an unreleased step');

const returning = { hasSeenTutorial: 'true', mcpSeen: 'true' };
assert.ok(shouldShowWhatsNew(returning), 'updater got no tour');
assert.ok(!shouldShowWhatsNew({ ...returning, hasSeenTutorial: null }), 'fresh install got the tour');
assert.ok(!shouldShowWhatsNew({ ...returning, mcpSeen: null }), 'stacked on the MCP announcement');

assert.equal(tourLabel('3.2.0'), 'New in 3.2');

console.log('whatsNew: ok');
