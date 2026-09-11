// The numbers behind the status bar's right-hand readout and the `stats` command.
//
// Shaped as a subscribable store rather than a plain async function, for the same reason
// net.js is: StatusBar renders on every route change and must not re-fetch, and getStats()
// has to stay synchronous so CommandLine can answer `stats` from whatever is already known.
// One fetch per page load fills the snapshot and notifies both.
import { setNetActivity } from './net.js'

const API = '/api/stats'
const VISIT_KEY = 'll-visit-counted'
const TIMEOUT_MS = 8000

// Every field starts null and renders as '—'. Nothing here is ever a guess: a number appears
// only once the server has actually said what it is.
// `series` holds the day-aligned history the tiles plot. An absent or empty array for a
// metric is what tells its tile to draw the dither band instead of a line — three of the
// four start that way and upgrade themselves once snapshots accumulate.
let current = { stars: null, forks: null, openIssues: null, visits: null, series: {} }
const listeners = new Set()
let inFlight = null

export function getStats() {
  return current
}

export function subscribeStats(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

function publish(next) {
  // A new object identity every time, because useSyncExternalStore compares snapshots by
  // reference — mutating `current` in place would notify and then show the same thing.
  current = { ...current, ...next }
  for (const fn of listeners) fn(current)
}

// Fetches once. Concurrent callers share the same promise, so Frame's mount and a `stats`
// typed in the same second cost one request, not two.
export function loadStats() {
  if (inFlight) return inFlight
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  setNetActivity(location.host)
  inFlight = fetch(API, { signal: controller.signal })
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      if (data) publish(data)
      return current
    })
    .catch(() => current) // offline, aborted, or the API is not running — stay at '—'
    .finally(() => {
      clearTimeout(timer)
      setNetActivity(null)
      inFlight = null
    })
  return inFlight
}

// Counts this visit, at most once per browser session. The server also refuses to count the
// same address twice in one day, so this is only about not making a pointless request on
// every route change — the table is what actually guarantees the number means something.
export function recordVisit() {
  try {
    if (sessionStorage.getItem(VISIT_KEY)) return
    sessionStorage.setItem(VISIT_KEY, '1')
  } catch {
    // Storage blocked. Counting once per load instead of once per session is still correct;
    // the day+address primary key is what stops it double-counting.
  }
  fetch(API, { method: 'POST' }).catch(() => {})
}
