# Local Lens v3.0.2 — GitHub Release Body

> **How to use this file:** the release workflow opens a **draft** release whose body is
> the `## [3.0.2]` section of `CHANGELOG.md` wrapped in a fixed Installation / macOS
> Security / Verification template. Paste everything below the line into that draft
> **above** the auto-generated `### Installation` heading, then publish. Keep the CI's
> installation, security and verification sections — they list the actual build assets.

---

## Three things that were broken for everyone, and the check that found them

This is a maintenance release. No new features — instead, three bugs that had one thing
in common: **they all worked perfectly on a developer's machine and failed for users.**

---

### Deleting duplicates on a network drive

If your photos live on a NAS or any Windows network share, deleting duplicates failed
for **every file**. What made it worse: the preview beforehand said it would succeed.
You confirmed a list of files, and then every one of them errored.

The preview and the real delete were resolving the path differently. A path like
`//server/photos` mixed with Windows separators is accepted by almost every Windows
API — including the one the preview used to check the files existed — but rejected by
the specific one that moves files to the Recycle Bin. Both now resolve paths the same
way, so a successful preview means a successful delete.

If you hit this, nothing was lost. The files were never touched.

### PDF report export

Listed as a known issue in 3.0.1. The PDF library was never included in the build, so
the feature could not work in any released version, while looking fine to anyone
running from source.

It is now included — and more importantly, **every release is now tested against the
packaged app rather than a developer machine**, which is the only way this class of bug
is visible at all.

### Auto-scheduling reported success it could not deliver

Creating a schedule in a released build returned "success" and then never ran anything.
The component that runs schedules is not part of the packaged app, so the schedule was
saved and simply never fired.

Local Lens now tells you plainly: the schedule is saved, but nothing in this build will
run it. Scheduling continues to work when running from source. We would rather tell you
a feature is unavailable than let you believe it is armed.

---

## Why three at once

Each of these was invisible to the build. The app compiled, started, and passed its
checks every time — because the only thing being checked was that it started.

This release adds a real gate that runs before any version can be tagged: it drives the
actual features end to end against the packaged application, verifies every dependency
the code imports is one the build actually ships, and confirms the release notes you are
reading right now were generated correctly. It found the PDF bug on its first run.

Nothing about it touches your photos or leaves your machine — it is a developer check,
and it is the reason this release exists.

---

## Upgrading

Nothing to do beyond updating. Your photos, enrolled faces, saved paths and schedules
are untouched. If you use the LocalLens Agent with Claude, it needs no changes.
