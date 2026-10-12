# Local Lens v3.2.0 — GitHub Release Body

> **How to use this file:** the release workflow opens a **draft** release whose body is
> the `## [3.2.0]` section of `CHANGELOG.md` wrapped in a fixed Installation / macOS
> Security / Verification template. Paste everything below the line into that draft
> **above** the auto-generated `### Installation` heading, then publish. Keep the CI's
> installation, security and verification sections — they list the actual build assets.
> The images load from `main`, so push `main` before publishing.

---

## Keep one copy of every photo.

A memory card, a phone backup, a folder of exports: most photo collections end up holding
the same picture three times, under three names, in three sizes. **v3.2.0 finds those
copies, keeps the best one, and stops new ones getting in.** It all runs on your machine,
like everything else in Local Lens, and it's free for everyone.

---

## Duplicates tab

Pick a folder and Local Lens finds copies of the same photo, even when they've been
resized, re-exported, renamed or rotated. For each group it picks the copy worth
keeping (the RAW original, then the most pixels, then the least compression) and you
check its choice before anything moves. Extras go to the Trash, so nothing is lost for
good.

<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/Preview/v3.2.0/duplicates-scan-review.gif?raw=true" alt="Scanning a folder for duplicates, then reviewing each group one by one and as a list" width="860"/>
</p>
<p align="center">
    <em>Scan · review one group at a time or all at once · the best copy is pre-selected</em>
</p>

Choose how strict the match is: **Exact copies**, **Near-identical** (the default,
which also catches resized and re-exported copies), or **Similar shots** for bursts.

---

## Compare a card with your library

Set **Compare with folder** and Local Lens checks a memory card against the library
you already have. Photos you already own are shown next to their library copy, which
is locked so it can never be removed. Clear them off the card in one click, then import
only the new photos, sorted by date, place or people, or as they are.

<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/Preview/v3.2.0/compare-with-folder.gif?raw=true" alt="Comparing a memory card with a photo library, then importing only the new photos" width="860"/>
</p>
<p align="center">
    <em>3 of 12 already in the library · the 9 new ones go straight into a sort</em>
</p>

---

## Skip duplicates while sorting

A new switch under **Duplicates** in Standard and Hybrid sorts leaves out photos that
are already in the destination, and extra copies inside the source. It is off unless you
turn it on for that sort. Skipped photos are never touched. After a Move, Local Lens
tells you how many it skipped and asks what to do with them: review them, move them to
the Trash, or leave them where they are.

<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/Preview/v3.2.0/skip-duplicates.gif?raw=true" alt="Turning on Skip duplicates, running a Move, and choosing what happens to the 7 skipped photos" width="860"/>
</p>
<p align="center">
    <em>5 photos moved, 7 duplicates skipped and left on the card</em>
</p>

---

## Replies to your community posts

Post on the [community forum](https://locallens-community.pages.dev) from a browser
Local Lens opened, and replies come back to the app: in the bell, as a count on the app
icon, and as a system notification when Local Lens is in the background. There's no
account. The app and the forum share a random key that is stored only as a hash.

<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/Preview/v3.2.0/community-replies.png?raw=true" alt="The bell panel showing two replies to the user's community post" width="420"/>
</p>

---

## A short tour of what's new

After you update, Local Lens shows this release's new features once, right where they
live in the app. They stay in the tutorial menu afterwards, marked **New**.

<p align="center">
    <img src="https://github.com/ashesbloom/LocalLens/blob/main/assets/Preview/v3.2.0/whats-new-tour.png?raw=true" alt="The what's-new tour pointing at the Skip duplicates switch" width="760"/>
</p>

---

## Also in this release

- Errors you can act on: sorting problems open a message that says how to fix them, and
  a drive that can't be changed (such as a Windows drive on a Mac) is caught before a
  Move starts instead of after.
- Repeat duplicate scans are much faster. Photo fingerprints stay on this device, and
  **Erase photo index** in the privacy panel clears them.
- Each Browse button remembers its own folder, and hovering a folder shows its full path.

The full list is in the release notes below.

---

## Upgrading

Existing users get the in-app update notification as usual, or can download the
installer below. Nothing to migrate: your presets, enrolled faces and settings carry
over.
