# Changelog

All notable changes to Local Lens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
