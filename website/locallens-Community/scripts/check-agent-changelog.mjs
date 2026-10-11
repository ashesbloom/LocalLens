// Checks that LL Agent's live CHANGELOG.md still parses into what /agent renders.
//
// NOT part of `npm run check`: that suite is promised to run with no network and no
// wrangler, and this one is nothing but network. Run it by hand, or after an agent
// release:  node scripts/check-agent-changelog.mjs
//
// Why it exists. The agent's changelog is generated in another repository
// (locallens_mcp_agent, by scripts/gen_changelog.py) and read at runtime from
// raw.githubusercontent.com. Nothing in this repo's test suite can see it, so the two
// halves can drift without either side failing: the generator could change its heading
// shape, the file could be moved or renamed, or a release could land with an unparseable
// date, and the only symptom would be /agent quietly showing "could not read the
// changelog" to visitors. This turns that into a failure someone sees.
import { parseChangelog } from '../src/data/changelog.js'
import { AGENT } from '../src/data/products.js'

const VERSION_JSON = 'https://raw.githubusercontent.com/ashesbloom/locallens_mcp_agent/main/version.json'

let failed = 0
function check(cond, msg) {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`)
  if (!cond) failed++
}

async function text(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} responded ${res.status}`)
  return res.text()
}

const [markdown, versionJson] = await Promise.all([text(AGENT.changelogUrl), text(VERSION_JSON)])
const latest = JSON.parse(versionJson).mcp.latest
const releases = parseChangelog(markdown)

console.log(`fetched ${AGENT.changelogUrl}`)
console.log(`parsed ${releases.length} releases; version.json says mcp.latest = ${latest}\n`)

// The one that matters: the site must not show a version older than the one that shipped.
// This is the same drift that left this site on 3.0.2 after 3.1.0 was released.
check(releases.length > 0, 'the changelog parses to at least one release')
check(releases[0]?.version === latest, `newest parsed release (${releases[0]?.version}) matches mcp.latest (${latest})`)
check(releases.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date)), 'every release date is a real YYYY-MM-DD')
check(new Set(releases.map((r) => r.version)).size === releases.length, 'every parsed release has a distinct version')
check(releases.every((r) => r.sections.length > 0), 'no release parsed with zero sections')
check(
  releases.every((r) => r.sections.every((s) => s.items.length > 0)),
  'no section parsed with zero notes',
)
// Announce renders runs, not raw strings — an empty run list is a blank panel.
check(
  releases[0]?.sections[0]?.items[0]?.runs?.some((run) => run.type === 'text' && run.value.trim()),
  'the newest release has renderable note text',
)

const dates = releases.map((r) => r.date)
check(
  dates.every((d, i) => i === 0 || dates[i - 1] >= d),
  'releases are ordered newest-first (the archive renders in parse order)',
)

console.log(`\ncheck-agent-changelog: ${failed === 0 ? 'PASSED' : `FAILED (${failed})`}`)
process.exit(failed === 0 ? 0 : 1)
