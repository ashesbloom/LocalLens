# Local Lens — Agent Rules

## Release Process: How to Cut a New Version

When asked to commit, release, or bump the version of Local Lens, follow
this checklist exactly. Every step is mandatory unless the release type
explicitly makes one irrelevant (e.g. a docs-only release skips version bumps).

---

### 1. Determine the Release Type

| Type | When | Version bump |
|---|---|---|
| **Patch** (x.y.Z) | Bug fixes, no new features, no breaking changes | +0.0.1 |
| **Minor** (x.Y.0) | New user-facing features, backward-compatible | +0.1.0, reset Z→0 |
| **Major** (X.0.0) | Breaking changes or architectural overhauls | +1.0.0, reset Y,Z→0 |

Current version is always found in **four places** (they must always match):
- `frontend/src-tauri/tauri.conf.json` → `"version"`
- `frontend/src-tauri/Cargo.toml` → `version = "..."`
- `frontend/package.json` → `"version"`
- `backend/main.py` → `APP_VERSION = "..."`

---

### 2. Stage ONLY the Release Files

The working tree often has in-progress, unrelated changes. **Never do a
blanket `git add -A`**. Stage only:

```bash
git add backend/organizer_logic.py        # or whichever source files changed
git add backend/main.py                   # APP_VERSION must match the new version
git add CHANGELOG.md
git add frontend/src-tauri/tauri.conf.json
git add frontend/src-tauri/Cargo.toml
git add frontend/package.json
```

Always verify before committing:
```bash
git diff --cached --stat    # must show ONLY the expected files
git diff HEAD               # confirm unrelated work remains unstaged
```

---

### 3. Update CHANGELOG.md — The Single Source for Both Release Notes

The `## [X.Y.Z]` section you write in CHANGELOG.md is extracted by the CI
and used in **two separate places simultaneously**:

```
CHANGELOG.md  ──awk──►  steps.release_notes.outputs.notes
                                │
                    ┌───────────┴────────────┐
                    ▼                        ▼
            latest.json "notes"       GitHub Release body
            (Tauri auto-updater)      (releases page on GitHub)
                    │
                    ▼
          In-app update notification
          shown to existing users
```

Because the exact same text feeds both, write it so it works for both:

- **For the in-app notification**: text must be short, plain, and user-friendly.
  Users see a small popup — avoid markdown tables, long code blocks, or walls of
  text. Two to five bullets maximum.
- **For the GitHub release page**: needs enough context so a reader arriving at
  the release page understands what changed and why they should update.

**Format** (`## [X.Y.Z]` header is consumed by awk and NOT included in notes):

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Fixed

- **Critical Data Loss**: One user-facing sentence describing impact and fix.
- Short description of secondary fix.

### Added

- Short description of new user-visible feature.

### Changed

- Notable behaviour change.
```

**Rules:**
- Use **title-case headings**: `### Fixed`, `### Added`, `### Changed`, `### Removed`
- Lead critical/data-loss items with bold impact label: `**Critical Data Loss**: ...`
- Keep each bullet to 1–2 sentences max — the in-app popup has limited space
- Insert between `[Unreleased]` and the previous version section
- Do NOT leave an extra blank line between `## [X.Y.Z]` and `### Fixed`
- Do NOT write installation instructions or asset tables — CI appends those automatically

---

### 4. Update the Changes Dev Log

`Changes` (repo root, no extension) is the internal developer log.
Format: `# DD-MM-YY >` (two-digit day, two-digit month, two-digit year).

**Prepend** a new entry at the very top:

```
# DD-MM-YY >
    - Critical Fix: One-line summary.
    - Bug Fix: One-line summary.
    - Feature: One-line summary.

:: Effected Files
    - path/to/file.py
    - path/to/other.py

---

# (previous entry follows)
```

---

### 5. Bump All Four Version Files

Edit all four atomically (same commit). Replace old version with new:

| File | Key |
|---|---|
| `frontend/src-tauri/tauri.conf.json` | `"version": "X.Y.Z"` |
| `frontend/src-tauri/Cargo.toml` | `version = "X.Y.Z"` |
| `frontend/package.json` | `"version": "X.Y.Z"` |
| `backend/main.py` | `APP_VERSION = "X.Y.Z"` |

> **Why backend/main.py matters**: `APP_VERSION` is returned in the FastAPI `/health` response
> and embedded in diagnostic reports. A stale value here means the in-app updater can
> surface the wrong "current version" label and confuse update detection. It was
> forgotten during v2.4.1 — do not skip it.

---

### 6. Commit with Conventional Commit Format

```
git commit -m "<type>(<scope>): <short imperative summary>

<longer body: what the problem was, what was changed and why>

Reported/Requested: <source if known>. Bump to vX.Y.Z."
```

**Types:** `fix`, `feat`, `refactor`, `chore`, `docs`, `build`, `ci`
**Scope** (optional): `backend`, `frontend`, `ci`, `docs`

Example for a critical patch:
```
fix(backend): prevent data loss on cross-drive move with ignore list

When performing a MOVE across different drives with a non-empty ignore
list, shutil.rmtree(source_dir) permanently deleted ignored subfolders
that were never copied to the destination.

Reported by user via email. Bump to v2.4.1.
```

---

### 7. Tag and Push

```bash
git tag vX.Y.Z
git push origin main
git push origin vX.Y.Z
```

The `push tag` triggers the CI/CD pipeline in `.github/workflows/release.yml`
which automatically:
1. Builds macOS (Apple Silicon) and Windows installers
2. Runs a backend smoke test
3. Extracts release notes from CHANGELOG.md (awk on `## [X.Y.Z]` section)
4. Generates `latest.json` for the Tauri auto-updater
5. Generates the Homebrew cask formula (`local-lens.rb`)
6. Creates a **draft** GitHub Release — must be reviewed and published manually

---

### 8. Post-Release Checklist

- [ ] GitHub Release draft → review release body → **Publish**
- [ ] Verify Homebrew tap picks up the new cask formula
- [ ] Verify `latest.json` in the release assets has correct signatures
- [ ] **Verify `latest.json` `darwin-aarch64.url`** points to a real file: `curl -sI <url> | head -1` must return `HTTP/2 200` (not 404). The filename must match what Tauri produced (e.g. `Local.Lens_X.Y.Z_aarch64.app.tar.gz`).
- [ ] Confirm in-app auto-updater notification shows for existing users
- [ ] Confirm `APP_VERSION` in `backend/main.py` matches the release tag (check `/health` endpoint or the About section)

---

### What the CI Generates Automatically (Do NOT write manually)

| Artifact | Source |
|---|---|
| GitHub Release body (installation/security section) | Static template in `release.yml` lines 542–588 |
| Release notes section in GitHub body | Extracted from `CHANGELOG.md` by awk |
| `latest.json` | Generated by `jq` in `release.yml` |
| `local-lens.rb` (Homebrew cask) | Generated in `release.yml` |
| SHA256 checksums | Generated from build artifacts |

You only need to write the `## [X.Y.Z]` CHANGELOG section.
The CI appends the installation instructions, security notes, and asset table automatically.

---

### Files That Are Part of Every Release Commit

```
CHANGELOG.md
backend/main.py                          ← APP_VERSION bump (MANDATORY)
frontend/src-tauri/tauri.conf.json
frontend/src-tauri/Cargo.toml
frontend/package.json
<source files that contain the actual changes>
```

### Files That Are NOT Part of a Release Commit

```
Changes                    (intentionally gitignored — local developer log only, NEVER stage)
backend/test_*.py          (test files — commit separately or not at all)
backend/scheduler_daemon.py
backend/templates/
.gitignore
frontend/src-tauri/Cargo.lock   (only if Cargo deps didn't change)
locallens_mcp_agent/
```

> **Note**: `backend/main.py` was previously listed here with a "WIP" caveat. That was
> wrong — `APP_VERSION` inside it **must** be bumped on every release. Stage the version
> line even if the rest of `main.py` has unrelated WIP; only the `APP_VERSION` line
> needs to change.
