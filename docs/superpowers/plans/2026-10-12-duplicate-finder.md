# Duplicate Finder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A free "Duplicates" mode in the LocalLens desktop app: scan a folder, review duplicate groups with thumbnails in a list view or a one-by-one view, keep the best copy, and send the rest to Trash.

**Architecture:** The backend already runs the pHash scan as a background job. This plan adds a smart keeper ordering, per-file details and a scan-scoped thumbnail endpoint. The frontend adds a 4th mode tab that reuses the existing source picker, SSE progress, abort and log plumbing. A full-screen review overlay renders one shared selection state through two views. All keep/trash arithmetic lives in a pure, node-tested helper module.

**Tech Stack:** FastAPI + Pillow + numpy (backend, `backend/venv`), React 18 + Vite + Tauri 2 (frontend), react-feather icons, plain `assert` / `node:assert` self-checks (no test framework).

**Spec:** `docs/superpowers/specs/2026-10-12-duplicate-finder-design.md`

## Global Constraints

- The duplicate finder is **free** in the app. Add no license checks, and don't change the agent's Pro labelling.
- `duplicate_groups` keeps its shape `[[keeper, dupe, ...], ...]`, and the **first entry is the keeper**. The agent's `delete_duplicates` relies on that.
- Strictness → `similarity_threshold`: `exact: 0.98`, `near: 0.95` (default), `similar: 0.85`.
- Default review view: `single` (one-by-one) if `groupCount <= 12 || strictness === 'similar'`, else `list`. The user can toggle at any time without losing selections.
- Keeper ranking order: most pixels → largest bytes → filename not a copy (` copy`, ` copy N`, ` (N)`) → oldest mtime → path (deterministic).
- `/api/thumbnail` serves **only** paths in the current `duplicate_groups` (403 otherwise), returns 404 when the file can't be decoded, sends `image/jpeg`, ≤320 px, `Cache-Control: private, max-age=3600`.
- Deletion goes through the existing `/api/delete-files`: dry-run first (it says whether Trash is available and how many MB), then the real call after the in-app confirmation.
- Theme `.theme-duplicates`: primary `#8b5cf6`, hover `#7c3aed`, rgb `139, 92, 246`, secondary `#c084fc`.
- Match the surrounding code style: 4-space JSX indent in `App.jsx`, explanatory "why" comments in backend code, `ponytail:` comments on deliberate shortcuts.

## Review Focus

1. **A group whose keeper is missing or stale** (undefined, or a path no longer in the group) must trash *nothing* from that group, never every file in it. Owner: Task 3 test.
2. **Paths with spaces, `#`, `&`, accents or emoji** must round-trip through `encodeURIComponent` → FastAPI query decoding → exact allow-list match. Owner: Task 2 in-process test.
3. **A partial delete failure** (file already gone, permission denied): deleted files leave the review, failed files stay with their error, a group left with one file disappears, and the user's keeper choices on the surviving groups are kept. Owner: Task 3 `afterDelete` test.
4. **A stale result after another job:** running a sort clears the backend scan result, so the app must drop its review result when any job starts, not show a "Review duplicates" button whose thumbnails all 403. Owner: Task 5, manual check in the verification step.
5. **Keyboard shortcuts while the confirmation dialog is open,** or in list view: `1–9`/`K`/arrows must not change selections behind the dialog. Owner: Task 5, manual check in the verification step.

---

### Task 0: Isolated workspace

The main checkout holds uncommitted community-notification work in `App.jsx`, `main.py`, `test_api_smoke.py` and `CHANGELOG.md`. Do **not** build in it, or the commits will sweep that work in.

- [ ] **Step 1:** Use superpowers:using-git-worktrees to create a worktree on a new branch `feat/duplicate-finder` from the current `HEAD` (`7720c4a`, which is `main` plus the spec commit). Every path below is relative to that worktree.
- [ ] **Step 2:** Point the worktree at the existing backend venv rather than building a new one: `ln -s <main-checkout>/backend/venv backend/venv` (venv is gitignored). Then run `cd frontend && npm install`.
- [ ] **Step 3:** Baseline: `cd backend && venv/bin/python test_phash.py`. Expected: `test_phash: all assertions passed`.

---

### Task 1: Backend: smart keeper ordering and per-file details

**Files:**
- Modify: `backend/main.py`: `_phash` (~L538), new `_phash_of`, `_COPY_NAME`, `_keeper_rank` beside it; `current_job_state` (~L306-315), `_DUP_RESULT_RESET` (~L319), `run_find_duplicates_task` (~L783-895)
- Test: `backend/test_phash.py`

**Interfaces:**
- Produces: `_phash_of(im) -> np.uint64` (hash of an already-decoded upright PIL image); `_phash(path)` unchanged; `_keeper_rank(path: str, info: dict) -> tuple` (sort key, smallest = best keeper); job-state field `duplicate_files: {path: {"width": int, "height": int, "bytes": int, "mtime": float}}`, covering exactly the grouped paths.

- [ ] **Step 1: Write the failing test.** In `backend/test_phash.py`, change the import line to:

```python
from main import _phash, _group_by_hash, _keeper_rank
```

and append inside `demo()`, just before `print("test_phash: all assertions passed")` (outside the `with` block):

