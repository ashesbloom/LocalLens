# Check Against Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compare a new source (SD card or folder) against the organized library. Trash the photos already there from the source, and import only the new ones through a pre-filled Standard Sort.

**Architecture:**
- `/api/find-duplicates` gains an optional `library_folder`. It fingerprints both trees (through a new on-device pHash cache) and keeps only groups that span both.
- The result carries `in_library` flags and the source's `new_files`.
- The review screen gets a compare mode with locked library copies. Its Import button hands `new_files` to Standard Sort as the existing `specific_files` option.
- That handoff exposes a real data-loss bug in cross-drive Move with `specific_files`, so Task 1 fixes it at the root first.

**Tech Stack:** FastAPI + Pillow + numpy + sqlite3 (backend `backend/venv`), React 18 + Vite + Tauri 2, plain `assert` / `node:assert` self-checks.

**Spec:** `docs/superpowers/specs/2026-10-12-library-compare-design.md`

**Workspace:** worktree `.claude/worktrees/duplicate-finder`, branch `feat/duplicate-finder` (sub-project 1 is already here).

## Global Constraints

- **Library files are never trashed:** not by default, not by any click, not by any key.
- **Agent contract kept:** `duplicate_groups` is still `[[keeper, ...], ...]` with the keeper first. In compare mode the first entry is always a library file.
- **Cross groups only:** compare mode reports a group only if it has ≥1 library file and ≥1 source file.
- **`new_files`:** source files (hashed **or** unreadable) that are in no reported group.
- **Validation:** `library_folder` must exist and must not equal, contain, or be inside the source. Otherwise HTTP 400 with a plain message.
- **Cache validity:** a cached fingerprint is valid only for the same path, size and mtime. Cache failures never fail a scan. `purge_all()` clears the cache.
- **Import:**
  - runs as Standard Sort with `sorting_options.specific_files = new_files`;
  - an empty list must never start a sort;
  - Move must never delete anything but the files actually sorted.
- **Copy text:** "Compare with library", "Compare with Library", "In library", "Keep on card", "Import K new photos", and the banner: "Importing only the K new photos from <name> — the M already in your library are skipped."

## Review Focus

1. **Cross-drive Move import:** sorting with `specific_files` from an SD card into a library on another drive must move only those files and leave the rest of the card intact (today it `rmtree`s the whole source). Owner: Task 1 test.
2. **Empty import list:** `specific_files: []` must sort nothing, not everything (the backend currently treats `[]` as "not given"). Owner: Task 1 test plus the Task 6 guard.
3. **Library file in a non-keeper slot,** or the only remaining file: the trash set must never contain it, and a group left with only library files disappears after a clean. Owner: Task 4 tests.
4. **Overlapping folders,** e.g. a library chosen inside the card, the card inside the library, or the same folder twice: refused with 400, not scanned against itself. Owner: Task 3 test.
5. **Edited photo after a cached scan:** a file whose mtime changed is re-decoded, not served a stale fingerprint. Owner: Task 2 / Task 3 test.

---

### Task 1: Backend — Move with `specific_files` never deletes the whole source

**Files:**
- Modify: `backend/organizer_logic.py` (add `_use_safe_copy_path` near `process_photos`, ~L1279; use it at ~L1322)
- Modify: `backend/main.py` (~L1095: `if sort_opts.get("specific_files"):` → `is not None`)
- Test: create `backend/test_specific_files_move.py`

**Interfaces:**
- Produces: `organizer_logic._use_safe_copy_path(operation_mode: str, source_dir: str, dest_dir: str, specific_files) -> bool`

- [ ] **Step 1: Failing test** — `backend/test_specific_files_move.py`:

```python
"""
Self-check: a Move given an explicit file list (the scheduler's new-files run, the
library import) moves only those files, and never takes the cross-drive
copy-everything-then-delete-the-source path.

Plain asserts. Run:  python test_specific_files_move.py
"""
import os
import tempfile
from unittest import mock

import organizer_logic as ol


def demo():
    with tempfile.TemporaryDirectory() as src, tempfile.TemporaryDirectory() as dst:
        # Pretend source and destination are on different drives.
        real_stat = os.stat
        def fake_stat(p, *a, **k):
            st = real_stat(p, *a, **k)
            if os.path.realpath(p) == os.path.realpath(src):
                return os.stat_result((st.st_mode, st.st_ino, st.st_dev + 1) + tuple(st[3:]))
            return st
        with mock.patch.object(ol.os, "stat", fake_stat):
            # A whole-folder Move across drives still takes the safe copy path...
            assert ol._use_safe_copy_path("move", src, dst, None) is True
            # ...but with an explicit list it must not: that path rmtree()s the source.
            assert ol._use_safe_copy_path("move", src, dst, ["/x.jpg"]) is False
            assert ol._use_safe_copy_path("move", src, dst, []) is False
        assert ol._use_safe_copy_path("copy", src, dst, None) is False
        assert ol._use_safe_copy_path("move", src, dst, None) is False  # same drive
    print("test_specific_files_move: all assertions passed")


if __name__ == "__main__":
    demo()
```

