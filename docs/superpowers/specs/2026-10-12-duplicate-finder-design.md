# Duplicate Finder: in-app mode (sub-project 1 of 3)

## Context

LocalLens can already find duplicate photos (`POST /api/find-duplicates`, a pHash background job, with results on `/api/job-status`), but only the Pro AI agent can reach it. The desktop app has no duplicates UI. This sub-project makes duplicates a first-class, **free** mode in the app: scan → review with thumbnails → keep the best copy → send the rest to Trash.

Roadmap, each with its own spec, plan and build:
1. **Find & Clean, with Smart Keeper** ← this spec
2. Check against library (compare a new source with the organized library; reuses this review UI)
3. Skip duplicates when sorting (sort-pipeline change plus a toggle)

Decisions made with the user: free in the app; a 4th mode tab; two review views with an automatic default plus a toggle; the keeper ranking and backend additions below.

## Design

### 1. Mode tab: "Duplicates"
- Add `{ key: 'duplicates', title: 'Duplicates', icon: <Copy size={18}/> }` to `frontend/src/components/SortingModeSelector.jsx` (react-feather is already a dependency).
- Add `.theme-duplicates` to `frontend/src/App.css` next to `.theme-find`: violet `#8b5cf6` / hover `#7c3aed` / rgb `139, 92, 246` / secondary `#c084fc`. Add it to the `themeClass` map in `App.jsx` (~L1669), and copy any `.theme-find` colour-conflict overrides that apply.
- In `App.jsx`, hide everything that makes no sense for a read-only scan when `operationMode === 'duplicates'`: the destination `PathSelector`, `OperationModeToggle`, `HierarchyToggle`, the footer's "Open destination" button, and the face enrollment shortcut. Show the subfolder ignore list exactly as hybrid/find already do: the `operationMode !== 'standard'` branches already cover this. Exclude duplicates from the metadata-overview effect (~L735), which already only runs for hybrid/find.
- Config panel: a new `DuplicateConfig.jsx` with a 3-option "Match strictness" control, styled like the existing `SortingOptions` choices:
  - Exact copies → `similarity_threshold: 0.98` (≤1 bit)
  - Near-identical (default) → `0.95` (≤3 bits)
  - Similar / burst shots → `0.85` (≤9 bits)
- Start button label: "Find Duplicates" (`getOperationName`, ~L1676).

### 2. Run flow (reuses existing plumbing)
- In `handleStartSorting` (~L1383), add a `duplicates` branch. It requires only `sourceFolder`; the current guard demands a destination, so make that guard mode-aware. Endpoint `/api/find-duplicates`, payload `{source_folder, ignore_list: ignoredSubfolders, similarity_threshold}`.
- The endpoint returns HTTP 200 with `status: "busy"` when another job is running. Handle it: log the message, `setIsProcessing(false)`, close the stream.
- Progress, log and abort already work: the scan reports through `update_status_callback` → `/api/stream-logs` SSE → `ProgressTracker`/`LogConsole`, and `/api/abort-process` sets the `duplicates` cancellation event.
- In the SSE final-status branch (~L1150, beside the Find & Group modal), when `operationMode === 'duplicates' && status === 'complete'`, fetch `/api/job-status` and open the review overlay with `duplicate_groups` and `duplicate_files`. With zero groups, show a "No duplicates found" message reusing the `FindGroupResultModal` empty-state style instead.
- Once the overlay is closed, a footer button, "Review duplicates (N groups)", reopens it from the results held in state.

### 3. Review overlay: two views, one shared state
New `frontend/src/components/DuplicateReview.jsx` + `.css`: a full-screen glass overlay that follows the existing `glass-modal-content` / `backdrop-filter` styling.

**Shared state:** `keeper[groupIndex] = fileIndex | 'all'`. It starts at 0 everywhere, because the backend already puts the best copy first. Both views read and write this same state, so switching views never loses a selection.

**Header:** "N groups · M extra copies · X MB reclaimable" (computed from `duplicate_files[path].bytes`) and a view toggle `[▤ List | ▣ One by one]`.

**Default view** (pure function, unit-tested):
`one-by-one` if `groups.length <= 12 || strictness === 'similar'`, otherwise `list`. The user can toggle either way at any time.

- **List view:** a scrollable card per group: "Group k · n photos · save Y MB · [Keep all]", then a row of thumbnails. The keeper gets a `★ KEEP` badge in the theme colour; the others get a dimmed `✕ Trash` badge. Under each thumbnail: `W×H`, size, parent folder name (full path in `title`). Click a photo to make it the keeper.
- **One-by-one view:** one group at a time with large previews, `[← Prev] [Keep all] [Next →]` and a "Group k of N" counter. Keys: `←/→` navigate, `1–9` set the keeper, `K` keeps all.
- **Footer (both views):** "Sent to Trash. You can restore them." plus `[Close]` and `[Move M files to Trash]`. The button is disabled when M = 0.
- Thumbnails: `<img loading="lazy" src={`${base}/api/thumbnail?path=${encodeURIComponent(p)}`}>`. If an image fails to load, show a neutral placeholder tile; the file stays selectable.

