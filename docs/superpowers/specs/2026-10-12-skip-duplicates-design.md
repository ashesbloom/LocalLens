# Skip duplicates when sorting (duplicates sub-project 3 of 3)

## Context

Sub-projects 1 (Find & Clean) and 2 (Compare with folder) are built. Both are review-first: the user sees every group before anything changes. This sub-project adds an opt-in shortcut to the sort itself. When it is on, a Standard or Hybrid sort leaves out photos that are already in the destination, and extra copies inside the source.

Decisions made with the user:
- **Both kinds:** skip a source photo whose match is already in the destination, and for copies inside the source sort only the best one.
- **Strictly opt-in:** off by default and **not remembered** between sorts. Nothing is skipped unless the user turns it on for that sort. With it off, the sort does exactly what it does today, with no extra hashing.
- **Move mode asks afterwards:** skipped photos are never touched during the sort. When a Move finishes with skips, the completion dialog asks what to do with them: Leave them, Move to Trash, or Review them.

## Design

### 1. Toggle (frontend)
- A "Skip duplicates" switch sits under the Output Folder Structure toggle in Standard and Hybrid modes. Find & Group and Duplicates don't have it.
- State is `skipDuplicates`, `useState(false)`, with no `localStorage`.
- Description: "Leave out photos already in the destination, and extra copies inside the source (the best copy is sorted)."
- The start payload adds `sorting_options.skip_duplicates: true` only when the switch is on.

### 2. Backend: decide before anything is written
- `SortOptions.skip_duplicates: Optional[bool] = False`.
- In `run_organization_task`, before `process_photos`, if `skip_duplicates` is set:
  - **Source files:** `config["specific_files"]` when present (an import), otherwise the source is walked with `effective_ignore_set(source, dest, ignore_list)`. Links are skipped as in `_collect_images`.
  - **Destination files:** the destination is walked with the source subtree excluded, so a source inside the destination never matches itself. It gets its own inode set, so a hard link between the two still counts as "already there".
  - **Hashing:** both sides go through the shared helper `_hash_files(files, cancel_event, progress)`, which is extracted from the duplicate scan's loop. It uses the fingerprint cache and checks Abort per file. Progress reads "Checking for duplicates… n/N".
  - **Planning:** `_plan_skips(source_files, dest_set, file_hashes, file_info, max_distance=3)` is pure:
    - One `_group_by_hash` runs over both sides.
    - If a group contains a destination file, every source file in it is skipped.
    - Otherwise the group's source files are ranked by `_keeper_rank`, the first is kept and the rest are skipped.
    - Unreadable source files are always kept (sorted as normal), so nothing is silently left behind.
  - **Handing over:** `config["specific_files"]` = the source files minus the skipped ones. The sort only ever sees this list.
    - With `specific_files`, a Move uses the per-file path, never copy-everything-then-delete-the-source. So skipped photos stay exactly where they are, in Copy or Move. `organizer_logic.py` is unchanged.
  - `total_files` is updated to the kept count.
- **Matching:** always Near-identical (`max_distance = 3`, the 0.95 default). Similar/burst matching is deliberately not offered, because skipping automatically at that level would drop different shots.
- **Job state:**
  - A new field, `skipped_duplicates: [source paths]`, is added to `_DUP_RESULT_RESET` and set before any terminal status.
  - The "complete" message gets " N duplicates skipped." appended.
  - If every photo is skipped, `process_photos` is not run. The job completes with "All N photos are already in the destination or duplicated in the source; nothing to sort."
- **Abort** during the duplicate check raises `OperationAbortedError` → "aborted", with nothing written.

### 3. After a Move: ask (frontend)
- **When:** on "complete" in Standard/Hybrid Move mode, the app fetches `/api/job-status`. If `skipped_duplicates` is non-empty, `MoveCompleteModal` opens in its skipped variant.
- **Text:** "N duplicates were skipped. They're still in <source>."
- **Buttons:**
  - **Review them:** switches to the Duplicates tab with Source = source and Compare-with = destination, then starts the comparison. The sub-project 2 review opens as it is (Trash from source; the destination is locked). The Review button is hidden when one folder contains the other, because compare refuses that.
  - **Move to Trash:** the first click turns the button into "Confirm: move N to Trash". The second click calls `/api/delete-files` (`dry_run: false`) and logs the result. Failures go through `showProblem`.
  - **Leave them:** closes.
- **The source isn't cleared afterwards:** in the skipped variant the source field is kept, because photos are still there (or are under review). The normal "source is now empty" variant is unchanged.
- **Copy mode:** no dialog. The skipped count is in the finish message.

### Out of scope
- The skip flag for the scheduler and the Claude agent.
- A choice of match strictness for the skip.
- Skipping in Find & Group.

## Files
- **Backend:**
  - `backend/main.py`: `SortOptions` field, `_hash_files` (extracted), `_plan_skips`, the pre-sort step in `run_organization_task`, `skipped_duplicates` in the job state;
  - `backend/test_skip_duplicates.py` (new).
- **Frontend:**
  - `App.jsx`: state, payload, completion fetch, modal wiring, review handoff;
  - `components/SkipDuplicatesToggle.jsx` (new; reuses the HierarchyToggle classes);
  - `components/MoveCompleteModal.jsx`: skipped variant.
- `CHANGELOG.md`: one Added line.

## Verification
- **`test_skip_duplicates.py`:**
  - `_plan_skips`: a cross match is skipped, the best in-source copy is kept, an unreadable file is kept, no groups means nothing is skipped.
  - A real `run_organization_task` on fixtures, Move with the flag on: the skipped files are still in the source, the destination gains only the kept files, and `skipped_duplicates` is correct.
  - The same run with the flag off matches today's behaviour.
  - Abort during the check: aborted, nothing written.
- **Existing tests:** `test_phash`, `test_phash_cache`, `test_import_files`, `test_specific_files_move`, `test_library_compare` (if present).
- **Frontend:** `npm run build`.
- **Manual (Tauri):** Move a folder containing a copy of a photo already in the destination, with the toggle on. The dialog shows "1 duplicate was skipped". Try Review, Trash and Leave.
