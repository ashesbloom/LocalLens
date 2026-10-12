# Check against library (duplicates sub-project 2 of 3)

## Context

Sub-project 1 shipped the in-app duplicate finder: one folder is scanned, groups are reviewed, and extras go to the Trash. The common real-world case is different: an **SD card or a new folder** of photos, many of which are **already in the organized library**. The user wants to know which ones, clear them off the card, and bring only the new ones into the library, organized like everything else.

Example: a card holds 500 photos and the library 10,000. 420 are already in the library and 80 are new. Trash the 420 from the card; import the 80 by Date, Location or People.

Decisions made with the user:
- **Both actions:** trash the matches from the source, and import the rest.
- **Import goes through Standard Sort**, pre-filled, sorting only the new photos (not an unsorted "Imported" folder).
- **Cache fingerprints**, so repeat comparisons don't re-read the whole library.
- The flow and backend below were approved section by section.

Sub-project 3 ("skip duplicates when sorting") stays separate. Its re-detection is automatic and unreviewed, whereas this import skips exactly what the user reviewed.

## Design

### 1. Duplicates tab
- A new optional `PathSelector`, **"Compare with library"**, sits in the slot Destination uses in other modes (under Source Folder, above Preset).
  - **Empty:** behaviour is exactly sub-project 1.
  - **Set:** the start button reads **"Compare with Library"**.
- Strictness applies in both cases.
- The library path is remembered in `localStorage` (a per-device convenience, like `operation_mode`).

### 2. Review screen in compare mode
`DuplicateReview` receives `result.libraryFolder`. When it is set:
- **Header:** "`M` of `N` photos in `<source name>` are already in your library · `K` new". `N` = card files scanned (hashed + skipped); `M` = card files in groups; `K` = `new_files.length`.
- **Library files:**
  - Shown first in each group, with a locked **🔒 In library** badge.
  - Not clickable, and never in the trash set.
- **Card files:**
  - Default to Trash.
  - The per-group button reads **"Keep on card"** (the existing `KEEP_ALL`), toggling back to Trash.
  - Clicking a card tile does nothing in compare mode. There is no single-keeper choice: the keeper is always the library.
- **Views:** list and one-by-one, with the same default rule and toggle as sub-project 1. In one-by-one, `K` toggles "Keep on card" and `1–9` are inert.
- **Footer:**
  - `[Move M files from <source name> to Trash]`, using the existing dry-run → confirm → delete flow.
  - `[Import K new photos →]`, disabled when K = 0.
- **No groups at all:** "None of these `N` photos are in your library yet." plus **[Import all →]**. This is a normal Standard Sort handoff with no file list.

### 3. Import handoff (App.jsx)
1. Close the review and set `operationMode = 'standard'`.
2. Set Source = the scanned source and Destination = the library.
3. Set `importOnly = { files: new_files, source, library, skipped: M }`.
4. Show a banner above the sort options in Standard mode: "Importing only the `K` new photos from `<source name>` — the `M` already in your library are skipped. [Cancel]".
5. `handleStartSorting`, in standard mode with `importOnly` set, adds `specific_files: importOnly.files` to `sorting_options`. The existing field means "process only these files", and the scheduler already uses it.
6. `importOnly` is cleared when:
   - the sort reaches a final status;
   - the user presses Cancel;
   - Source or Destination changes;
   - the mode changes.

The handoff counts unreadable card files as new, so nothing is silently left behind.

**Plan must verify:** `specific_files` with `operation_mode: 'move'` when source and library are on different drives (the cross-drive move path sorts a temp copy, `work_dir`). If it misbehaves, the import forces copy mode and says so in the banner.

### 4. Backend: `POST /api/find-duplicates`
- **New optional field `library_folder`,** normalised like `source_folder`.
- **Validation:** return 400 with a plain message when:
  - the folder doesn't exist;
  - it equals the source;
  - either folder contains the other.
- **Scanning:**
  - The source is walked with `ignore_list`; the library is walked without it.
  - Links are skipped and inodes de-duplicated as in sub-project 1. The inode set is shared across both trees, so a hard link between card and library is one file.
- **Grouping:**
  - One combined `_group_by_hash`. Only groups with ≥1 library file and ≥1 source file are kept.
  - Within each group: library files first, then source files, each ranked by `_keeper_rank`. The first entry is therefore always a library file, so the agent contract ("first is keeper") holds.
- **Result fields** (all reset by `_DUP_RESULT_RESET`):
  - `library_folder`;
  - `duplicate_files[path].in_library` (bool);
  - `new_files`: hashed or skipped source files not in any kept group.
- **Progress:** the total counts both trees. The message names which tree is being hashed.

### 5. Backend: fingerprint cache (`metadata_store.py`)
- **Table:** `phash_cache(path TEXT PRIMARY KEY, file_size INTEGER, file_mtime REAL, phash INTEGER, width INTEGER, height INTEGER)`.
- **Accessors:** `phash_cache_get_many(paths) -> {path: {phash, width, height}}`, valid only when size and mtime match. `phash_cache_put_many(rows)` runs in one transaction. Both never raise: a cache failure falls back to hashing.
- **Use:** by every duplicate scan, compare or not. Unreadable files are not cached.
- **Purge:** `purge_all()` also clears `phash_cache`, which the privacy summary's purge covers. phash is stored as a signed 64-bit int, round-tripped via `np.uint64`.

### 6. Safety
- `pathsToTrash(groups, keeper, protectedPaths = new Set())` never returns a protected path. This is unit-tested with a library path in every position.
- In compare mode, `protectedPaths` = every `in_library` file.

### Out of scope
- Library compare via the Claude agent tool.
- Deleting duplicates *inside* the library.
- Sub-project 3.

## Files
- **Backend:**
  - `backend/main.py`: request field, validation, scan, result fields;
  - `backend/metadata_store.py`: cache.
- **Tests:** `backend/test_phash.py` (or a new `test_library_compare.py`), `backend/test_api_smoke.py`.
- **Frontend:**
  - `App.jsx`: library picker, `importOnly` state and banner, start payload;
  - `DuplicateReview.jsx/.css`: compare mode;
  - `duplicateSelection.js` + test: protected paths, compare counts.
- `CHANGELOG.md`.

## Verification
- **Backend:**
  - The cache round-trips and invalidates on an mtime change.
  - The compare scan keeps only cross groups, with library first.
  - `new_files` is correct, including a skipped file.
  - Overlapping folders get a 400.
  - Purge clears the cache.
- **Frontend:** `pathsToTrash` never returns a protected path; compare counts are correct.
- **Browser harness (real backend):**
  - card vs library fixtures;
  - locked library tiles;
  - Trash from card;
  - Import hands off with the banner, and the start payload carries `specific_files`.
- **Manual (Tauri):** the import sort writes only the new photos into the library, in copy mode and in move mode.