**Clean:** `ConfirmationModal`, "Move M files (X MB) to Trash?" → `apiCall('/api/delete-files', {file_paths, dry_run: false})`. The in-app confirmation replaces the agent's dry-run step. Afterwards, remove the cleaned groups from the overlay, log the summary, and if any files failed, keep those groups and mark the failed tiles with the error in `title`. If `use_trash === false` (send2trash missing), the confirmation says "permanently delete" instead.

**Safety:** `pathsToTrash` never includes a group's keeper, and `'all'` excludes the whole group. This is enforced in the pure helper and asserted in the test.

### 4. Pure helpers: `frontend/src/components/duplicateReview.js`
- `defaultView(groupCount, strictness)`
- `pathsToTrash(groups, keeper)` → string[]
- `reclaimBytes(groups, keeper, files)` → number
- `STRICTNESS = { exact: 0.98, near: 0.95, similar: 0.85 }`

Test: `duplicateReview.test.mjs` (plain `node:assert`, same as `announceGate.test.mjs`). It covers keeper never trashed, `'all'` excludes the group, the default-view boundaries (12/13, similar), and the byte sums.

### 5. Backend additions (`backend/main.py`)
- **Smart keeper:** after `_group_by_hash`, sort each group with `_keeper_rank`: most pixels → largest bytes → filename not matching ` copy` / ` (\d+)` before the extension → oldest mtime. The first entry stays the keeper, so the agent's `delete_duplicates` benefits with no contract change.
- **Per-file details:** while hashing in `run_find_duplicates_task.scan()`, record `{width, height, bytes, mtime}` for grouped files. Width and height come from the image `_phash` already decodes: have `_phash` (or a thin wrapper) also return `im.size`, and update `test_phash.py` if the signature changes. Store the details in the new `duplicate_files` job-state field, and add it to `current_job_state` and `_DUP_RESULT_RESET`. Set it before the status flips to complete, following the ordering rule noted at ~L874.
- **`GET /api/thumbnail?path=`:** return 403 unless `path` is in the current `duplicate_groups`; this stops any local webpage reading arbitrary images through localhost. Otherwise `load_upright` → `thumbnail((320, 320))` → JPEG bytes, run in `asyncio.to_thread`, with `Cache-Control: private, max-age=3600`. Return 404 if the file can't be decoded.
- `/api/delete-files` is reused unchanged.
- Tests: extend `backend/test_phash.py` with a `_keeper_rank` check (a bigger-resolution copy wins; a `"x copy.jpg"` loses a tie), and extend `test_api_smoke.py` check 5 to assert `duplicate_files` covers every grouped path and that `/api/thumbnail` returns 200 for a grouped path and 403 for a path outside the groups.

### 6. Polish
- `CHANGELOG.md` "Unreleased" entry (the changelog drives the release notes and the in-app update panel).
- The agent help text and Pro labelling stay as they are: the agent tools remain Pro, and the app feature is free.
- Skipped for now: a tutorial step for the new tab (add once the UI settles), per-group "identical vs similar" badges, and a "move to folder instead of Trash" option.

## Critical files
- `frontend/src/App.jsx`: mode wiring, start branch, SSE completion, overlay state
- `frontend/src/App.css`: `.theme-duplicates`
- `frontend/src/components/SortingModeSelector.jsx`: 4th tab
- new: `DuplicateConfig.jsx`, `DuplicateReview.jsx/.css`, `duplicateReview.js`, `duplicateReview.test.mjs`
- `backend/main.py`: keeper ranking, `duplicate_files`, `/api/thumbnail`
- `backend/test_phash.py`, `backend/test_api_smoke.py`

## Verification
1. `node frontend/src/components/duplicateReview.test.mjs`
2. `cd backend && venv/bin/python test_phash.py && venv/bin/python test_api_smoke.py`
3. Run the app (`npm run tauri dev`), switch to Duplicates, and scan a fixture folder holding an original, a byte copy, a resized copy, a rotated-EXIF copy and an unrelated photo:
   - with ≤12 groups the review opens one-by-one; Similar strictness opens one-by-one; toggling keeps selections;
   - the highest-resolution copy is pre-marked KEEP; Keep all excludes the group;
   - Move to Trash → the files appear in the OS Trash, the overlay updates and the log shows MB freed;
   - Abort mid-scan resets cleanly; starting a scan while another job runs shows the busy message.
4. The other three modes behave as before (destination, copy/move and hierarchy reappear).

## After approval (brainstorming → writing-plans handoff)
Save this design to `docs/superpowers/specs/2026-10-12-duplicate-finder-design.md` and commit only that file. Then invoke `superpowers:writing-plans` for the step-by-step implementation plan.
