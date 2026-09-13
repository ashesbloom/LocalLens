// Run with: node scripts/sync-release.test.mjs
// Guards the failure this script was written for: the site quietly shipping the
// previous release's version because nothing carried the new one across branches.
// Works on copies in a temp dir, never on the real source files.
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { sync, formatReleaseDate, replaceOnce, newestRelease } from './sync-release.mjs'

// --- date formatting -------------------------------------------------------
assert.equal(formatReleaseDate('2026-09-13'), '13 Sep 2026', 'day must lose its leading zero')
assert.equal(formatReleaseDate('2026-08-01'), '1 Aug 2026', 'single-digit day')
assert.equal(formatReleaseDate('2026-12-31'), '31 Dec 2026', 'December must map to the last month')
assert.throws(() => formatReleaseDate('13-09-2026'), /unrecognised date/, 'a non-ISO date must not pass')
assert.throws(() => formatReleaseDate('2026-13-01'), /month out of range/, 'month 13 must not pass')

// --- replaceOnce is strict on purpose --------------------------------------
assert.throws(
  () => replaceOnce('nothing here', /^const X = '.*'$/m, "const X = 'y'", 'X'),
  /not found/,
  'a missing pattern must fail rather than no-op',
)
assert.throws(
  () => replaceOnce("a = '1'\na = '2'", /^a = '.*'$/gm, "a = '3'", 'a'),
  /matched 2 times/,
  'an ambiguous pattern must fail rather than guess',
)

// --- newestRelease ---------------------------------------------------------
assert.throws(() => newestRelease('# Changelog\n\nnothing\n'), /zero releases/, 'an empty changelog must fail')

// --- the real thing, end to end, on copies ---------------------------------
const dir = mkdtempSync(path.join(tmpdir(), 'sync-release-'))
try {
  const changelog = path.join(dir, 'CHANGELOG.md')
  const versionFile = path.join(dir, 'version.js')
  const homeFile = path.join(dir, 'Home.jsx')

  writeFileSync(changelog, [
    '# Changelog', '', '## [Unreleased]', '',
    '## [9.2.0] - 2027-01-05', '### Added', '', '- something new', '',
    '## [9.1.0] - 2026-11-02', '### Fixed', '', '- something fixed', '',
  ].join('\n'))
  writeFileSync(versionFile, "// header\nexport const APP_VERSION = '0.0.1'\n")
  writeFileSync(homeFile, "// header\nconst RELEASE_DATE = '1 Jan 1970'\n\nexport default function Home() {}\n")

  const result = sync({ changelog, versionFile, homeFile })

  assert.equal(result.version, '9.2.0', 'must take the newest release, not the oldest')
  assert.equal(result.date, '5 Jan 2027')
  assert.match(readFileSync(versionFile, 'utf8'), /APP_VERSION = '9\.2\.0'/)
  assert.match(readFileSync(homeFile, 'utf8'), /RELEASE_DATE = '5 Jan 2027'/)

  // [Unreleased] has no date, so it must never be mistaken for the newest release.
  assert.doesNotMatch(readFileSync(versionFile, 'utf8'), /Unreleased/)

  // Surrounding content must survive untouched.
  assert.match(readFileSync(homeFile, 'utf8'), /export default function Home/)

  // Running twice must be a no-op, since CI may re-run a release job.
  const again = sync({ changelog, versionFile, homeFile })
  assert.deepEqual(again, result, 'a second run must produce the same result')

  // A file that no longer has the expected line must fail loudly, not silently pass.
  writeFileSync(versionFile, '// someone refactored this away\n')
  assert.throws(
    () => sync({ changelog, versionFile, homeFile }),
    /APP_VERSION in version\.js not found/,
    'a renamed constant must fail the release, not ship stale',
  )
} finally {
  rmSync(dir, { recursive: true, force: true })
}

console.log('sync-release: ok')
