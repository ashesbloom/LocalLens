# Changelog

All notable changes to Local Lens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
