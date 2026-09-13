// Plain node:assert check, no framework. Run via `node src/data/changelog.test.mjs`.
// Parses the REAL repo CHANGELOG.md off disk and pins known-true facts about it — a test
// that re-derives the parser's own logic proves nothing (task-4-brief.md).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseChangelog } from './changelog.js'
import { APP_VERSION } from './version.js'

const CHANGELOG_PATH = fileURLToPath(new URL('../../../../CHANGELOG.md', import.meta.url))
const markdown = readFileSync(CHANGELOG_PATH, 'utf8')
const releases = parseChangelog(markdown)

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- newest release ---
// Pinned to APP_VERSION rather than a literal: the site's header and its announcement
// page read from these two sources separately, and the whole point of the check is that
// they agree. A literal here would instead break on every release, which is how the
// previous version of this test behaved and why the site shipped a stale version.
check(
  releases[0].version === APP_VERSION,
  `newest parsed release (${releases[0].version}) must match APP_VERSION (${APP_VERSION}) — run scripts/sync-release.mjs`,
)

// --- 3.0.2 specifically, found by lookup so it stays true as releases are added ---
const release302 = releases.find((r) => r.version === '3.0.2')
check(!!release302, '3.0.2 must be present')
check(release302.date === '2026-08-22', '3.0.2 must be dated 2026-08-22')

const fixed302 = release302.sections.find((s) => s.heading === 'Fixed')
check(!!fixed302, '3.0.2 must have a Fixed section')
check(fixed302.items.length === 3, `3.0.2's Fixed section must have exactly 3 items, got ${fixed302.items.length}`)

// --- [Unreleased] must never surface as a release ---
check(
  releases.every((r) => r.version !== 'Unreleased'),
  '[Unreleased] must not appear in the parsed output',
)

// --- oldest parsed release ---
// task-4-brief.md's own worked example says the oldest parsed release is 2.2.0 — but the
// real repo CHANGELOG.md (read live above, not assumed) has six further releases below
// that, down to 2.0.0. Per the brief's own instruction to "parse what is actually there,
// not what you expect," this test is pinned to the real file's actual oldest release
// rather than the brief's stale example. See task-4-report.md, Decisions, for the writeup.
// A floor, not an exact count — the exact count was another value that broke on every
// release. The duplicate check keeps the original intent: catching a parser that drops
// or double-counts entries.
check(releases.length >= 14, `expected at least 14 parsed releases in the real file, got ${releases.length}`)
check(
  new Set(releases.map((r) => r.version)).size === releases.length,
  'parsed releases must all have distinct versions',
)
check(
  releases[releases.length - 1].version === '2.0.0',
  `oldest parsed release must be 2.0.0, got ${releases[releases.length - 1].version}`,
)

// --- the HTML-comment footer (after the file's `---` divider) must not leak in ---
// It contains a literal example bullet list under ### Added/Changed/Fixed/Removed headers
// that, unguarded, would attach onto whatever release was still "current" when the parser
// reached it (2.0.0, the real last release before the divider).
const release200 = releases.find((r) => r.version === '2.0.0')
const added200 = release200.sections.find((s) => s.heading === 'Added')
check(
  !added200.items.some((i) => i.runs.some((r) => r.value === 'New features')),
  'the footer HTML comment\'s example bullets must not leak into 2.0.0',
)
check(
  !release200.sections.some((s) => s.heading === 'Removed'),
  'the footer HTML comment\'s example "Removed" section must not leak into 2.0.0',
)

// --- inline bold produces a strong run, not literal asterisks ---
const firstNote = fixed302.items[0]
const strongRun = firstNote.runs.find((r) => r.type === 'strong')
check(!!strongRun, 'a bullet with **bold** text must produce a strong run')
check(
  strongRun.value === 'Deleting duplicates works on network drives again.',
  'the strong run must carry the bold text without the ** markers',
)
check(
  !firstNote.runs.some((r) => r.value?.includes('**')),
  'no run may contain literal ** — the bold markers must be consumed, not left in the text',
)

// --- nested sub-bullets in 2.2.1 survive ---
const release221 = releases.find((r) => r.version === '2.2.1')
check(!!release221, '2.2.1 must be present')
const added221 = release221.sections.find((s) => s.heading === 'Added')
const homebrewItem = added221.items.find((i) => i.runs.some((r) => r.value === 'Homebrew Cask Support'))
check(!!homebrewItem, "2.2.1's Homebrew Cask Support item must be present")
check(
  homebrewItem.children.length === 2,
  `Homebrew Cask Support must have 2 nested sub-bullets, got ${homebrewItem.children.length}`,
)
check(
  homebrewItem.children[0].runs.map((r) => r.value).join('') ===
    'Homebrew automatically handles Gatekeeper - no manual steps needed',
  'the first nested sub-bullet text must survive intact',
)

console.log(`ok — changelog.test.mjs (${checks} checks)`)