```python
    # --- keeper ranking: the best copy of a group sorts first ---
    def info(w, h, size, mtime):
        return {"width": w, "height": h, "bytes": size, "mtime": mtime}

    def best(*candidates):
        return min(candidates, key=lambda c: _keeper_rank(*c))[0]

    # Resolution beats file size and age: a big re-compressed original still wins
    # over a small export that happens to be heavier and older.
    assert best(("/p/export.jpg", info(1200, 900, 9_000_000, 100)),
                ("/p/original.jpg", info(4000, 3000, 3_000_000, 200))) == "/p/original.jpg"
    # Same pixels: the larger file is the less compressed one.
    assert best(("/p/a.jpg", info(100, 100, 500, 100)),
                ("/p/b.jpg", info(100, 100, 900, 200))) == "/p/b.jpg"
    # Same pixels and bytes: a Finder/Explorer copy name loses even when older.
    assert best(("/p/IMG_1 copy.jpg", info(100, 100, 500, 1)),
                ("/p/IMG_1 (2).jpg", info(100, 100, 500, 1)),
                ("/p/IMG_1 copy 3.JPG", info(100, 100, 500, 1)),
                ("/p/IMG_1.jpg", info(100, 100, 500, 300))) == "/p/IMG_1.jpg"
    # "copy" inside a real name is not a copy marker.
    assert best(("/p/copycat.jpg", info(100, 100, 500, 1)),
                ("/p/zebra.jpg", info(100, 100, 500, 2))) == "/p/copycat.jpg"
    # Everything else equal: the older file is the original.
    assert best(("/p/x.jpg", info(100, 100, 500, 200)),
                ("/p/y.jpg", info(100, 100, 500, 100))) == "/p/y.jpg"
```

- [ ] **Step 2: Run it and confirm it fails.**
Run: `cd backend && venv/bin/python test_phash.py`
Expected: `ImportError: cannot import name '_keeper_rank'`

- [ ] **Step 3: Implement.** In `backend/main.py`, add `import re` beside `import json` (~L25) if it isn't there. Replace the body of `_phash` (keep its docstring) and add the helpers right after it:

```python
def _phash(path: str):
    """<existing docstring unchanged>"""
    im = load_upright(path)
    return None if im is None else _phash_of(im)


def _phash_of(im):
    """pHash of an image already decoded upright. Split out so the duplicate scan
    can hash and read the pixel size from a single decode."""
    px = np.asarray(
        im.convert("L").resize((_PH_N, _PH_N), PILImage.Resampling.LANCZOS),
        dtype=np.float64,
    )
    low = (_DCT @ px @ _DCT.T)[:_PH_HASH_SIZE, :_PH_HASH_SIZE]
    return np.packbits(low > np.median(low)).view(">u8")[0]


# The names Finder ("IMG_1 copy", "IMG_1 copy 2") and Explorer ("IMG_1 (1)") give
# a duplicated file. Anchored to the end of the stem so "copycat.jpg" is not one.
_COPY_NAME = re.compile(r"( copy( \d+)?| \(\d+\))$", re.IGNORECASE)


def _keeper_rank(path: str, info: Dict):
    """
    Sort key for a duplicate group: the copy worth keeping sorts first.

    Most pixels, then most bytes (same resolution, less compression), then a name
    that is not a copy, then the older file — the original usually came first.
    The path is last only to make ties deterministic.
    """
    stem = os.path.splitext(os.path.basename(path))[0]
    return (
        -(info["width"] * info["height"]),
        -info["bytes"],
        bool(_COPY_NAME.search(stem)),
        info["mtime"],
        path,
    )
```

Add the job-state field in both places:

```python
    "duplicate_files": {},      # {path: {width, height, bytes, mtime}} for grouped files only
```

(in `current_job_state` after `"duplicate_groups"`), and `"duplicate_files": {},` in `_DUP_RESULT_RESET`.

In `run_find_duplicates_task.scan()`, replace the hashing `try` block and the return:

```python
        file_hashes = []
        file_info = {}
        skipped = 0
        ...
            try:
                im = load_upright(fp)
                h = None if im is None else _phash_of(im)
                if h is not None:
                    st = os.stat(fp)
                    file_info[fp] = {"width": im.width, "height": im.height,
                                     "bytes": st.st_size, "mtime": st.st_mtime}
            except Exception:
                h = None  # Corrupt or unreadable image
            ...
        groups = [
            sorted(g, key=lambda p: _keeper_rank(p, file_info[p]))
            for g in _group_by_hash(file_hashes, max_distance)
        ]
        # Only grouped files go out: this rides on every /api/job-status poll.
        grouped_info = {p: file_info[p] for g in groups for p in g}
        return groups, grouped_info, len(file_hashes), skipped
```

Update the caller and the results block (both must be set before the status flips to "complete"):

```python
        groups, grouped_info, scanned, skipped = await asyncio.to_thread(scan)
        ...
        current_job_state.update({
            "duplicate_groups": groups,
            "duplicate_files": grouped_info,
            "total_scanned": scanned,
            "total_duplicates": total_dupes,
            "skipped": skipped,
        })
```

Also set `"duplicate_files": {}` in the `if not image_files:` early-return `update`.

- [ ] **Step 4: Run it and confirm it passes.**
Run: `cd backend && venv/bin/python test_phash.py`
Expected: `test_phash: all assertions passed`

- [ ] **Step 5: Smoke assertion.** In `backend/test_api_smoke.py` `check_find_duplicates`, before the `return`:

```python
    files = result.get("duplicate_files", {})
    assert set(files) == set(group), f"duplicate_files does not cover the group: {sorted(files)}"
    assert all({"width", "height", "bytes", "mtime"} <= set(v) for v in files.values()), files
    # img_2.jpg and img_2_copy.jpg tie on pixels and bytes; the copy was written later,
    # and even on a coarse-mtime filesystem the path tiebreak still puts img_2 first.
    assert group[0] == str(original), f"keeper should be the original, got {group[0]}"
```

Run: `cd backend && venv/bin/python test_api_smoke.py`
Expected: check `[5]` PASS; overall exit 0.

- [ ] **Step 6: Commit.**

```bash
git add backend/main.py backend/test_phash.py backend/test_api_smoke.py
git commit -m "feat(duplicates): keep the best copy first and report per-file details"
```

---

### Task 2: Backend: scan-scoped thumbnail endpoint

**Files:**
- Modify: `backend/main.py`: add `_thumbnail_jpeg` + `GET /api/thumbnail` right after `find_duplicates_endpoint` (~L1350); add `import io` near the other imports and `Response` to the fastapi import line (~L35)
- Test: `backend/test_phash.py` (in-process), `backend/test_api_smoke.py` (HTTP)

