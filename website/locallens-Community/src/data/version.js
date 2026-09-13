// Single source of truth for the shipped version number. Imported by the header, the
// status bar boot line, and the `version` command — never hard-code the version elsewhere.
// Written by scripts/sync-release.mjs from the newest CHANGELOG.md entry; edit that file
// or the changelog, not this line.
export const APP_VERSION = '3.1.0'
