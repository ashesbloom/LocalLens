// GET  /api/stats -- the numbers the status bar and the `stats` command print.
// POST /api/stats -- record that this address visited today.
//
// The GitHub half runs here rather than in the browser for one concrete reason: the
// unauthenticated GitHub API allows sixty calls an hour PER ADDRESS, so a client-side fetch
// would show real numbers to the first visitors from an office or a phone network and dashes
// to everyone behind the same address after that. Fetched once here, behind a ten-minute
// cache, the whole site costs about six calls an hour no matter how many people are reading.
// That is far enough inside the limit that no token is needed, which is why this endpoint
// adds no new secret.
import { json, fail, sameOrigin, clientIp } from '../_lib/http.js'
import { hashIp } from '../_lib/limits.js'

const REPO = 'ashesbloom/LocalLens'
const GITHUB_TTL_S = 600

// How many days of history the tiles plot. Long enough to show a shape, short enough that
// the response stays small and the day axis fits a 28px band without turning to mush.
const WINDOW_DAYS = 30

// GitHub answers 403 to a request with no User-Agent. This is a documented requirement of
// their API, not a nicety.
const UA = 'LocalLens-Community-Site'

// 'YYYY-MM-DD' in UTC. Deliberately not the visitor's local date: the day boundary has to be
// the same for everyone, or someone crossing midnight in their own zone would be counted
// twice while someone else would not be counted at all.
function utcDay(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10)
}

// Returns nulls rather than throwing. A stats readout is not worth failing the request over,
// and a null renders as '—', which is the honest thing to show when the number is genuinely
// unknown.
async function repoStats() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: { 'user-agent': UA, accept: 'application/vnd.github+json' },
      // Cloudflare's edge cache. This is what turns one call per visitor into one call per
      // ten minutes for the entire site.
      cf: { cacheTtl: GITHUB_TTL_S, cacheEverything: true },
    })
    if (!res.ok) return { stars: null, forks: null, openIssues: null }
    const d = await res.json()
    return {
      stars: Number(d.stargazers_count) || 0,
      forks: Number(d.forks_count) || 0,
      // GitHub counts open pull requests in this field as well as issues. Named `openIssues`
      // because that is what the field is called, and shown as "open issues" -- close enough
      // to be useful, and not worth a second paginated request to separate.
      openIssues: Number(d.open_issues_count) || 0,
    }
  } catch {
    return { stars: null, forks: null, openIssues: null }
  }
}

// The last WINDOW_DAYS UTC days, oldest first, ending today. Every series is filled against
// THIS one axis so the four bands line up under each other and a gap is a real horizontal
// hole rather than a closed-up segment.
function dayAxis(now = Date.now()) {
  const days = []
  for (let i = WINDOW_DAYS - 1; i >= 0; i--) days.push(utcDay(now - i * 86400000))
  return days
}

// Fills `rows` onto the axis. `missing` is the whole point of the split:
//   visits    -> 0     a day with no rows genuinely had no visitors
//   snapshots -> null  a day with no row means we never looked, which is not a zero
// Getting that backwards would draw an invented crash to zero on every day the site was
// not deployed.
function onAxis(days, rows, key, missing) {
  const byDay = new Map((rows ?? []).map((r) => [String(r.day), r[key]]))
  return days.map((d) => {
    const v = byDay.get(d)
    return v === undefined || v === null ? missing : Number(v)
  })
}

// Both reads are wrapped the same way visitCount is: a table that does not exist yet reads
// as "no history", never as a 500. snapshots in particular is empty on the day it ships.
async function seriesRows(db, sql, since) {
  try {
    const { results } = await db.prepare(sql).bind(since).all()
    return results ?? []
  } catch {
    return null
  }
}

async function history(db, now = Date.now()) {
  const days = dayAxis(now)
  const since = days[0]

  const [visitRows, snapRows] = await Promise.all([
    seriesRows(db, 'SELECT day, COUNT(*) AS n FROM views WHERE day >= ?1 GROUP BY day ORDER BY day', since),
    seriesRows(db, 'SELECT day, stars, forks, open_issues FROM snapshots WHERE day >= ?1 ORDER BY day', since),
  ])

  // An empty array means "no history at all" and is what tells the tile to draw the dither
  // band instead of a line. A table that failed to read says the same thing.
  const snaps = snapRows ?? []
  return {
    days,
    visits: visitRows ? onAxis(days, visitRows, 'n', 0) : [],
    stars: snaps.length ? onAxis(days, snaps, 'stars', null) : [],
    forks: snaps.length ? onAxis(days, snaps, 'forks', null) : [],
    openIssues: snaps.length ? onAxis(days, snaps, 'open_issues', null) : [],
  }
}

// Records today's reading. Only ever called with numbers that came back from GitHub -- a
// failed fetch must record nothing, or a null would be stored as a real observation and the
// line would dip through it forever.
async function recordSnapshot(db, repo, now = Date.now()) {
  try {
    await db
      .prepare('INSERT OR REPLACE INTO snapshots (day, stars, forks, open_issues) VALUES (?1, ?2, ?3, ?4)')
      .bind(utcDay(now), repo.stars, repo.forks, repo.openIssues)
      .run()
  } catch {
    // Same reasoning as the reads: no table yet is not a reason to fail the request.
  }
}

async function visitCount(db) {
  try {
    const row = await db.prepare('SELECT COUNT(*) AS n FROM views').first()
    return Number(row?.n ?? 0)
  } catch {
    // The table may not exist yet on a database that predates it. A missing counter is not a
    // reason to withhold the GitHub numbers as well.
    return null
  }
}

export async function onRequestGet({ env, waitUntil }) {
  // All three run at once: they are independent, and one waiting on another would make the
  // endpoint as slow as the sum rather than the slowest of the three.
  const [repo, visits, series] = await Promise.all([repoStats(), visitCount(env.DB), history(env.DB)])

  // Only on a real reading. Ridden on waitUntil like the board's orphan sweep, so recording
  // history never delays the answer anyone is waiting for.
  if (repo.stars !== null && waitUntil) waitUntil(recordSnapshot(env.DB, repo).catch(() => {}))

  return json(
    { ...repo, visits, series },
    200,
    // Shorter than the GitHub cache above, so a reader never sits on a number that is more
    // than five minutes staler than what the edge already holds.
    { 'cache-control': 'public, max-age=300' },
  )
}

export async function onRequestPost({ env, request }) {
  if (!sameOrigin(request)) {
    return fail(403, 'bad-origin', 'That request did not come from this site.')
  }
  const ipHash = await hashIp(clientIp(request), env.IP_SALT)
  // OR IGNORE is the whole rate limit. A second visit on the same day from the same address
  // is a no-op at the table level, so this needs no counting logic of its own.
  await env.DB.prepare('INSERT OR IGNORE INTO views (day, ip_hash) VALUES (?1, ?2)')
    .bind(utcDay(), ipHash)
    .run()
  return json({ ok: true })
}