**Interfaces:**
- Consumes: `current_job_state["duplicate_groups"]` (Task 1).
- Produces: `GET /api/thumbnail?path=<url-encoded absolute path>` → 200 `image/jpeg` | 403 | 404. Async handler `thumbnail_endpoint(path: str)`.

- [ ] **Step 1: Write the failing test.** Append to `demo()` in `backend/test_phash.py` (inside the `with tempfile.TemporaryDirectory() as d:` block, after the EXIF section):

```python
        # --- /api/thumbnail: serves scan results only, odd filenames included ---
        import asyncio
        import io
        import main
        from fastapi import HTTPException

        def thumb(path):
            try:
                r = asyncio.run(main.thumbnail_endpoint(path=path))
                return r.status_code, r.media_type, Image.open(io.BytesIO(r.body)).size
            except HTTPException as e:
                return e.status_code, None, None

        odd = os.path.join(d, "Goa trip #1 & café 😀.jpg")
        _photo(seed=3, size=(1600, 1200)).save(odd, quality=90)
        main.current_job_state["duplicate_groups"] = [[odd, original, broken]]
        status, mime, size = thumb(odd)
        assert status == 200 and mime == "image/jpeg", (status, mime)
        assert max(size) <= 320, f"thumbnail not downscaled: {size}"
        assert thumb(unrelated)[0] == 403, "a path outside the scan must be refused"
        assert thumb(broken)[0] == 404, "an undecodable grouped file must be a 404"
        main.current_job_state["duplicate_groups"] = []
        assert thumb(odd)[0] == 403, "a cleared scan must not keep serving files"
```

- [ ] **Step 2: Run it and confirm it fails.**
Run: `cd backend && venv/bin/python test_phash.py`
Expected: `AttributeError: module 'main' has no attribute 'thumbnail_endpoint'`

- [ ] **Step 3: Implement** in `backend/main.py`:

```python
def _thumbnail_jpeg(path: str):
    """≤320px upright JPEG bytes, or None when nothing can decode the file.
    ponytail: a full decode per thumbnail; switch JPEGs to Image.draft() if a
    long review list ever feels slow to fill in."""
    im = load_upright(path)
    if im is None:
        return None
    im.thumbnail((320, 320))
    buf = io.BytesIO()
    im.convert("RGB").save(buf, "JPEG", quality=80)
    return buf.getvalue()


@app.get("/api/thumbnail")
async def thumbnail_endpoint(path: str):
    """
    Small preview of one photo from the current duplicate scan, for the in-app
    review screen.

    Only paths in the current duplicate_groups are served. Anything on the machine
    can point an <img> at this localhost port, and an unrestricted version would
    hand any webpage the user's photos. Starting any other job clears the groups
    (_DUP_RESULT_RESET), which closes the window again.
    """
    if not any(path in g for g in current_job_state.get("duplicate_groups") or []):
        raise HTTPException(status_code=403, detail="Not part of the current duplicate scan.")
    data = await asyncio.to_thread(_thumbnail_jpeg, path)
    if data is None:
        raise HTTPException(status_code=404, detail="This photo could not be decoded.")
    return Response(content=data, media_type="image/jpeg",
                    headers={"Cache-Control": "private, max-age=3600"})
```

- [ ] **Step 4: Run it and confirm it passes.**
Run: `cd backend && venv/bin/python test_phash.py`
Expected: `test_phash: all assertions passed`

- [ ] **Step 5: HTTP smoke check.** In `backend/test_api_smoke.py`, add `import urllib.parse` to the imports and this helper + check after `check_find_duplicates`:

```python
def get_status(base_url, path):
    """Status and content type of a GET, for endpoints that do not return JSON."""
    try:
        with urllib.request.urlopen(base_url + path, timeout=30) as resp:
            return resp.status, resp.headers.get("Content-Type")
    except urllib.error.HTTPError as e:
        return e.code, None


def check_thumbnail(base_url, source, group):
    url = lambda p: "/api/thumbnail?path=" + urllib.parse.quote(str(p))
    status, ctype = get_status(base_url, url(group[0]))
    assert (status, ctype) == (200, "image/jpeg"), f"grouped path: {status} {ctype}"
    outsider = next(p for p in source.rglob("*.jpg") if str(p) not in group)
    status, _ = get_status(base_url, url(outsider))
    assert status == 403, f"path outside the scan returned {status}, expected 403"
    return "200 for a grouped photo, 403 outside the scan"
```

and in `main`, right after the `step("[5] ...")` line (it must run before check 7, whose sort clears the scan):

```python
        def _check5b():
            if "group" not in dup_group:
                raise AssertionError("skipped — check 5 did not produce a duplicate group")
            return check_thumbnail(base_url, source, dup_group["group"])
        step("[5b] GET /api/thumbnail", _check5b)
```

Run: `cd backend && venv/bin/python test_api_smoke.py`
Expected: `[5b]` PASS; exit 0.

- [ ] **Step 6: Commit.**

```bash
git add backend/main.py backend/test_phash.py backend/test_api_smoke.py
git commit -m "feat(duplicates): serve thumbnails for photos in the current scan only"
```

---

### Task 3: Frontend: pure review helpers

**Files:**
- Create: `frontend/src/components/duplicateReview.js`
- Test: `frontend/src/components/duplicateReview.test.mjs`

**Interfaces:**
- Produces (all named exports):
  - `STRICTNESS: { exact: 0.98, near: 0.95, similar: 0.85 }`
  - `KEEP_ALL = 'all'`
  - `defaultView(groupCount: number, strictness: string) -> 'single' | 'list'`
  - `initialKeepers(groups: string[][]) -> (string)[]`: the first path of each group
  - `pathsToTrash(groups: string[][], keeper: (string|'all')[]) -> string[]`
  - `reclaimBytes(paths: string[], files: {[path]: {bytes}}) -> number`
  - `afterDelete(groups, keeper, deletedPaths: string[]) -> { groups, keeper }`
  - `formatBytes(bytes: number) -> string` ("0 B", "310 KB", "4.1 MB", "1.2 GB")

