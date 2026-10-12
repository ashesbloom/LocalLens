// Parses CHANGELOG.md (Keep a Changelog format) into structured data the Announce page
// renders as real JSX — never dangerouslySetInnerHTML. Supports only the markdown subset
// the real file actually uses (see UpdateChecker.jsx's formatReleaseNotes for the prior art
// this mirrors): `## [x.y.z] - YYYY-MM-DD` release headers, `### Heading` sections, `- `/`* `
// bullets with one level of indented sub-bullets, and inline `**bold**`/`` `code` ``.
import { setNetActivity } from './net.js'

const VERSION_RE = /^## \[([^\]]+)\]\s*-\s*(\d{4}-\d{2}-\d{2})\s*$/
const SECTION_RE = /^### (.+?)\s*$/
const BULLET_RE = /^(\s*)[-*] (.+)$/

// Inline run parser: `**bold**` and `` `code` `` only, nothing else — a hand-rolled
// tokenizer is plenty for two delimiters and keeps the "no markdown dependency" promise.
function parseInline(text) {
  const runs = []
  const re = /\*\*(.+?)\*\*|`(.+?)`/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ type: 'text', value: text.slice(last, m.index) })
    runs.push(m[1] !== undefined ? { type: 'strong', value: m[1] } : { type: 'code', value: m[2] })
    last = re.lastIndex
  }
  if (last < text.length) runs.push({ type: 'text', value: text.slice(last) })
  return runs
}

// Parses the markdown source into an ordered array of
// { version, date, sections: [{ heading, items: [{ runs, children }] }] }.
// `## [Unreleased]` is skipped: it has no date, so it never matches VERSION_RE and simply
// leaves `current` at whatever it last was (null, before the first real release).
// The trailing "how to add release notes" HTML-comment footer (after the file's `---`
// divider) is cut before parsing starts — it contains a literal `## [X.Y.Z] - YYYY-MM-DD`
// example that would otherwise be mistaken for content once a real release is `current`.
export function parseChangelog(markdown) {
  const dividerAt = markdown.indexOf('\n---')
  const body = dividerAt === -1 ? markdown : markdown.slice(0, dividerAt)

  const releases = []
  let current = null
  let currentSection = null
  let lastItem = null // last top-level item in the current section, for attaching sub-bullets

  for (const line of body.split('\n')) {
    const vMatch = line.match(VERSION_RE)
    if (vMatch) {
      current = { version: vMatch[1], date: vMatch[2], sections: [] }
      releases.push(current)
      currentSection = null
      lastItem = null
      continue
    }
    if (!current) continue // before the first dated release, or inside [Unreleased]

    const sMatch = line.match(SECTION_RE)
    if (sMatch) {
      currentSection = { heading: sMatch[1].trim(), items: [] }
      current.sections.push(currentSection)
      lastItem = null
      continue
    }

    const bMatch = line.match(BULLET_RE)
    if (bMatch && currentSection) {
      const indented = bMatch[1].length > 0
      const item = { runs: parseInline(bMatch[2].trim()), children: [] }
      if (indented && lastItem) {
        lastItem.children.push(item)
      } else {
        currentSection.items.push(item)
        lastItem = item
      }
    }
    // blank lines and anything else (prose paragraphs, the "Technical Notes" prose in
    // 2.2.0) are not part of the format this page renders — ignored, not an error.
  }

  return releases
}

const CACHE_KEY = 'll-changelog-v1'
const CACHE_TTL_MS = 5 * 60 * 1000 // short: long enough to skip re-parsing on quick re-navigation, short enough that a stale cache never survives a real testing session

// djb2 — a few lines, good enough to catch same-length edits (e.g. bumping "3.0.2" to
// "3.0.3") that a raw-length key would miss entirely.
function hashStr(s) {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return h >>> 0
}

function readCache(hash) {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (cached.hash !== hash) return null
    if (Date.now() - cached.ts > CACHE_TTL_MS) return null
    return cached.releases
  } catch {
    return null
  }
}

function writeCache(hash, releases) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ hash, ts: Date.now(), releases }))
  } catch {
    // storage unavailable (private browsing, quota) — the page still works, just re-parses
  }
}

// Fetches /CHANGELOG.md (copied there at dev/build time — see vite.config.js) and returns
// the parsed release array. Always network-fetches (the cache is keyed on the fetched
// text's hash, so validating it requires the fetch anyway); the cache only skips
// re-parsing, not re-fetching. Wrapped with net.js so the status bar shows activity while
// the request is in flight. Throws on a failed fetch — the caller renders that as shell
// output rather than a blank page.
export async function fetchChangelog() {
  setNetActivity('CHANGELOG.md')
  try {
    const res = await fetch('/CHANGELOG.md')
    if (!res.ok) throw new Error(`CHANGELOG.md responded ${res.status}`)
    const text = await res.text()
    const hash = hashStr(text)
    const cached = readCache(hash)
    if (cached) return cached
    const releases = parseChangelog(text)
    writeCache(hash, releases)
    return releases
  } finally {
    setNetActivity(null)
  }
}
