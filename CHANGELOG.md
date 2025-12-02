# Changelog

All notable changes to Local Lens will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
