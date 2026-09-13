// Run with: node src/components/communityIntroGate.test.mjs
// Guards the three failures that matter: pestering a user who already
// dismissed it, ambushing a brand-new user who is still in the tutorial, and
// stacking on top of the MCP announcement.
import { strict as assert } from 'node:assert';
import { shouldShowIntro, shouldShowIntroFrom, INTRO_SEEN_KEY } from './communityIntroGate.js';

// The population this is for: an existing user, past the tutorial, who has
// already seen the MCP announcement.
const returning = { introSeen: null, hasSeenTutorial: 'true', mcpSeen: 'true' };

assert.ok(shouldShowIntro(returning), 'the updating user never saw it');

// Once dismissed it is gone for good, whatever else is true.
assert.ok(!shouldShowIntro({ ...returning, introSeen: 'true' }), 'reappeared after dismissal');

// A brand-new install belongs to the tutorial. Showing this on top of a
// first run is the exact collision announceGate.js was written to prevent.
assert.ok(
    !shouldShowIntro({ ...returning, hasSeenTutorial: null }),
    'ambushed a brand-new user'
);

// Someone who has used the app but never got the MCP announcement gets that
// first; this one waits for the next launch rather than queueing two modals.
assert.ok(!shouldShowIntro({ ...returning, mcpSeen: null }), 'stacked on the MCP announcement');

// A new user who has seen neither stays clear on both counts.
assert.ok(
    !shouldShowIntro({ introSeen: null, hasSeenTutorial: null, mcpSeen: null }),
    'opened on a completely fresh install'
);

// The localStorage adapter reads the keys the rest of the app actually writes.
const fake = (entries) => ({ getItem: (k) => entries[k] ?? null });

assert.ok(
    shouldShowIntroFrom(fake({ has_seen_tutorial: 'true', mcp_announce_seen: 'true' })),
    'adapter blocked a user who was owed the intro'
);
assert.ok(
    !shouldShowIntroFrom(fake({
        has_seen_tutorial: 'true',
        mcp_announce_seen: 'true',
        [INTRO_SEEN_KEY]: 'true',
    })),
    'adapter ignored the seen flag'
);
assert.ok(!shouldShowIntroFrom(fake({})), 'adapter opened on an empty store');

console.log('communityIntroGate: ok');
