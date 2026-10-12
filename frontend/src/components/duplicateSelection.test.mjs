// Run with: node src/components/duplicateSelection.test.mjs
// Guards the one failure that loses photos (a group with no valid keeper being
// emptied) plus the view switch and the space-saved arithmetic.
import { strict as assert } from 'node:assert';
import {
    KEEP_ALL, STRICTNESS, defaultView, initialKeepers, pathsToTrash,
    reclaimBytes, afterDelete, formatBytes, scanStillCurrent, unprotectedCount,
} from './duplicateSelection.js';

const groups = [['/a/1.jpg', '/a/1 copy.jpg', '/b/1.jpg'], ['/a/2.jpg', '/c/2.jpg']];
const files = {
    '/a/1.jpg': { bytes: 4_000_000 }, '/a/1 copy.jpg': { bytes: 1_000_000 }, '/b/1.jpg': { bytes: 2_000_000 },
    '/a/2.jpg': { bytes: 500 }, '/c/2.jpg': { bytes: 700 },
};

assert.deepEqual(STRICTNESS, { exact: 0.98, near: 0.95, similar: 0.85 });

// Default view: few groups or a "similar" scan → one by one; otherwise the list.
assert.equal(defaultView(12, 'near'), 'single');
assert.equal(defaultView(13, 'near'), 'list');
assert.equal(defaultView(500, 'similar'), 'single');
assert.equal(defaultView(13, 'exact'), 'list');

// The backend puts the best copy first, so that is the starting keeper.
const keeper = initialKeepers(groups);
assert.deepEqual(keeper, ['/a/1.jpg', '/a/2.jpg']);

// The keeper is never trashed; everything else in the group is.
assert.deepEqual(pathsToTrash(groups, keeper), ['/a/1 copy.jpg', '/b/1.jpg', '/c/2.jpg']);
assert.deepEqual(pathsToTrash(groups, ['/b/1.jpg', '/a/2.jpg']), ['/a/1.jpg', '/a/1 copy.jpg', '/c/2.jpg']);

// "Keep all" excludes the whole group.
assert.deepEqual(pathsToTrash(groups, [KEEP_ALL, '/a/2.jpg']), ['/c/2.jpg']);

// A missing or stale keeper must trash nothing from that group, never everything.
assert.deepEqual(pathsToTrash(groups, [undefined, '/a/2.jpg']), ['/c/2.jpg']);
assert.deepEqual(pathsToTrash(groups, ['/gone.jpg', '/a/2.jpg']), ['/c/2.jpg']);
assert.deepEqual(pathsToTrash(groups, []), []);

// Bytes: unknown files count as 0 instead of NaN.
assert.equal(reclaimBytes(['/a/1 copy.jpg', '/b/1.jpg'], files), 3_000_000);
assert.equal(reclaimBytes(['/nope.jpg'], files), 0);

// After a partial delete: deleted files leave, a group left with one file goes,
// failed files stay, and the user's keeper choice survives the reindex.
const picked = ['/b/1.jpg', '/a/2.jpg'];
const next = afterDelete(groups, picked, ['/a/1 copy.jpg', '/c/2.jpg']);
assert.deepEqual(next.groups, [['/a/1.jpg', '/b/1.jpg']]);
assert.deepEqual(next.keeper, ['/b/1.jpg']);
// A "keep all" group is untouched and keeps its choice.
const kept = afterDelete(groups, [KEEP_ALL, '/a/2.jpg'], ['/c/2.jpg']);
assert.deepEqual(kept, { groups: [groups[0]], keeper: [KEEP_ALL] });

// A held result is only reviewable while the backend still holds that scan:
// any later job (the scheduler, the Claude agent) resets it and the thumbnails 403.
const live = { job_type: 'duplicates', duplicate_groups: groups };
assert.equal(scanStillCurrent(live, { groups }), true);
assert.equal(scanStillCurrent({ job_type: 'sorting', duplicate_groups: [] }, { groups }), false);
assert.equal(scanStillCurrent({ job_type: 'duplicates', duplicate_groups: [['/x/1.jpg', '/y/1.jpg']] }, { groups }), false,
    'a newer scan of another folder must not pass for ours');
assert.equal(scanStillCurrent(undefined, { groups }), false);

// Compare mode: library files are protected and never trashed, whatever the keeper.
const lib = new Set(['/a/1.jpg', '/a/2.jpg']);
assert.deepEqual(pathsToTrash(groups, ['/b/1.jpg', '/c/2.jpg'], lib), ['/a/1 copy.jpg']);
assert.deepEqual(pathsToTrash(groups, keeper, new Set(groups.flat())), []);
// A group left holding only library files has nothing to review and goes.
const lg = [['/lib/a.jpg', '/lib/a2.jpg', '/card/a.jpg']];
const libSet = new Set(['/lib/a.jpg', '/lib/a2.jpg']);
assert.deepEqual(afterDelete(lg, ['/lib/a.jpg'], ['/card/a.jpg'], libSet).groups, []);
assert.deepEqual(afterDelete(lg, ['/lib/a.jpg'], [], libSet).groups, lg);
// Source photos found in the library: counted from the scan, so trashing them
// from the card first doesn't turn "2 already in your library" into 0.
assert.equal(unprotectedCount(lg, libSet), 1);
assert.equal(unprotectedCount([], libSet), 0);

assert.equal(formatBytes(0), '0 B');
assert.equal(formatBytes(310 * 1024), '310 KB');
assert.equal(formatBytes(4.1 * 1024 * 1024), '4.1 MB');
assert.equal(formatBytes(1.2 * 1024 ** 3), '1.2 GB');

console.log('duplicateSelection: all assertions passed');
