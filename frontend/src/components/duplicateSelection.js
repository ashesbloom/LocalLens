// Keep/trash arithmetic for the duplicate review screen. Pure so it can be
// tested with plain node: this is the code that decides which photos get deleted.

// similarity_threshold sent to /api/find-duplicates (64-bit pHash: ≤1, ≤3, ≤9 bits).
export const STRICTNESS = { exact: 0.98, near: 0.95, similar: 0.85 };

export const KEEP_ALL = 'all';

const ONE_BY_ONE_MAX_GROUPS = 12;

// Few groups, or a loose "similar" scan that needs a careful look, open one by one.
export const defaultView = (groupCount, strictness) =>
    groupCount <= ONE_BY_ONE_MAX_GROUPS || strictness === 'similar' ? 'single' : 'list';

// The backend already orders each group best-copy-first.
export const initialKeepers = (groups) => groups.map((g) => g[0]);

// A group trashes nothing unless its keeper is a real member: a missing or stale
// keeper must never turn into "delete every copy". Protected paths (the library,
// in compare mode) are never returned, whoever the keeper is.
export const pathsToTrash = (groups, keeper, protectedPaths = new Set()) =>
    groups.flatMap((g, i) => {
        const k = keeper[i];
        if (k === KEEP_ALL || !g.includes(k)) return [];
        return g.filter((p) => p !== k && !protectedPaths.has(p));
    });

// Grouped files that are not protected: in compare mode, the source photos
// already in the library.
export const unprotectedCount = (groups, protectedPaths) =>
    groups.flat().filter((p) => !protectedPaths.has(p)).length;

// What "Import" hands to Standard Sort. Always an explicit list, never "the whole
// folder": a cross-drive Move of a whole card deletes the videos and sidecars it
// never sorts. `skipped` counts from the scan, so matches already trashed here
// still count as skipped.
export const importHandoff = (result, protectedPaths) => ({
    files: result.newFiles || [],
    skipped: unprotectedCount(result.groups || [], protectedPaths),
});

export const reclaimBytes = (paths, files) =>
    paths.reduce((sum, p) => sum + (files[p]?.bytes ?? 0), 0);

// Drop deleted files, drop groups with nothing left to compare (or only protected
// library copies left), keep choices.
export const afterDelete = (groups, keeper, deletedPaths, protectedPaths = new Set()) => {
    const gone = new Set(deletedPaths);
    const next = { groups: [], keeper: [] };
    groups.forEach((g, i) => {
        const left = g.filter((p) => !gone.has(p));
        if (left.length < 2 || left.every((p) => protectedPaths.has(p))) return;
        next.groups.push(left);
        next.keeper.push(keeper[i] === KEEP_ALL || left.includes(keeper[i]) ? keeper[i] : left[0]);
    });
    return next;
};

// The backend keeps one scan result and any later job resets it: the scheduler or
// the Claude agent can do that behind the app's back. A held result is only safe to
// review while every one of its photos is still in the backend's current scan.
export const scanStillCurrent = (status, result) => {
    if (status?.job_type !== 'duplicates') return false;
    const live = new Set((status.duplicate_groups || []).flat());
    return (result?.groups || []).flat().every((p) => live.has(p));
};

export const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const v = bytes / 1024 ** i;
    return `${i >= 2 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
};