- [ ] **Step 1: Write the failing test** `frontend/src/components/duplicateReview.test.mjs`:

```js
// Run with: node src/components/duplicateReview.test.mjs
// Guards the one failure that loses photos (a group with no valid keeper being
// emptied) plus the view switch and the space-saved arithmetic.
import { strict as assert } from 'node:assert';
import {
    KEEP_ALL, STRICTNESS, defaultView, initialKeepers, pathsToTrash,
    reclaimBytes, afterDelete, formatBytes,
} from './duplicateReview.js';

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

assert.equal(formatBytes(0), '0 B');
assert.equal(formatBytes(310 * 1024), '310 KB');
assert.equal(formatBytes(4.1 * 1024 * 1024), '4.1 MB');
assert.equal(formatBytes(1.2 * 1024 ** 3), '1.2 GB');

console.log('duplicateReview: all assertions passed');
```

- [ ] **Step 2: Run it and confirm it fails.**
Run: `cd frontend && node src/components/duplicateReview.test.mjs`
Expected: `ERR_MODULE_NOT_FOUND` for `duplicateReview.js`

- [ ] **Step 3: Implement** `frontend/src/components/duplicateReview.js`:

```js
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
// keeper must never turn into "delete every copy".
export const pathsToTrash = (groups, keeper) =>
    groups.flatMap((g, i) => {
        const k = keeper[i];
        if (k === KEEP_ALL || !g.includes(k)) return [];
        return g.filter((p) => p !== k);
    });

export const reclaimBytes = (paths, files) =>
    paths.reduce((sum, p) => sum + (files[p]?.bytes ?? 0), 0);

// Drop deleted files, drop groups with nothing left to compare, keep choices.
export const afterDelete = (groups, keeper, deletedPaths) => {
    const gone = new Set(deletedPaths);
    const next = { groups: [], keeper: [] };
    groups.forEach((g, i) => {
        const left = g.filter((p) => !gone.has(p));
        if (left.length < 2) return;
        next.groups.push(left);
        next.keeper.push(keeper[i] === KEEP_ALL || left.includes(keeper[i]) ? keeper[i] : left[0]);
    });
    return next;
};

export const formatBytes = (bytes) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    const v = bytes / 1024 ** i;
    return `${i >= 2 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
};
```

- [ ] **Step 4: Run it and confirm it passes.**
Run: `cd frontend && node src/components/duplicateReview.test.mjs`
Expected: `duplicateReview: all assertions passed`

- [ ] **Step 5: Commit.**

```bash
git add frontend/src/components/duplicateReview.js frontend/src/components/duplicateReview.test.mjs
git commit -m "feat(duplicates): pure keep/trash helpers for the review screen"
```

---

### Task 4: Frontend: Duplicates mode tab, theme, config, and run flow

**Files:**
- Modify: `frontend/src/components/SortingModeSelector.jsx`
- Modify: `frontend/src/App.css` (after `.theme-find`, ~L58)
- Create: `frontend/src/components/DuplicateConfig.jsx`
- Create: `frontend/src/components/DuplicateReview.css` (the config styles go in now; Task 5 adds the review styles)
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `STRICTNESS` (Task 3); `POST /api/find-duplicates` → `{status: 'started' | 'busy', message}`.
- Produces: App state `dupStrictness` (`'exact'|'near'|'similar'`), `dupResult` (`null | {groups, files, strictness}`), `setDupResult`; mode key `'duplicates'`.

- [ ] **Step 1: Tab.** In `SortingModeSelector.jsx`, change the import to `import { Sliders, Search, Trello, UserPlus, Copy } from 'react-feather';` and append to `modes`:

```jsx
    {
      key: 'duplicates',
      title: 'Duplicates',
      description: 'Find copies of the same photo and clear out the extras.',
      icon: <Copy size={18} />,
    },
```

- [ ] **Step 2: Theme.** In `App.css`, after the `.theme-find { ... }` block:

```css
/* Theme: Duplicates (Violet). No danger-colour overrides needed, unlike red. */
.theme-duplicates {
  --color-primary: #8b5cf6;
  --color-primary-hover: #7c3aed;
  --color-primary-rgb: 139, 92, 246;
  --color-secondary: #c084fc;
  --color-gradient: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
  --color-shadow-primary: rgba(139, 92, 246, 0.4);
}
```

- [ ] **Step 3: Config panel** `frontend/src/components/DuplicateConfig.jsx` (reuses the `sorting-card` styles from `SortingOptions.css`, which is always bundled):

```jsx
import React from 'react';
import './DuplicateReview.css';

const OPTIONS = [
    { id: 'exact', icon: '🎯', title: 'Exact copies', description: 'The same photo saved twice, renamed or rotated.' },
    { id: 'near', icon: '🔍', title: 'Near-identical', description: 'Also catches resized and re-exported copies. Recommended.' },
    { id: 'similar', icon: '📸', title: 'Similar shots', description: 'Burst shots and near-misses. Worth reviewing one by one.' },
];

const DuplicateConfig = ({ strictness, setStrictness, isProcessing }) => (
    <div className="sorting-options-section">
        <div className="form-group">
            <label>Match strictness</label>
            <p className="description">How alike two photos must be to count as duplicates. Nothing is removed until you review the results.</p>
        </div>
        <div className="sorting-card-group dup-strictness">
            {OPTIONS.map((o) => (
                <label key={o.id} className={`sorting-card ${strictness === o.id ? 'selected' : ''} ${isProcessing ? 'disabled' : ''}`} title={o.title}>
                    <input
                        type="radio"
                        name="dupStrictness"
                        value={o.id}
                        checked={strictness === o.id}
                        onChange={(e) => setStrictness(e.target.value)}
                        disabled={isProcessing}
                    />
                    <div className="sorting-card-content">
                        <div className="sorting-card-icon">{o.icon}</div>
                        <div className="sorting-card-text">
                            <div className="sorting-card-title">{o.title}</div>
                            <p className="sorting-card-description">{o.description}</p>
                        </div>
                    </div>
                </label>
            ))}
        </div>
    </div>
);