- [ ] **Step 2:** Run `cd backend && venv/bin/python test_specific_files_move.py` → expect `AttributeError: ... '_use_safe_copy_path'`.

- [ ] **Step 3: Implement.** In `organizer_logic.py`, above `def process_photos`:

```python
def _use_safe_copy_path(operation_mode, source_dir, dest_dir, specific_files):
    """
    Whether a Move should take the cross-drive copy-the-whole-source-then-delete-it
    path. Never with an explicit file list: that path sorts a temp copy of the
    whole folder and then removes the original source tree, which would destroy
    every file that was not on the list (the photos an import skipped, or a
    watched folder's older files). With a list, each file is moved on its own;
    shutil.move copies then unlinks across drives, so it is still safe.
    """
    if operation_mode != 'move' or specific_files is not None:
        return False
    return os.stat(source_dir).st_dev != os.stat(dest_dir).st_dev
```

In `process_photos`, replace:

```python
        if operation_mode == 'move':
            source_dev = os.stat(source_dir).st_dev
            dest_dev = os.stat(dest_dir).st_dev

            if source_dev != dest_dev:
```

with:

```python
        if operation_mode == 'move':
            if _use_safe_copy_path(operation_mode, source_dir, dest_dir, sort_options.get("specific_files")):
```

(The `else:` fast path, which moves file by file, now also covers cross-drive moves given a list.) In `main.py` ~L1095, change `if sort_opts.get("specific_files"):` to `if sort_opts.get("specific_files") is not None:` with the comment `# [] means "nothing", not "everything"`.

- [ ] **Step 4:** Run it again → `test_specific_files_move: all assertions passed`. Run `venv/bin/python test_ignore_list.py` → exit 0.
- [ ] **Step 5: Commit** — `fix(sort): a move with a file list never deletes the whole source`.

---

### Task 2: Backend — pHash cache in the metadata store

**Files:**
- Modify: `backend/metadata_store.py` (schema `_SCHEMA_SQL`, new methods after `face_cache_clear`, `purge_all`)
- Test: create `backend/test_phash_cache.py`

**Interfaces:**
- Produces:
  - `MetadataStore.phash_cache_get_many(paths: List[str]) -> Dict[str, {"phash": int (unsigned 64-bit), "width": int, "height": int}]`
  - `MetadataStore.phash_cache_put_many(rows: List[Tuple[path, size, mtime, phash_unsigned, width, height]]) -> None`
  - `purge_all()` also clears `phash_cache`.

- [ ] **Step 1: Failing test** — `backend/test_phash_cache.py`:

```python
"""Self-check for the pHash cache. Plain asserts. Run: python test_phash_cache.py"""
import os
import tempfile
from pathlib import Path

from metadata_store import MetadataStore


def store_at(d):
    s = MetadataStore.__new__(MetadataStore)   # skip the real ~/.config DB
    s._db_path = Path(d) / "m.db"
    s._init_db()
    return s


def demo():
    with tempfile.TemporaryDirectory() as d:
        s = store_at(d)
        f = os.path.join(d, "a.jpg")
        open(f, "wb").write(b"x" * 10)
        st = os.stat(f)
        big = (1 << 64) - 1                       # top bit set: must survive SQLite's signed INTEGER
        s.phash_cache_put_many([(f, st.st_size, st.st_mtime, big, 4000, 3000)])
        assert s.phash_cache_get_many([f]) == {f: {"phash": big, "width": 4000, "height": 3000}}

        os.utime(f, (st.st_atime, st.st_mtime + 5))  # edited photo: stale row is ignored
        assert s.phash_cache_get_many([f]) == {}
        assert s.phash_cache_get_many([os.path.join(d, "missing.jpg")]) == {}

        st = os.stat(f)
        s.phash_cache_put_many([(f, st.st_size, st.st_mtime, 7, 1, 1)])
        s.purge_all()
        assert s.phash_cache_get_many([f]) == {}, "privacy purge must clear the cache"
    print("test_phash_cache: all assertions passed")


if __name__ == "__main__":
    demo()
```

- [ ] **Step 2:** Run → `AttributeError: ... 'phash_cache_put_many'`.
- [ ] **Step 3: Implement.** Append to `_SCHEMA_SQL` (inside the string, after `face_cache`):

