import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Nav from './Nav.jsx'
import CommandLine from './CommandLine.jsx'
import StatusBar from './StatusBar.jsx'
import Echo from './Echo.jsx'
import SectionRows from './SectionRows.jsx'
import { useBoot } from './useBoot.js'
import { pageview } from '../data/analytics.js'
import { getStats } from '../data/stats.js'
import { APP_VERSION } from '../data/version.js'

// Layout route: header + output area + status bar + scanline overlay. Every page renders
// inside the single <main class="out"> below, via <Outlet/>; pages never render their own
// header/status bar (nesting a second <main> would be invalid HTML and would double the
// padding/gap rhythm the design gives that one scrolling region).
export default function Frame() {
  const { pathname } = useLocation()
  const [message, setMessage] = useState(null)
  const lastPageviewPath = useRef(null)
  const { booting, lines } = useBoot()

  // Transient message clears on every navigation, including nav-link clicks that never go
  // through CommandLine at all. Setting it to the same null is a no-op re-render either way.
  useEffect(() => {
    setMessage(null)
  }, [pathname])

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
        <CommandLine setMessage={setMessage} />
        <Nav />
        <span className="hdr-right">
          <span className="dot" aria-hidden="true" />
          <span>v{APP_VERSION}</span>
        </span>
      </header>
      <main className="out" id="main">
        <Echo />
        {message ? <ShellMessage message={message} /> : null}
        <Outlet />
      </main>
      <StatusBar stats={getStats()} />
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
          <div className="msg-row">
            <span className="n">stars</span>
            <span className="m">{message.stats.stars ?? '—'}</span>
          </div>
          <div className="msg-row">
            <span className="n">views</span>
            <span className="m">{message.stats.views ?? '—'}</span>
          </div>
          <div className="msg-row">
            <span className="n">repo views</span>
            <span className="m">{message.stats.repoViews ?? '—'}</span>
          </div>
          <div className="msg-row">
            <span className="n">open posts</span>
            <span className="m">{message.stats.openPosts ?? '—'}</span>
          </div>
        </>
      )}
      {message.kind === 'text' && message.lines.map((line, i) => <div key={i}>{line}</div>)}
    </div>
  )
}