export default DuplicateConfig;
```

`frontend/src/components/DuplicateReview.css` (start of file):

```css
/* --- Duplicates config --- */
.dup-strictness {
  grid-template-columns: repeat(3, 1fr);
  min-height: 0;
}

@media (max-width: 760px) {
  .dup-strictness { grid-template-columns: 1fr; }
}
```

- [ ] **Step 4: Wire it into `App.jsx`.**
  - Imports (next to `FindGroupConfig`): `import DuplicateConfig from './components/DuplicateConfig';` and `import { STRICTNESS } from './components/duplicateReview';`
  - State, after the `findConfig` state (~L530):

```jsx
    // --- State for Duplicates ---
    const [dupStrictness, setDupStrictness] = useState('near');
    // Last scan's result, held here so the review can be reopened after closing it.
    const [dupResult, setDupResult] = useState(null);
```

  - `themeClass` map (~L1669): add `duplicates: 'theme-duplicates',`.
  - `getOperationName` (~L1676): add `case 'duplicates': return 'Find Duplicates';`.
  - `handleStartSorting` (~L1384): replace the guard with:

```jsx
        const needsDestination = operationMode !== 'duplicates';
        if (!sourceFolder || (needsDestination && !destinationFolder)) {
            await message(
                needsDestination ? 'Please select both source and destination folders.' : 'Please select a source folder to scan.',
                { title: 'Missing Information', kind: 'warning' }
            );
            return;
        }
```

  and after `setIsProcessing(true);` add `setDupResult(null); // any job clears the backend's scan result, so drop ours too`.
  - Add a branch after the `find` branch:

```jsx
        } else if (operationMode === 'duplicates') {
            endpoint = '/api/find-duplicates';
            payload = {
                source_folder: sourceFolder,
                ignore_list: ignoredSubfolders,
                similarity_threshold: STRICTNESS[dupStrictness],
            };
        }
```

  - Replace the `apiCall(endpoint, …).then(...)` with busy handling, because `find-duplicates` reports a running job as a 200 rather than an error:

```jsx
            .then((r) => {
                if (r?.status === 'busy') {
                    logToConsole(r.message, 'warning');
                    setIsProcessing(false);
                    if (eventSourceRef.current) eventSourceRef.current.close();
                    eventSourceRef.current = null;
                    return;
                }
                logToConsole("Job accepted by backend. Awaiting process start...");
            })
```

  - In the SSE handler's `completionMsg` block: `completionMsg = isEnrolling ? "Enrollment Complete" : operationMode === 'duplicates' ? "Scan Complete" : "Organization Complete";`
  - In the same `setTimeout`, after the Find & Group block:

```jsx
                    if (operationMode === 'duplicates' && data.status === 'complete' && !isEnrolling) {
                        apiCall('/api/job-status')
                            .then((s) => setDupResult({
                                groups: s.duplicate_groups || [],
                                files: s.duplicate_files || {},
                                strictness: dupStrictness,
                            }))
                            .catch(() => {});
                    }
```

  - JSX: wrap the Destination `PathSelector` in `{operationMode !== 'duplicates' && ( … )}`. Change `{operationMode !== 'find' && (<OperationModeToggle …/>)}` and `{operationMode !== 'find' && (<HierarchyToggle …/>)}` to `{operationMode !== 'find' && operationMode !== 'duplicates' && ( … )}`. Add to `mode-content-wrapper`:

```jsx
                    {operationMode === 'duplicates' && (
                        <div className="mode-content">
                            <DuplicateConfig
                                strictness={dupStrictness}
                                setStrictness={setDupStrictness}
                                isProcessing={isProcessing || isEnrolling}
                            />
                        </div>
                    )}
```

  - Footer: wrap the `Open "{…}"` button in `{operationMode !== 'duplicates' && ( … )}`.

- [ ] **Step 5: Build check.**
Run: `cd frontend && npm run build`
Expected: Vite build succeeds with no new errors.

- [ ] **Step 6: Manual check.** Run `cd frontend && npm run tauri dev`, click **Duplicates**:
  - The theme turns violet; destination, Copy/Move and hierarchy are hidden; the subfolder ignore list shows once a source is picked.
  - "Find Duplicates" with no source → warning dialog.
  - Run on a folder → the progress bar fills, the log shows "Hashing photos…", the final label reads "Scan Complete". Abort mid-scan → "Operation Aborted".
  - Switch back to Standard → destination, Copy/Move and hierarchy are back.

- [ ] **Step 7: Commit.**

```bash
git add frontend/src/components/SortingModeSelector.jsx frontend/src/App.css frontend/src/components/DuplicateConfig.jsx frontend/src/components/DuplicateReview.css frontend/src/App.jsx
git commit -m "feat(duplicates): add the Duplicates mode tab and scan flow"
```

---

### Task 5: Frontend: review overlay (list and one-by-one) and clean-up

**Files:**
- Create: `frontend/src/components/DuplicateReview.jsx`
- Modify: `frontend/src/components/DuplicateReview.css` (append)
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: Task 3 helpers; `dupResult` (Task 4); `GET /api/thumbnail` (Task 2); `POST /api/delete-files` → `{use_trash, deleted: string[], failed: [{path, error}], total_freed_mb, message}`; `ConfirmationModal` props `{isVisible, title, onConfirm, onCancel, confirmText, cancelText, children}` (overlay z-index 3000).
- Produces: `<DuplicateReview isOpen result apiBase apiCall onClose onCleaned />`. `onCleaned(response, remainingGroupCount)`.

- [ ] **Step 1: Component** `frontend/src/components/DuplicateReview.jsx`:

```jsx
import React, { useEffect, useMemo, useState } from 'react';
import { List, Square, ChevronLeft, ChevronRight, Star, X } from 'react-feather';
import ConfirmationModal from './ConfirmationModal';
import {
    KEEP_ALL, defaultView, initialKeepers, pathsToTrash, reclaimBytes, afterDelete, formatBytes,
} from './duplicateReview';
import './DuplicateReview.css';

const baseName = (p) => p.split(/[\\/]/).pop();
const parentName = (p) => p.split(/[\\/]/).slice(-2, -1)[0] || p;

const Tile = ({ path, info, keep, error, large, apiBase, onPick }) => {
    const [broken, setBroken] = useState(false);
    return (
        <button
            type="button"
            className={`dup-tile ${keep ? 'keep' : 'trash'} ${large ? 'large' : ''} ${error ? 'failed' : ''}`}
            onClick={onPick}
            title={error ? `${path}\nCould not remove: ${error}` : path}
        >
            <span className="dup-badge">{keep ? <><Star size={12} /> Keep</> : <><X size={12} /> Trash</>}</span>
            {broken ? (
                <div className="dup-thumb dup-thumb-missing">No preview</div>
            ) : (
                <img
                    className="dup-thumb"
                    loading="lazy"
                    alt={baseName(path)}
                    src={`${apiBase}/api/thumbnail?path=${encodeURIComponent(path)}`}
                    onError={() => setBroken(true)}
                />
            )}
            <span className="dup-meta">{info ? `${info.width}×${info.height} · ${formatBytes(info.bytes)}` : baseName(path)}</span>
            <span className="dup-meta dup-folder">{parentName(path)}</span>
        </button>
    );
};

const Group = ({ group, label, keeper, files, failed, large, apiBase, setKeeper }) => {
    const keepAll = keeper === KEEP_ALL;
    const save = reclaimBytes(pathsToTrash([group], [keeper]), files);
    return (
        <section className="dup-group">
            <header className="dup-group-header">
                <span>{label} · {group.length} photos{save ? ` · save ${formatBytes(save)}` : ''}</span>
                <button
                    type="button"
                    className={`dup-keep-all ${keepAll ? 'active' : ''}`}
                    onClick={() => setKeeper(keepAll ? group[0] : KEEP_ALL)}
                >
                    {keepAll ? 'Keeping all' : 'Keep all'}
                </button>
            </header>
            <div className="dup-tiles">
                {group.map((p) => (
                    <Tile
                        key={p}
                        path={p}
                        info={files[p]}
                        keep={keepAll || keeper === p}
                        error={failed[p]}
                        large={large}
                        apiBase={apiBase}
                        onPick={() => setKeeper(p)}
                    />
                ))}
            </div>
        </section>
    );
};

const DuplicateReview = ({ isOpen, result, apiBase, apiCall, onClose, onCleaned }) => {
    const [groups, setGroups] = useState([]);
    const [keeper, setKeepers] = useState([]);
    const [view, setView] = useState('list');
    const [index, setIndex] = useState(0);
    const [failed, setFailed] = useState({});
    const [preview, setPreview] = useState(null); // dry-run response while confirming
    const [busy, setBusy] = useState(false);

    // A new scan starts a fresh review. Closing and reopening keeps every choice,
    // because the component stays mounted and only renders nothing while closed.
    useEffect(() => {
        const g = result?.groups || [];
        setGroups(g);
        setKeepers(initialKeepers(g));
        setView(defaultView(g.length, result?.strictness));
        setIndex(0);
        setFailed({});
    }, [result]);

    const files = result?.files || {};
    const trash = useMemo(() => pathsToTrash(groups, keeper), [groups, keeper]);
    const bytes = reclaimBytes(trash, files);
    const setKeeper = (i) => (k) => setKeepers((prev) => prev.map((v, j) => (j === i ? k : v)));

    useEffect(() => {
        // Nothing may change behind the confirmation dialog.
        if (!isOpen || preview) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') return onClose();
            if (view !== 'single') return;
            const g = groups[index];
            if (!g) return;
            if (e.key === 'ArrowRight') setIndex((i) => Math.min(i + 1, groups.length - 1));
            else if (e.key === 'ArrowLeft') setIndex((i) => Math.max(i - 1, 0));
            else if (e.key.toLowerCase() === 'k') setKeeper(index)(KEEP_ALL);
            else if (/^[1-9]$/.test(e.key) && g[Number(e.key) - 1]) setKeeper(index)(g[Number(e.key) - 1]);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, preview, view, groups, index]);

    // Dry run first: it tells us whether the Trash is available before we promise it.
    const askConfirm = async () => {
        setBusy(true);
        try {
            setPreview(await apiCall('/api/delete-files', {
                method: 'POST',
                body: JSON.stringify({ file_paths: trash, dry_run: true }),
            }));
        } catch { /* apiCall already logged it */ } finally { setBusy(false); }
    };

    const clean = async () => {
        const paths = preview.deleted;
        setPreview(null);
        setBusy(true);
        try {
            const r = await apiCall('/api/delete-files', {
                method: 'POST',
                body: JSON.stringify({ file_paths: paths, dry_run: false }),
            });
            const next = afterDelete(groups, keeper, r.deleted);
            setGroups(next.groups);
            setKeepers(next.keeper);
            setIndex((i) => Math.min(i, Math.max(next.groups.length - 1, 0)));
            setFailed(Object.fromEntries(r.failed.map((f) => [f.path, f.error])));
            onCleaned(r, next.groups.length);
        } catch { /* apiCall already logged it */ } finally { setBusy(false); }
    };

    if (!isOpen) return null;

    const scanFoundNone = (result?.groups || []).length === 0;
    const common = { files, failed, apiBase };

    return (
        <div className="dup-overlay">
            <div className="dup-panel" role="dialog" aria-label="Review duplicates">
                <header className="dup-header">
                    <div>
                        <h2>Review duplicates</h2>
                        <p>
                            {groups.length
                                ? `${groups.length} groups · ${trash.length} extra copies · ${formatBytes(bytes)} reclaimable`
                                : scanFoundNone ? 'No duplicates found in this folder.' : 'All cleaned up.'}
                        </p>
                    </div>
                    {groups.length > 0 && (
                        <div className="dup-view-toggle" role="tablist" aria-label="Review view">
                            <button role="tab" aria-selected={view === 'list'} className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
                                <List size={16} /> List
                            </button>
                            <button role="tab" aria-selected={view === 'single'} className={view === 'single' ? 'active' : ''} onClick={() => setView('single')}>
                                <Square size={16} /> One by one
                            </button>
                        </div>
                    )}
                    <button className="dup-close" onClick={onClose} title="Close" aria-label="Close"><X size={22} /></button>
                </header>

                {groups.length > 0 && <p className="dup-hint">The best copy is pre-selected. Click a photo to keep that one instead.</p>}

                <div className="dup-body">
                    {groups.length === 0 ? (
                        <div className="dup-empty">{scanFoundNone ? 'Every photo here is one of a kind.' : 'Nothing left to review.'}</div>
                    ) : view === 'list' ? (
                        groups.map((g, i) => (
                            <Group key={i} group={g} label={`Group ${i + 1}`} keeper={keeper[i]} setKeeper={setKeeper(i)} {...common} />
                        ))
                    ) : (
                        <>
                            <Group large group={groups[index]} label={`Group ${index + 1} of ${groups.length}`} keeper={keeper[index]} setKeeper={setKeeper(index)} {...common} />
                            <nav className="dup-nav">
                                <button className="btn btn-secondary" disabled={index === 0} onClick={() => setIndex(index - 1)}><ChevronLeft size={16} /> Prev</button>
                                <button className="btn btn-secondary" disabled={index === groups.length - 1} onClick={() => setIndex(index + 1)}>Next <ChevronRight size={16} /></button>
                            </nav>
                            <p className="dup-keys">← → move between groups · 1–9 choose the keeper · K keep all</p>
                        </>
                    )}
                </div>

                <footer className="dup-footer">
                    <span className="dup-footer-note">Removed photos go to the Trash. You can restore them from there.</span>
                    <button className="btn btn-secondary" onClick={onClose}>Close</button>
                    <button className="btn btn-primary" disabled={!trash.length || busy} onClick={askConfirm}>
                        {busy ? 'Working…' : `Move ${trash.length} files to Trash`}
                    </button>
                </footer>
            </div>

            <ConfirmationModal
                isVisible={!!preview}
                title={preview?.use_trash === false ? 'Delete permanently?' : 'Move to Trash?'}
                onCancel={() => setPreview(null)}
                onConfirm={clean}
                confirmText={preview?.use_trash === false ? 'Delete permanently' : 'Move to Trash'}
                cancelText="Cancel"
            >
                <p>
                    {preview?.use_trash === false
                        ? <>The Trash is unavailable, so <strong>{preview?.deleted.length} files ({preview?.total_freed_mb} MB)</strong> will be deleted permanently. This cannot be undone.</>
                        : <>Move <strong>{preview?.deleted.length} files ({preview?.total_freed_mb} MB)</strong> to the Trash? The kept copy of each photo stays where it is.</>}
                </p>
            </ConfirmationModal>
        </div>
    );
};

export default DuplicateReview;
```