```sql
-- Duplicate-scan fingerprint cache ------------------------------------------
-- Decoding every photo for its pHash is what makes a duplicate scan slow, and a
-- library compared against each new SD card barely changes between runs. A row is
-- only valid for the (size, mtime) it was computed from, like face_cache.
-- phash is the 64-bit hash stored as a signed INTEGER (two's complement).
CREATE TABLE IF NOT EXISTS phash_cache (
    path       TEXT    PRIMARY KEY,
    file_size  INTEGER NOT NULL,
    file_mtime REAL    NOT NULL,
    phash      INTEGER NOT NULL,
    width      INTEGER NOT NULL,
    height     INTEGER NOT NULL
);
```

Methods, after `face_cache_clear`:

```python
    def phash_cache_get_many(self, paths: List[str]) -> Dict[str, Dict[str, Any]]:
        """Cached fingerprints for `paths` whose size and mtime still match. Never raises."""
        stats = {}
        for p in paths:
            try:
                st = os.stat(p)
                stats[p] = (st.st_size, st.st_mtime)
            except OSError:
                pass
        found = {}
        try:
            with self._connect() as conn:
                keys = list(stats)
                for i in range(0, len(keys), 500):    # stay under SQLite's variable limit
                    chunk = keys[i:i + 500]
                    rows = conn.execute(
                        f"SELECT * FROM phash_cache WHERE path IN ({','.join('?' * len(chunk))})", chunk
                    ).fetchall()
                    for row in rows:
                        size, mtime = stats[row["path"]]
                        if row["file_size"] != size or abs(row["file_mtime"] - mtime) > 1e-6:
                            continue  # file changed on disk
                        h = row["phash"]
                        found[row["path"]] = {"phash": h + (1 << 64) if h < 0 else h,
                                              "width": row["width"], "height": row["height"]}
        except Exception as e:
            _log.warning(f"phash_cache_get_many failed, hashing everything: {e}")
            return {}
        return found

    def phash_cache_put_many(self, rows) -> None:
        """Store (path, size, mtime, phash, width, height) rows. Never raises."""
        if not rows:
            return
        try:
            with self._connect() as conn:
                conn.executemany(
                    "INSERT OR REPLACE INTO phash_cache VALUES (?,?,?,?,?,?)",
                    [(p, s, m, h - (1 << 64) if h >= (1 << 63) else h, w, ht)
                     for p, s, m, h, w, ht in rows],
                )
                conn.commit()
        except Exception as e:
            _log.debug(f"phash_cache_put_many skipped: {e}")
```

In `purge_all`, add `conn.execute("DELETE FROM phash_cache")` after `DELETE FROM compaction_log`.

- [ ] **Step 4:** Run → `test_phash_cache: all assertions passed`.
- [ ] **Step 5: Commit** — `feat(duplicates): cache photo fingerprints on device`.

---

### Task 3: Backend — library compare scan

**Files:**
- Modify: `backend/main.py`:
  - `current_job_state` + `_DUP_RESULT_RESET` (add `library_folder`, `new_files`);
  - `FindDuplicatesRequest` (+`library_folder`);
  - `find_duplicates_endpoint` (validation, pass-through);
  - `run_find_duplicates_task` (collection helper, cache, cross filter, ordering, `new_files`, `in_library`);
  - new `_phash_store()`, `_overlaps()`, `_collect_images()`.
- Test: `backend/test_phash.py` (in-process)

**Interfaces:**
- Consumes: Task 2 cache methods.
- Produces:
  - Job state: `library_folder: str | None`, `new_files: List[str]`, `duplicate_files[path]["in_library"]: bool`.
  - Request field: `library_folder: Optional[str]`.
  - `main._phash_store()` returns the store or None; tests replace it.

- [ ] **Step 1: Failing tests.** In `test_phash.py`, in the `# --- links ---` section, set `main._phash_store = lambda: None` right after `import main`, so the link test never touches the real DB. Then append before the final `print`:

