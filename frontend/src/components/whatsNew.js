// Picks the tutorial steps an updating user has not been shown yet, and says
// whether now is the moment to show them. Pure, so it can be checked without
// a browser: `node src/components/whatsNew.test.mjs`
//
// Each step a release introduces carries `since: '<version>'`. Someone who
// updates gets a short tour of exactly those steps, once; after that they are
// ordinary entries in the tutorial menu. Nothing has to be removed next
// release: once the stored version passes a step's `since`, it stops being new.

export const WHATS_NEW_KEY = 'whats_new_seen';

// Numeric semver compare on major.minor.patch; anything after is ignored.
const parts = (v) => String(v).split(/[.-]/).slice(0, 3).map((n) => parseInt(n, 10) || 0);
export const newerThan = (a, b) => {
    const [x, y] = [parts(a), parts(b)];
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
    return false;
};

// Steps added after `seen` and up to `current`. A user who skipped releases
// sees every one they missed. No `seen` means they have never had a tour.
export const whatsNewSteps = (steps, current, seen) =>
    steps.filter((s) => s.since && newerThan(s.since, seen ?? '0.0.0') && !newerThan(s.since, current));

export const shouldShowWhatsNew = ({ hasSeenTutorial, mcpSeen }) => {
    if (!hasSeenTutorial) return false; // fresh install: the full tutorial owns the first run
    if (!mcpSeen) return false;         // the MCP announcement is still queued; it goes first
    return true;
};

// "3.2.0" -> "New in 3.2"
export const tourLabel = (version) => `New in ${parts(version).slice(0, 2).join('.')}`;
