# Changelog

All notable changes to Local Lens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.0.1] - 2026-08-18

### Fixed

- **Finding duplicate photos now works.** The feature has never worked in any released version — asking the agent to find duplicates always failed, because a library it needed was never included in the build. It no longer needs that library at all, so it works everywhere.
- **Duplicate scans no longer time out on large libraries.** The scan used to run inside a single request and gave up on big archives. It now runs in the background with live progress, and can be cancelled part-way like any other job.
- **Rotated photos are now recognised as duplicates.** A photo straight off your phone and the same photo re-exported by another app are stored differently even though they look identical, and duplicate detection used to miss the pair entirely. It now reads them the way your photo viewer does, so they match.
- **RAW photos are included in duplicate scans** (DNG, CR2, NEF, ARW and friends), using the same reader the rest of LocalLens already uses. Anything that genuinely can't be read is reported as skipped rather than passed over silently.
- **Error messages no longer tell your AI assistant to run installer commands.** When a feature is missing from a build, LocalLens said "run pip install ..." — advice that cannot work against a packaged app, and which sent at least one person on a long detour. It now says plainly that the build is missing a component and to update the app.

### Known issues

- PDF report export is still unavailable in released builds — the same missing-from-the-build cause, tracked separately.

## [3.0.0] - 2026-08-13
### Added

- **LocalLens AI Agent**: LocalLens now talks to Claude Desktop, so you can organize your photos by asking in plain English — sort by who's in them, pull every shot from a place and year, find duplicates, or set a folder to sort itself. Nothing uploads: the agent runs on your machine and only ever reaches LocalLens at 127.0.0.1. Set it up from the bell icon, or from the panel on first launch.
- **Privacy panel**: a new "what we store" view lists every file LocalLens keeps on your machine and what (if anything) ever leaves it, with one-click buttons to erase the photo index or your AI profile.
- Every Pro feature is unlocked for everyone while the agent is in free preview — install now and it stays free for you.

### Fixed

- **Face recognition accuracy**: enrollment and sorting used to process photos differently, which could silently file photos of enrolled people under "Unknown Faces." Both now share one pipeline and detect sideways or tilted photos — People sorts are also considerably faster, running in parallel with results cached across re-sorts.
- **Ignored subfolders**: a subfolder marked "ignore" was not fully excluded if it contained its own subfolders — nested content could still be scanned and sorted. Ignored folders are now excluded completely, contents included.
- **Permanent deletions**: duplicate-photo deletion always permanently removed files — the code to send them to the Trash/Recycle Bin instead already existed but the required package was never bundled. It's now included, so deletions are safe by default.

### Changed

- People sorts on macOS now share disk blocks between copies of the same photo instead of duplicating it for every matched person, freeing up real space on nearly-full drives.
- Enrollment now accepts every photo format LocalLens can already sort (HEIC, RAW, etc.), not just JPG/PNG.
- The scheduler dashboard's Start/Stop/Restart controls are disabled for now — manage the background scheduler from the LocalLens Agent tray app instead. This also fixes duplicate backend processes piling up over time.

## [2.5.1] - 2026-07-24

### Fixed

- **Windows Console Bug**: Fixed PyInstaller one-file spec configuration setting `console=False`. This eliminates the visible console window when starting the backend server on Windows, and prevents the backend from dying when the terminal is closed.

## [2.5.0] - 2026-07-23
### Added