```python
    # --- library compare: only card-vs-library groups, library copy first ---
    from fastapi import BackgroundTasks, HTTPException
    from metadata_store import MetadataStore
    from pathlib import Path
    with tempfile.TemporaryDirectory() as d:
        lib, card = os.path.join(d, "Library"), os.path.join(d, "Card")
        os.makedirs(lib); os.makedirs(card)
        _photo(seed=21).save(os.path.join(lib, "A.jpg"), quality=95)
        _photo(seed=21).save(os.path.join(card, "A.jpg"), quality=95)       # already in library
        _photo(seed=22).save(os.path.join(lib, "B.jpg"), quality=95)
        _photo(seed=22).save(os.path.join(lib, "B2.jpg"), quality=95)       # library-internal dupe: not reported
        _photo(seed=23).save(os.path.join(card, "C.jpg"), quality=95)       # new
        _photo(seed=24).save(os.path.join(card, "D.jpg"), quality=95)
        _photo(seed=24).save(os.path.join(card, "D2.jpg"), quality=95)      # card-internal dupe: both new
        open(os.path.join(card, "broken.jpg"), "wb").write(b"no")           # unreadable: counts as new

        store = MetadataStore.__new__(MetadataStore)
        store._db_path = Path(d) / "m.db"; store._init_db()
        main._phash_store = lambda: store
        decodes = []
        real_load = main.load_upright
        main.load_upright = lambda p: (decodes.append(p), real_load(p))[1]

        def compare():
            asyncio.run(main.run_find_duplicates_task({"source_folder": card, "ignore_list": [],
                                                       "library_folder": lib, "max_distance": MAX_DISTANCE}))
            return main.current_job_state

        s = compare()
        assert s["duplicate_groups"] == [[os.path.join(lib, "A.jpg"), os.path.join(card, "A.jpg")]], s["duplicate_groups"]
        assert s["duplicate_files"][os.path.join(lib, "A.jpg")]["in_library"] is True
        assert s["duplicate_files"][os.path.join(card, "A.jpg")]["in_library"] is False
        assert sorted(map(os.path.basename, s["new_files"])) == ["C.jpg", "D.jpg", "D2.jpg", "broken.jpg"], s["new_files"]
        assert s["library_folder"] == lib

        # Second run: every readable file comes from the cache (only broken.jpg is re-tried).
        decodes.clear(); compare()
        assert [os.path.basename(p) for p in decodes] == ["broken.jpg"], decodes
        # An edited photo is re-decoded rather than served a stale fingerprint.
        st = os.stat(os.path.join(lib, "B.jpg")); os.utime(os.path.join(lib, "B.jpg"), (st.st_atime, st.st_mtime + 5))
        decodes.clear(); compare()
        assert sorted(map(os.path.basename, decodes)) == ["B.jpg", "broken.jpg"], decodes
        main.load_upright = real_load
        main._phash_store = lambda: None

        # Overlapping folders are refused before anything is scanned.
        main.current_job_state["is_active"] = False
        for src, libf in [(card, card), (d, lib), (lib, d)]:
            try:
                asyncio.run(main.find_duplicates_endpoint(
                    main.FindDuplicatesRequest(source_folder=src, library_folder=libf), BackgroundTasks()))
                raise AssertionError(f"overlap not refused: {src} vs {libf}")
            except HTTPException as e:
                assert e.status_code == 400, e
        assert main.current_job_state["is_active"] is False, "a refused request must not claim the job slot"
```

- [ ] **Step 2:** Run `venv/bin/python test_phash.py` → expect a failure (`KeyError: 'library_folder'` or a groups mismatch).
- [ ] **Step 3: Implement** in `main.py`:

State: add to `current_job_state` after `"duplicate_files"`:

```python
    "library_folder": None,     # Compare mode only: the library the source was checked against
    "new_files": [],            # Compare mode only: source files found in no library group
```

and `"library_folder": None, "new_files": [],` to `_DUP_RESULT_RESET`.

Helpers above `run_find_duplicates_task`:

```python
def _phash_store():
    """The fingerprint cache, or None. A function so tests can swap in a temp store."""
    try:
        from metadata_store import metadata_store
        return metadata_store
    except Exception:
        return None


def _overlaps(a: str, b: str) -> bool:
    """Same folder, or one inside the other (case-insensitive where the OS is)."""
    ra, rb = (os.path.normcase(os.path.realpath(p)) for p in (a, b))
    try:
        return os.path.commonpath([ra, rb]) in (ra, rb)
    except ValueError:  # different drives on Windows
        return False


def _collect_images(root: str, ignore_set: set, seen_inodes: set) -> List[str]:
    """
    Supported images under root. A symlink or hard link is the same file under
    another name, not a duplicate of it: grouping them would let the ranking trash
    the real file and "keep" a link that then dangles, so links are skipped and each
    inode is collected once (seen_inodes is shared across trees on purpose).
    """
    out = []
    for dirpath, _, filenames in walk_ignoring(root, ignore_set):
        for f in filenames:
            if not f.lower().endswith(SUPPORTED_EXTENSIONS):
                continue
            fp = os.path.join(dirpath, f)
            try:
                if os.path.islink(fp):
                    continue
                st = os.stat(fp)
            except OSError:
                continue
            # st_ino is 0 on filesystems without inodes (FAT, some network shares);
            # deduping on it there would collapse every file into one.
            if st.st_ino:
                if (st.st_dev, st.st_ino) in seen_inodes:
                    continue
                seen_inodes.add((st.st_dev, st.st_ino))
            out.append(fp)
    return out
```

In `run_find_duplicates_task`:
- Replace the collection block (the "A symlink or hard link…" comment through the loop) with:

