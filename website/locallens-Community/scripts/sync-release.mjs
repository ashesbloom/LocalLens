// Carries the released version out of the repo-root CHANGELOG.md and into the two
// places the site hard-codes it. Run by the release workflow after a tag, so nobody
// has to remember: the site builds from `community-site` while releases are cut on
// `main`, and before this existed the site simply kept showing the previous version.
//
// Checked with: node scripts/sync-release.test.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseChangelog } from '../src/data/changelog.js'

export const CHANGELOG = fileURLToPath(new URL('../../../CHANGELOG.md', import.meta.url))
export const VERSION_FILE = fileURLToPath(new URL('../src/data/version.js', import.meta.url))
export const HOME_FILE = fileURLToPath(new URL('../src/routes/Home.jsx', import.meta.url))

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// '2026-09-13' -> '13 Sep 2026', the shape Home.jsx already displays. Built by hand
// rather than with toLocaleDateString, which is locale- and ICU-dependent and would
// quietly render differently on the CI runner than it does here.
export function formatReleaseDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) throw new Error(`sync-release: unrecognised date '${iso}', expected YYYY-MM-DD`)
  const [, year, month, day] = m
  const name = MONTHS[Number(month) - 1]
  if (!name) throw new Error(`sync-release: month out of range in '${iso}'`)
  return `${Number(day)} ${name} ${year}`
}

// Replaces exactly one occurrence. A silent no-op here is the whole bug this script
// exists to prevent, so an unmatched — or ambiguous — pattern is a hard failure.
export function replaceOnce(source, pattern, replacement, label) {
  const matches = source.match(pattern)
  if (!matches) throw new Error(`sync-release: ${label} not found — the file's shape changed`)
  if (matches.length > 1) throw new Error(`sync-release: ${label} matched ${matches.length} times, expected 1`)
  return source.replace(pattern, replacement)
}

export function newestRelease(markdown) {
  const releases = parseChangelog(markdown)
  if (!releases.length) throw new Error('sync-release: CHANGELOG.md parsed to zero releases')
  return releases[0]
}

export function sync({ changelog = CHANGELOG, versionFile = VERSION_FILE, homeFile = HOME_FILE } = {}) {
  const release = newestRelease(readFileSync(changelog, 'utf8'))
  const date = formatReleaseDate(release.date)

  writeFileSync(versionFile, replaceOnce(
    readFileSync(versionFile, 'utf8'),
    /^export const APP_VERSION = '[^']*'$/m,
    `export const APP_VERSION = '${release.version}'`,
    'APP_VERSION in version.js',
  ))

  writeFileSync(homeFile, replaceOnce(
    readFileSync(homeFile, 'utf8'),
    /^const RELEASE_DATE = '[^']*'$/m,
    `const RELEASE_DATE = '${date}'`,
    'RELEASE_DATE in Home.jsx',
  ))

  // Read back rather than trusting the write: this runs unattended in CI, and the
  // failure it guards against is precisely "looked like it worked, shipped stale".
  const wroteVersion = /APP_VERSION = '([^']*)'/.exec(readFileSync(versionFile, 'utf8'))?.[1]
  const wroteDate = /RELEASE_DATE = '([^']*)'/.exec(readFileSync(homeFile, 'utf8'))?.[1]
  if (wroteVersion !== release.version) {
    throw new Error(`sync-release: version.js reads '${wroteVersion}' after writing '${release.version}'`)
  }
  if (wroteDate !== date) {
    throw new Error(`sync-release: Home.jsx reads '${wroteDate}' after writing '${date}'`)
  }

  return { version: release.version, date }
}

// Only act when run directly, so the test can import the pieces without side effects.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { version, date } = sync()
  console.log(`sync-release: site pinned to v${version} (${date})`)
}