- [ ] **Step 2: Styles.** Append to `frontend/src/components/DuplicateReview.css`:

```css
/* --- Review overlay --- */
.dup-overlay {
  position: fixed;
  inset: 0;
  z-index: 2500; /* above glass modals (2000), below ConfirmationModal (3000) */
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 24, 39, 0.55);
  animation: modal-fade-in 0.3s ease-out;
}

.dup-panel {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(1100px, 94vw);
  height: 90vh;
  border-radius: 1rem;
  overflow: hidden;
  background: rgba(17, 24, 39, 0.85);
  border: 1px solid rgba(var(--color-primary-rgb), 0.35);
  -webkit-backdrop-filter: blur(24px) saturate(150%);
  backdrop-filter: blur(24px) saturate(150%);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5), 0 0 40px var(--color-shadow-primary);
}

.dup-header {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem 1.5rem 0.5rem;
}
.dup-header > div:first-child { flex: 1; }
.dup-header h2 { margin: 0; font-size: 1.3rem; color: var(--color-primary); }
.dup-header p { margin: 0.25rem 0 0; color: var(--color-text-muted); font-size: 0.9rem; }

.dup-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  padding: 0.25rem;
}
.dup-close:hover { color: var(--color-text); }

.dup-view-toggle {
  display: flex;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  overflow: hidden;
}
.dup-view-toggle button {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.4rem 0.9rem;
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 0.85rem;
}
.dup-view-toggle button.active { background: var(--color-gradient); color: #fff; }

.dup-hint { margin: 0 1.5rem 0.5rem; font-size: 0.85rem; color: var(--color-text-muted); }

.dup-body {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem 1.5rem 1rem;
}

.dup-group {
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--border-radius);
  background: rgba(255, 255, 255, 0.03);
}

.dup-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
}

.dup-keep-all {
  padding: 0.3rem 0.8rem;
  border-radius: 999px;
  border: 1px solid var(--color-border);
  background: none;
  color: var(--color-text);
  cursor: pointer;
  font-size: 0.8rem;
}
.dup-keep-all.active { border-color: var(--color-primary); color: var(--color-primary); }

.dup-tiles { display: flex; flex-wrap: wrap; gap: 0.75rem; }

.dup-tile {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  width: 160px;
  padding: 0.4rem;
  border-radius: var(--border-radius);
  border: 2px solid transparent;
  background: rgba(0, 0, 0, 0.25);
  color: var(--color-text);
  cursor: pointer;
  text-align: left;
  transition: all var(--transition-speed);
}
.dup-tile.large { width: 300px; }
.dup-tile.keep { border-color: var(--color-primary); box-shadow: 0 0 16px var(--color-shadow-primary); }
.dup-tile.trash { opacity: 0.55; }
.dup-tile.trash:hover { opacity: 0.85; }
.dup-tile.failed { border-color: var(--color-error); opacity: 1; }

.dup-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: contain;
  border-radius: calc(var(--border-radius) - 2px);
  background: rgba(255, 255, 255, 0.04);
}
.dup-thumb-missing {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.dup-badge {
  position: absolute;
  top: 0.6rem;
  left: 0.6rem;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 0.2rem;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  background: rgba(17, 24, 39, 0.85);
}
.dup-tile.keep .dup-badge { background: var(--color-primary); color: #fff; }

.dup-meta { font-size: 0.75rem; color: var(--color-text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dup-folder { opacity: 0.8; }

.dup-nav { display: flex; justify-content: center; gap: 1rem; margin-top: 0.5rem; }
.dup-keys { text-align: center; font-size: 0.8rem; color: var(--color-text-muted); }

.dup-empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
}

.dup-footer {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--color-border);
}
.dup-footer-note { flex: 1; font-size: 0.85rem; color: var(--color-text-muted); }
.dup-footer .btn { width: auto; margin: 0; }

@media (max-width: 760px) {
  .dup-header { flex-wrap: wrap; }
  .dup-tile, .dup-tile.large { width: calc(50% - 0.4rem); }
  .dup-footer { flex-wrap: wrap; }
}
```