```python
    library_folder = config.get("library_folder")
    seen_inodes = set()
    image_files = _collect_images(source_folder, set(ignore_list), seen_inodes)
    library_files = _collect_images(library_folder, set(), seen_inodes) if library_folder else []
    in_library = set(library_files)
    # Library first, so library photos seed the groups they belong to.
    all_files = library_files + image_files
```

- In the start `update`, use `len(all_files)` for the message and `total_files`, and add `"library_folder": library_folder` *after* `**_DUP_RESULT_RESET` (which would otherwise null it).
- Replace `scan()` with this version, which uses the cache:

```python
    def scan():
        """Blocking hash + group pass. Runs off the event loop (see to_thread below)."""
        store = _phash_store()
        cached = store.phash_cache_get_many(all_files) if store else {}
        fresh = []
        file_hashes = []
        file_info = {}
        skipped = 0
        # Progress is reported per batch, not per file: at 15k files a callback each
        # time would put 15k JSON messages through the log queue for no added detail.
        step = max(1, len(all_files) // 100)

        for idx, fp in enumerate(all_files):
            if cancellation_events["duplicates"].is_set():
                raise OperationAbortedError("Duplicate scan aborted by user.")
            try:
                st = os.stat(fp)
                hit = cached.get(fp)
                if hit:
                    h, w, ht = np.uint64(hit["phash"]), hit["width"], hit["height"]
                else:
                    im = load_upright(fp)
                    h = None if im is None else _phash_of(im)
                    if h is not None:
                        w, ht = im.width, im.height
                        fresh.append((fp, st.st_size, st.st_mtime, int(h), w, ht))
                if h is not None:
                    file_info[fp] = {"width": w, "height": ht, "bytes": st.st_size, "mtime": st.st_mtime}
            except Exception:
                h = None  # Corrupt or unreadable image
            if h is None:
                skipped += 1
            else:
                file_hashes.append((fp, h))

            if idx % step == 0:
                # Hashing owns 0-90%; grouping is comparatively instant.
                which = "library" if fp in in_library else "source"
                update_status_callback({
                    "progress": int(90 * idx / len(all_files)),
                    "message": f"Hashing {which} photos... {idx}/{len(all_files)}",
                    "status": "running",
                })

        if store:
            store.phash_cache_put_many(fresh)
        update_status_callback({
            "progress": 90,
            "message": f"Comparing {len(file_hashes)} hashes...",
            "status": "running",
        })
        # Library copies first (so the keeper is always one), each side ranked best-first.
        groups = [
            sorted(g, key=lambda p: (p not in in_library, _keeper_rank(p, file_info[p])))
            for g in _group_by_hash(file_hashes, max_distance)
        ]
        if library_folder:
            # Only "already in the library" matters here: library-internal and
            # source-internal duplicates are the plain scan's job.
            groups = [g for g in groups
                      if any(p in in_library for p in g) and any(p not in in_library for p in g)]
        grouped = {p for g in groups for p in g}
        # Only grouped files go out: this rides on every /api/job-status poll.
        grouped_info = {p: {**file_info[p], "in_library": p in in_library} for p in grouped}
        new_files = [p for p in image_files if p not in grouped] if library_folder else []
        return groups, grouped_info, new_files, len(file_hashes), skipped
```

- Caller: `groups, grouped_info, new_files, scanned, skipped = await asyncio.to_thread(scan)`, and add `"new_files": new_files` to the results `update`.
- The early return `if not image_files:` now checks `if not all_files:`.
- Summary message in compare mode:

```python
        if library_folder:
            in_lib = sum(1 for g in groups for p in g if p not in in_library)
            summary = (f"Comparison complete. {in_lib} of {len(image_files)} photos are already "
                       f"in your library; {len(new_files)} are new.")
        else:
            summary = f"Scan complete. Found {total_dupes} duplicate files in {len(groups)} group(s)."
```

Request + endpoint:

```python
class FindDuplicatesRequest(BaseModel):
    source_folder: str
    ignore_list: Optional[List[str]] = []
    similarity_threshold: Optional[float] = 0.95
    library_folder: Optional[str] = None
```

In `find_duplicates_endpoint`, after the source validation:

```python
    library_folder = os.path.normpath(os.path.expanduser(request.library_folder)) if request.library_folder else None
    if library_folder:
        if not os.path.isdir(library_folder):
            raise HTTPException(status_code=400, detail="Library path is not a valid directory.")
        if _overlaps(source_folder, library_folder):
            raise HTTPException(status_code=400, detail=(
                "The library and the folder to check overlap. Pick a library that is "
                "neither the same folder nor inside it, or the other way round."))
```

Add `"library_folder": library_folder` to the `add_task` config dict and to the returned JSON.