- **MCP Backend Discovery**: On first launch, Local Lens now writes `install_info.json` to the platform app-data directory (`~/Library/Application Support/LocalLens/` on macOS, `%APPDATA%\LocalLens\` on Windows). This lets companion tools such as the LocalLens MCP agent tray app locate and start the `backend_server` sidecar directly — without a Python environment or hardcoded install paths.
- **MCP Agent Groundwork (Internal)**: Scaffolded a standalone MCP server inside `locallens_mcp_agent/` to enable future local chat tooling. Added `/api/stats` diagnostics endpoint and port-file export to `APP_DATA_DIR/port.txt` for local tool clients.

## [2.4.1] - 2026-07-12

### Fixed

- **Critical Data Loss**: Fixed cross-drive MOVE permanently deleting ignored subfolders. When a MOVE was performed across different drives with a non-empty ignore list, ignored folders were correctly skipped during the copy but then destroyed by a blanket `shutil.rmtree()` when the source was removed — bypassing the Recycle Bin with no undo. The deletion is now ignore-aware and only removes what was actually copied.
- Fixed silent fallthrough bug where sort method names sent in lowercase by the frontend (e.g. `location`, `people`) did not match the expected title-case values, causing files to be sorted by the default method instead of the one selected.

## [2.3.0] - 2026-04-03

### Fixed

- Fixed critical backend crash on macOS Apple Silicon (M-series) caused by `numpy` dependency incompatibility.
- Resolved Tauri auto-updater code signing failures during the build process.
- Hardened PyInstaller build spec to properly bundle native C-extensions.

### Added

- Added background backend smoke tests in CI/CD pipeline to verify build integrity prior to packaging.

## [2.2.1] - 2025-12-31

### Added

- **Homebrew Cask Support**: macOS users can now install via `brew install ashesbloom/locallens/local-lens`
  - Homebrew automatically handles Gatekeeper - no manual steps needed
  - Auto-generated cask formula included in each release
- **macOS Gatekeeper Fix Script**: `Fix_Local_Lens.command` included in releases
  - Double-click to automatically remove quarantine, apply ad-hoc signature, and set permissions
  - Supports both `/Applications` and `~/Applications` install locations
- Improved release notes with clear macOS installation instructions

### Changed

- Updated README with Quick Install section for all platforms
- Release workflow now generates Homebrew cask formula automatically
- Enhanced macOS installation documentation with multiple fix options

### Fixed

- Fixed macOS "App is damaged" error by providing proper workarounds
- Fixed path escaping issues in terminal commands (use quotes instead of backslashes)

## [2.2.0] - 2025-12-24

### Added

- **macOS Support (Apple Silicon)**: Full native support for M1/M2/M3 Macs
  - DMG installer for easy installation
  - Auto-updater support for macOS
- **Cross-Platform GitHub Actions**: Automated CI/CD builds for both Windows and macOS
- Custom save preset modal dialog (replaces browser prompt that didn't work on macOS)
- Health check endpoint for reliable backend startup detection

### Changed

- **macOS Build Architecture**: 
  - PyInstaller now uses one-folder mode on macOS for faster startup (avoids extracting 140MB on every launch)
  - Smart wrapper script detects development vs production environment
  - Backend bundle stored in app Resources folder
- RAW image processing now uses ImageMagick (Wand) on macOS/Linux instead of rawpy
- Improved backend startup with retry logic and health checks
- Updated Tauri configuration for cross-platform resource handling

### Fixed

- Fixed "With Others" folder incorrectly created when photos only contained unknown faces
- Fixed face enrollment not loading on app startup
- Fixed save preset dialog not appearing on macOS (Tauri doesn't support browser `prompt()`)
- Fixed multiprocessing freeze issue in PyInstaller builds (added `freeze_support()`)
- Fixed sidecar executable not found in macOS .app bundle

### Technical Notes

- Python 3.11 required (dlib compatibility)
- macOS users: First launch requires right-click → Open to bypass Gatekeeper
- Windows build process unchanged - existing installations will auto-update normally

## [2.1.0] - 2025-12-16

### Added

- Tutorial and walkthrough for new users.
- Support for more RAW image formats on macOS and Linux via ImageMagick.
- Dynamic logic in the build process to handle backend executables for different OS and architectures.

### Changed

- Replaced deprecated `pkg_resources` with `setuptools<81` for `face_recognition_models`.

### Fixed

- Critical bug with 'Find and Group' dialog not showing correct information.
- App crash when selecting a preset with a missing folder path.

## [2.0.6] - 2025-12-04

### Added

- Delete button for saved presets in the preset manager

### Fixed

- Fixed crash when selecting a preset with deleted/missing folder paths (now shows error dialog)
- Fixed 'Find & Group' result dialog showing incorrect information after operation completion

### Changed

- 'Find & Group' mode now always copies files (removed Copy/Move toggle to prevent data loss)

## [2.0.2] - 2025-12-03

### Fixed

- Fixed code signing configuration for auto-updates (regenerated keys)

## [2.0.1] - 2025-12-03

### Fixed

- Fixed incorrect version number displayed in update notification panel

## [2.0.0] - 2025-12-02

### Added

- In-app auto-update notifications with release notes display

### Changed

- 'Find and Group' operation now always copies files (removed copy/move toggle to prevent confusion)
- Backend now uses consistent port instead of random port selection for reliable Tauri frontend connection
- Optimized package dependencies for better performance and reduced size
- Added detailed production build instructions to documentation

### Fixed

- Fixed 'Find and Group' dialog/terminal not displaying correct information after operation completion

---

<!-- 
HOW TO ADD RELEASE NOTES:

When releasing a new version, add a new section at the top following this format:

## [X.Y.Z] - YYYY-MM-DD

### Added

- New features

### Changed

- Changes to existing functionality

### Fixed

- Bug fixes

### Removed

- Removed features

The GitHub Actions workflow will automatically extract the notes for the 
version being released and include them in the update notification.
-->