- [ ] **Step 3: Wire it into `App.jsx`.**
  - Import: `import DuplicateReview from './components/DuplicateReview';`
  - State next to `dupResult`:

```jsx
    const [showDupReview, setShowDupReview] = useState(false);
    const [dupRemaining, setDupRemaining] = useState(0);
```

  - In the Task 4 completion `.then`, open the review:

```jsx
                            .then((s) => {
                                const groups = s.duplicate_groups || [];
                                setDupResult({ groups, files: s.duplicate_files || {}, strictness: dupStrictness });
                                setDupRemaining(groups.length);
                                setShowDupReview(true);
                            })
```

  - In `handleStartSorting`, next to `setDupResult(null)`: `setShowDupReview(false);`
  - Footer (`footer-actions`), before the destination button:

```jsx
                        {operationMode === 'duplicates' && dupResult && !isProcessing && dupRemaining > 0 && (
                            <button onClick={() => setShowDupReview(true)} className="btn btn-primary">
                                Review duplicates ({dupRemaining} groups)
                            </button>
                        )}
```

  - Next to `<FindGroupResultModal …/>`:

```jsx
            <DuplicateReview
                isOpen={showDupReview}
                result={dupResult}
                apiBase={`http://127.0.0.1:${backendPort}`}
                apiCall={apiCall}
                onClose={() => setShowDupReview(false)}
                onCleaned={(r, remaining) => {
                    logToConsole(r.message, r.failed.length ? 'warning' : 'success');
                    r.failed.forEach((f) => logToConsole(`Could not remove ${f.path}: ${f.error}`, 'error'));
                    setDupRemaining(remaining);
                }}
            />
```

- [ ] **Step 4: Build check.**
Run: `cd frontend && npm run build && node src/components/duplicateReview.test.mjs`
Expected: the build succeeds; `duplicateReview: all assertions passed`.

- [ ] **Step 5: Manual check** (`npm run tauri dev`) on a scratch folder holding `a.jpg`, a byte copy `a copy.jpg`, a half-size re-export `a_small.jpg`, an EXIF-rotated twin, an unrelated photo, plus a file named `trip #1 & café.jpg` with its copy:
  - With ≤12 groups the review opens **one by one**; a "Similar" scan on a big folder also opens one by one; a >12-group "Near-identical" scan opens as the **list**.
  - The toggle switches views and choices survive; closing and reopening via "Review duplicates (N groups)" keeps them.
  - The full-size `a.jpg` is pre-marked KEEP and `a copy.jpg`/`a_small.jpg` show Trash; thumbnails render, including the `#`/`&`/accent file and the rotated twin upright.
  - Keys in one-by-one: `→`/`←` move, `2` makes the second photo the keeper, `K` keeps all. With the confirmation dialog open, pressing `1`/`K` changes nothing (Review Focus 5). Esc closes.
  - "Move N files to Trash" → the confirmation shows the count and MB → confirm → the files are in the OS Trash, the groups disappear, the log shows the freed MB. Delete one file in Finder beforehand to see it flagged as failed while the rest go.
  - Run a Standard sort, then return to Duplicates: no stale "Review duplicates" button (Review Focus 4).

- [ ] **Step 6: Commit.**

```bash
git add frontend/src/components/DuplicateReview.jsx frontend/src/components/DuplicateReview.css frontend/src/App.jsx
git commit -m "feat(duplicates): review screen with list and one-by-one views"
```

---

### Task 6: Changelog and full verification

**Files:**
- Modify: `CHANGELOG.md` (`## [Unreleased]` → `### Added`)

- [ ] **Step 1:** Add under `## [Unreleased]` → `### Added` (create the heading if the worktree's changelog lacks it):

```markdown
- **Find and clear out duplicate photos, right in the app.** A new Duplicates tab scans a folder for copies of the same photo, including resized, re-exported and rotated copies and, if you choose, burst shots. Review each group side by side: Local Lens pre-selects the best copy (highest resolution, then least compressed, then the original over a "copy"), and you can pick another or keep them all. A short list opens one group at a time; a long one opens as a list you can skim. Everything you remove goes to the Trash. Free for everyone.
- When the Claude agent cleans up duplicates, it now keeps the best copy too, rather than whichever file it found first.
```

- [ ] **Step 2: Full verification.**

```bash
cd backend && venv/bin/python test_phash.py && venv/bin/python test_api_smoke.py
cd ../frontend && node src/components/duplicateReview.test.mjs && npm run build
```

Expected: `test_phash: all assertions passed`, smoke exit 0 with `[5]` and `[5b]` PASS, `duplicateReview: all assertions passed`, and a clean build.

- [ ] **Step 3: Commit.**

```bash
git add CHANGELOG.md
git commit -m "docs(changelog): in-app duplicate finder"
```