- [ ] **Step 4:** Run `venv/bin/python test_phash.py` → `test_phash: all assertions passed`. Run `venv/bin/python test_api_smoke.py` → 10/10, which proves plain-scan behaviour is unchanged.
- [ ] **Step 5: Commit** — `feat(duplicates): compare a folder against the library`.

---

### Task 4: Frontend helpers — protected library paths

**Files:** Modify `frontend/src/components/duplicateSelection.js` and `duplicateSelection.test.mjs`.

**Interfaces:**
- Produces:
  - `pathsToTrash(groups, keeper, protectedPaths = new Set())`
  - `afterDelete(groups, keeper, deletedPaths, protectedPaths = new Set())`, which also drops groups left with only protected files.

- [ ] **Step 1: Failing test** — add before the `formatBytes` asserts:

```js
// Compare mode: library files are protected and never trashed, whatever the keeper.
const lib = new Set(['/a/1.jpg', '/a/2.jpg']);
assert.deepEqual(pathsToTrash(groups, ['/b/1.jpg', '/c/2.jpg'], lib), ['/a/1 copy.jpg']);
assert.deepEqual(pathsToTrash(groups, keeper, new Set(groups.flat())), []);
// A group left holding only library files has nothing to review and goes.
const lg = [['/lib/a.jpg', '/lib/a2.jpg', '/card/a.jpg']];
const libSet = new Set(['/lib/a.jpg', '/lib/a2.jpg']);
assert.deepEqual(afterDelete(lg, ['/lib/a.jpg'], ['/card/a.jpg'], libSet).groups, []);
assert.deepEqual(afterDelete(lg, ['/lib/a.jpg'], [], libSet).groups, lg);
```

- [ ] **Step 2:** `node src/components/duplicateSelection.test.mjs` → AssertionError (the protected path is returned).
- [ ] **Step 3: Implement:**

```js
// A group trashes nothing unless its keeper is a real member: a missing or stale
// keeper must never turn into "delete every copy". Protected paths (the library,
// in compare mode) are never returned, whoever the keeper is.
export const pathsToTrash = (groups, keeper, protectedPaths = new Set()) =>
    groups.flatMap((g, i) => {
        const k = keeper[i];
        if (k === KEEP_ALL || !g.includes(k)) return [];
        return g.filter((p) => p !== k && !protectedPaths.has(p));
    });
```

and in `afterDelete` add the parameter and change the drop line to `if (left.length < 2 || left.every((p) => protectedPaths.has(p))) return;`.

- [ ] **Step 4:** Run → `duplicateSelection: all assertions passed`.
- [ ] **Step 5: Commit** — `feat(duplicates): never trash a protected library file`.

---

### Task 5: Frontend — compare mode in the Duplicates tab and the review screen

**Files:** Modify `frontend/src/App.jsx`, `frontend/src/components/DuplicateReview.jsx`, `frontend/src/components/DuplicateReview.css`.

**Interfaces:**
- Consumes: Task 3 result fields; Task 4 helpers.
- Produces:
  - `dupResult` gains `{ libraryFolder, sourceFolder, newFiles }`.
  - `<DuplicateReview onImport={({ files, skipped }) => …} />`, where `files` is `null` for "Import all".

- [ ] **Step 1: App state + picker.**
  - State, by `dupStrictness`:

```jsx
    // Remembered per device: the same library is compared against every new card.
    const [libraryFolder, setLibraryFolderRaw] = useState(() => localStorage.getItem('library_folder') || '');
    const setLibraryFolder = (p) => { setLibraryFolderRaw(p); localStorage.setItem('library_folder', p); };
```

  - `handleBrowseFolder`: `if (target === 'source') setSourceFolder(selected); else if (target === 'library') setLibraryFolder(selected); else setDestinationFolder(selected);`
  - Replace the Duplicates-mode `{operationMode !== 'duplicates' && (<PathSelector label="Destination Folder" …/>)}` with a ternary:

```jsx
                            {operationMode === 'duplicates' ? (
                                <>
                                    <PathSelector
                                        label="Compare with library (optional)"
                                        path={libraryFolder}
                                        handleSelectFolder={() => handleBrowseFolder('library')}
                                    />
                                    {libraryFolder && (
                                        <button type="button" className="dup-clear-library" onClick={() => setLibraryFolder('')}>
                                            Don't compare — just find duplicates in the source
                                        </button>
                                    )}
                                </>
                            ) : (
                                <PathSelector … existing Destination props … />
                            )}
```

  - `getOperationName`: `case 'duplicates': return libraryFolder ? 'Compare with Library' : 'Find Duplicates';`
  - Start payload (duplicates branch): add `library_folder: libraryFolder || undefined,`.
  - Completion `.then((s) => …)`:

```jsx
                                setDupResult({
                                    groups, files: s.duplicate_files || {}, strictness: dupStrictness,
                                    libraryFolder: s.library_folder || null,
                                    sourceFolder: s.source_folder,
                                    newFiles: s.new_files || [],
                                });
```

    In the footer, a comparison with zero groups must still be reopenable (it holds the "Import all" action). So change the review button condition to `operationMode === 'duplicates' && dupResult && !isProcessing && (dupRemaining > 0 || dupResult.libraryFolder)`, and its label to `{dupResult.libraryFolder ? 'Review comparison' : `Review duplicates (${dupRemaining} groups)`}`.

- [ ] **Step 2: DuplicateReview compare mode.**
  - Imports unchanged, plus `Lock` from react-feather.
  - `Tile` gets a `locked` prop: class `locked`; badge `<><Lock size={12} /> In library</>`; `onClick={locked ? undefined : onPick}`; `aria-disabled={locked}`.
  - `Group` gets `compare` and `protectedPaths`:
    - `save = reclaimBytes(pathsToTrash([group], [keeper], protectedPaths), files)`;
    - button text `compare ? (keepAll ? 'Keeping on card' : 'Keep on card') : (keepAll ? 'Keeping all' : 'Keep all')`;
    - the button's `onClick` stays as is (KEEP_ALL ↔ `group[0]`, a library file in compare mode);
    - each `Tile`: `locked={protectedPaths.has(p)}`, `keep={keepAll || keeper === p || protectedPaths.has(p)}`, `onPick={compare ? undefined : () => setKeeper(p)}`.
  - In `DuplicateReview`:

```jsx
    const compare = !!result?.libraryFolder;
    const protectedPaths = useMemo(
        () => new Set(Object.keys(result?.files || {}).filter((p) => result.files[p].in_library)),
        [result],
    );
    const trash = useMemo(() => pathsToTrash(groups, keeper, protectedPaths), [groups, keeper, protectedPaths]);
    const sourceName = baseName(result?.sourceFolder || '') || 'the source';
    const onCard = groups.flat().filter((p) => !protectedPaths.has(p)).length;
    const newCount = result?.newFiles?.length ?? 0;
```

  - `afterDelete(groups, keeper, r.deleted, protectedPaths)` in `clean`.
  - Keys: `else if (!compare && /^[1-9]$/.test(e.key) …)` so digits do nothing in compare mode.
  - Header `h2`: `{compare ? 'Already in your library' : 'Review duplicates'}`. Header `p` in compare mode:

```jsx
{compare
    ? (groups.length
        ? `${onCard} of ${onCard + newCount} photos in ${sourceName} are already in your library · ${newCount} new`
        : scanFoundNone ? `None of these ${newCount} photos are in your library yet.` : `Nothing left on ${sourceName} that is already in your library · ${newCount} new`)
    : /* existing text */}
```

  - Hint in compare mode: `Library copies are locked. Photos on ${sourceName} are marked for the Trash; use “Keep on card” to keep a group.` Empty body text in compare mode when `scanFoundNone`: `Everything here is new.`
  - Footer in compare mode: the Trash button reads `` `Move ${count(trash.length, "file")} from ${sourceName} to Trash` ``, then:

```jsx
{compare && (
    <button className="btn btn-primary" disabled={busy || (newCount === 0 && !scanFoundNone)}
        onClick={() => onImport(scanFoundNone ? { files: null, skipped: 0 } : { files: result.newFiles, skipped: onCard })}>
        {scanFoundNone ? 'Import all →' : `Import ${count(newCount, 'new photo')} →`}
    </button>
)}
```

  - The confirm text in compare mode: `Move … from ${sourceName} to the Trash? Your library is not touched.`
- [ ] **Step 3: CSS** (append to `DuplicateReview.css`):

```css
.dup-tile.locked { cursor: default; border-color: rgba(255, 255, 255, 0.35); box-shadow: none; }
.dup-tile.locked .dup-badge { background: rgba(255, 255, 255, 0.9); color: #111827; }
.dup-clear-library {
  align-self: flex-start;
  margin-top: 0.35rem;
  background: none;
  border: none;
  padding: 0;
  color: var(--color-primary);
  font-size: 0.85rem;
  cursor: pointer;
}
.dup-clear-library:hover { text-decoration: underline; }
```

- [ ] **Step 4:** `npm run build` → success; `node src/components/duplicateSelection.test.mjs` → pass.
- [ ] **Step 5: Commit** — `feat(duplicates): review a source against the library`.

---

### Task 6: Frontend — import handoff to Standard Sort

**Files:** Modify `frontend/src/App.jsx`, `frontend/src/App.css`.

**Interfaces:**
- Consumes: `onImport({ files, skipped })` from Task 5; backend `sorting_options.specific_files` (Task 1).
- Produces: App state `importOnly: null | { files: string[], source: string, library: string, skipped: number }`.

- [ ] **Step 1: State, handler and auto-clear:**

