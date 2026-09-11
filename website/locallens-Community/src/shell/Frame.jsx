import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Nav from './Nav.jsx'
import CommandLine from './CommandLine.jsx'
import StatusBar from './StatusBar.jsx'
import Echo from './Echo.jsx'
import SectionRows from './SectionRows.jsx'
import { KeyHelp, useShortcuts } from './Shortcuts.jsx'
import StatBand from './StatBand.jsx'
import { isTypingTarget } from './keys.js'
import { useBoot } from './useBoot.js'
import { pageview } from '../data/analytics.js'
import { getStats, loadStats, recordVisit, subscribeStats } from '../data/stats.js'
import { APP_VERSION } from '../data/version.js'

// Layout route: header + output area + status bar + scanline overlay. Every page renders
// inside the single <main class="out"> below, via <Outlet/>; pages never render their own
// header/status bar (nesting a second <main> would be invalid HTML and would double the
// padding/gap rhythm the design gives that one scrolling region).
export default function Frame() {
  const { pathname } = useLocation()
  const [message, setMessage] = useState(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const lastPageviewPath = useRef(null)
  const outRef = useRef(null)
  const { booting, lines } = useBoot()

  // Stable identities: useShortcuts registers one window listener and lists these in its
  // dependency array, so an inline arrow here would tear the listener down and rebuild it
  // on every render.
  const openHelp = useCallback(() => setHelpOpen(true), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])
  const { chordArmed } = useShortcuts({ helpOpen, onOpenHelp: openHelp })

  // Transient message clears on every navigation, including nav-link clicks that never go
  // through CommandLine at all. Setting it to the same null is a no-op re-render either way.
  useEffect(() => {
    setMessage(null)
  }, [pathname])

  // Two things the single scrolling region needs on every route change.
  //
  // Scroll to top: .out is the scroller, not the document, so the router's own scroll
  // restoration never applied here — arriving at a page already scrolled halfway down was
  // barely noticeable when every page was short, and is very noticeable now that two are not.
  //
  // Focus: .out carries tabIndex={-1} purely so it can hold focus, which is what makes
  // ↑/↓/PgUp/PgDn/Home/End scroll it natively. Without focus somewhere inside it the browser
  // has nothing to scroll and the arrow keys appear dead. Focus is left alone when the user
  // is typing, so running a command from the prompt returns them to the prompt, ready for
  // the next one.
  useEffect(() => {
    const el = outRef.current
    if (!el) return
    el.scrollTop = 0
    if (!isTypingTarget(document.activeElement)) el.focus({ preventScroll: true })
    // `booting` is a dependency, not just pathname: on a cold load this effect first runs
    // while the boot screen is up and Frame has returned early, so outRef is still null and
    // the focus never lands. Without it, arrow-key scrolling is dead until the first
    // navigation — which is exactly the visit where someone tries the keys out.
  }, [pathname, booting])

  // Once per page load, not per route change: the footer numbers do not change while someone
  // reads, and a visit is a visit however many sections they walk through. Both calls
  // de-duplicate internally, so StrictMode's double-invoke in dev costs nothing.
  useEffect(() => {
    loadStats()
    recordVisit()
  }, [])

  // Exactly one pageview per route change, including the first — guarded against React
  // StrictMode's dev-only double-invoke of effects on mount (which would otherwise fire
  // this twice for the initial path).
  useEffect(() => {
    if (lastPageviewPath.current === pathname) return
    lastPageviewPath.current = pathname
    pageview(pathname)
  }, [pathname])

  if (booting) {
    return (
      <div className="frame boot">
        <div className="scan" />
        <div className="boot-lines">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="frame">
      <div className="scan" />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="hdr">
        <CommandLine setMessage={setMessage} onOpenHelp={openHelp} />
        <Nav />
        <span className="hdr-right">
          <span className="dot" aria-hidden="true" />
          <span>v{APP_VERSION}</span>
        </span>
      </header>
      <main className="out" id="main" ref={outRef} tabIndex={-1} aria-label="Page content">
        <Echo />
        {message ? <ShellMessage message={message} /> : null}
        <Outlet />
      </main>
      <StatusBar chordArmed={chordArmed} onOpenHelp={openHelp} />
      <KeyHelp open={helpOpen} onClose={closeHelp} />
    </div>
  )
}

// The one piece of transient shell state: help / ls / stats / command-not-found output.
// Announced to assistive tech; clears on the next command or navigation (see effect above).
function ShellMessage({ message }) {
  return (
    <div className="msg" role="status" aria-live="polite">
      {message.kind === 'ls' && <SectionRows entries={message.entries} />}
      {message.kind === 'stats' && (
        <>
          {/* The block echoes its own command. The shell's echo line names the ROUTE you are
              standing on, so `stats` typed on /post lands under a line reading `post` — which
              is what made the output read as page content rather than as an answer. */}
          <p className="msg-cmd">$ stats</p>
          <StatsTiles />
        </>
      )}
      {message.kind === 'text' && message.lines.map((line, i) => <div key={i}>{line}</div>)}
    </div>
  )
}

// Subscribes rather than rendering a snapshot handed over by whoever ran the command. Typing
// `stats` on a cold load used to capture whatever was known at that instant — all dashes —
// and never update when the fetch landed a moment later. Reading the store directly means the
// numbers fill themselves in while the output is on screen.
function StatsTiles() {
  const stats = useSyncExternalStore(subscribeStats, getStats, getStats)
  const series = stats.series ?? {}
  const tiles = [
    { key: 'stars', label: 'stars', value: stats.stars, note: '' },
    { key: 'forks', label: 'forks', value: stats.forks, note: '' },
    { key: 'openIssues', label: 'open issues', value: stats.openIssues, note: 'pull requests included' },
    { key: 'visits', label: 'visits', value: stats.visits, note: 'unique visitors per day' },
  ]
  return (
    <div className="stat-tiles">
      {tiles.map((t) => (
        <div className="stat-tile" key={t.key}>
          <span className="stat-fig">{t.value ?? '—'}</span>
          <span className="stat-cap">{t.label}</span>
          {t.note ? <span className="stat-note">{t.note}</span> : null}
          <StatBand values={series[t.key]} label={t.label} />
        </div>
      ))}
    </div>
  )
}