```jsx
    // Set by "Import new photos" on a library comparison: the next Standard Sort
    // processes only these files. Anything that changes what that sort would mean
    // (another folder, another mode) drops it.
    const [importOnly, setImportOnly] = useState(null);
    useEffect(() => {
        if (importOnly && (operationMode !== 'standard' || sourceFolder !== importOnly.source
            || destinationFolder !== importOnly.library)) {
            setImportOnly(null);
        }
    }, [operationMode, sourceFolder, destinationFolder]);

    // Source and destination are set from the scan's own (backend-normalised) paths:
    // the effect above compares against exactly these, and the file list belongs to
    // that scanned source even if the picker was changed after the scan.
    const handleImportNew = ({ files, skipped }) => {
        setShowDupReview(false);
        setSourceFolder(dupResult.sourceFolder);
        setDestinationFolder(dupResult.libraryFolder);
        setImportOnly(files ? { files, skipped, source: dupResult.sourceFolder, library: dupResult.libraryFolder } : null);
        setOperationMode('standard');
    };
```

  Pass `onImport={handleImportNew}` to `<DuplicateReview>`.
- [ ] **Step 2: Start payload and guard.** In `handleStartSorting`, before `await saveLastConfig()`:

```jsx
        if (operationMode === 'standard' && importOnly && importOnly.files.length === 0) {
            await message('There are no new photos to import.', { title: 'Nothing to import', kind: 'info' });
            return;
        }
```

  In the standard branch: `const sortingOptions = { primary_sort: sortMethod, face_mode: faceMode, maintain_hierarchy: maintainHierarchy, ...(importOnly ? { specific_files: importOnly.files } : {}) };`
  In the SSE final-status `setTimeout` block, add `setImportOnly(null);`.
- [ ] **Step 3: Banner**, inside `{operationMode === 'standard' && (<div className="mode-content">`, above `<SortingOptions`:

```jsx
                            {importOnly && (
                                <div className="import-only-banner" role="status">
                                    <span>
                                        Importing only the <strong>{importOnly.files.length} new photos</strong> from{' '}
                                        <strong>{getFolderName(importOnly.source)}</strong> — the {importOnly.skipped} already
                                        in your library are skipped.
                                    </span>
                                    <button type="button" onClick={() => setImportOnly(null)}>Cancel</button>
                                </div>
                            )}
```

  CSS in `App.css`, after `.theme-duplicates`:

```css
.import-only-banner {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: var(--border-radius);
  border: 1px solid rgba(var(--color-primary-rgb), 0.45);
  background: rgba(var(--color-primary-rgb), 0.1);
  font-size: 0.9rem;
}
.import-only-banner span { flex: 1; }
.import-only-banner button {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  padding: 0.25rem 0.8rem;
  color: inherit;
  cursor: pointer;
}
```

- [ ] **Step 4:** `npm run build` → success.
- [ ] **Step 5: Commit** — `feat(duplicates): import only the new photos through Standard Sort`.

---

### Task 7: Changelog and verification

- [ ] **Step 1:** Add to `CHANGELOG.md` → `## [Unreleased]` → `### Added`:

```markdown
- **See what's already in your library before you import.** In the Duplicates tab, pick your library under "Compare with library" and Local Lens checks a card or folder against it. Photos you already have are shown next to their library copy so you can clear them off the card (to the Trash, your library is never touched), and one click imports only the new ones through a normal sort, filed by date, place or people like everything else. Repeat comparisons are much faster: Local Lens remembers each photo's fingerprint on this device, and "Delete my data" clears it.
```

  And under `### Fixed` (create it if missing):

```markdown
- **Moving a scheduled folder to another drive no longer risks deleting files it didn't sort.** When a scheduled Move only had a few new photos to sort and the destination was on a different drive, Local Lens could remove the whole watched folder afterwards, including photos it hadn't touched. It now moves just the photos it sorts.
```

- [ ] **Step 2: Full suite:**
  - backend: `test_phash.py`, `test_phash_cache.py`, `test_specific_files_move.py`, `test_api_smoke.py`, `test_delete_paths.py`, `test_ignore_list.py`, `test_face_engine.py`;
  - frontend: all six `*.test.mjs` plus `npm run build`.

  All must pass.
- [ ] **Step 3: Browser harness** (throwaway, removed after). Vite on a free port (not 1420, which `tauri dev` holds) plus a sandboxed backend, with card/library fixtures. Check:
  - locked library tiles;
  - header counts;
  - Trash from card leaves the library untouched;
  - the Import button hands off: the Standard tab shows the banner and destination = library;
  - the start payload contains `specific_files`.

  Leave the real Tauri Move/Copy run to the user.
- [ ] **Step 4: Commit** — `docs(changelog): library compare and the scheduled-move fix`.
