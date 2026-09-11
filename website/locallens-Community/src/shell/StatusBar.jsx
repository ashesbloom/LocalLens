import { useSyncExternalStore } from 'react'
import { getNetActivity, subscribeNetActivity } from '../data/net.js'
import { getStats, subscribeStats } from '../data/stats.js'

// The stats are read from their own store rather than passed in, the same way net activity
// already is. A prop would have been recomputed by Frame on every route change and would have
// shown whatever was known at that render; subscribing means the numbers appear the moment
// the fetch lands, wherever the reader happens to be.
//
// Every value can be null, and null prints as '—'. Nothing here is ever a guess.
//
// It is also where the keyboard layer becomes visible. Two quiet affordances, not a banner:
// the ←/→ hint (which flips to `g …` while a chord is waiting for its second key, so the
// chord teaches itself the first time it is pressed) and a `?` button opening the same
// dialog the key does. A shortcut nobody can see is a shortcut nobody uses.
export default function StatusBar({ chordArmed = false, onOpenHelp }) {
  const net = useSyncExternalStore(subscribeNetActivity, getNetActivity, getNetActivity)
  const stats = useSyncExternalStore(subscribeStats, getStats, getStats)

  return (
    <footer className="status">
      <span>© LocalLens · AGPL-3.0</span>
      <span className="mid">net: {net}</span>
      <span className="status-keys">
        <span className={`kb-hint${chordArmed ? ' on' : ''}`} aria-live="polite">
          {chordArmed ? (
            <>
              <kbd>g</kbd> <span className="kb-wait">waiting for a letter…</span>
            </>
          ) : (
            <>
              <kbd>←</kbd>
              <kbd>→</kbd> <span className="kb-what">sections</span>
            </>
          )}
        </span>
        <button type="button" className="kb-open" onClick={onOpenHelp}>
          <kbd>?</kbd> keys
        </button>
      </span>
      <span className="status-stats">
        stars <b>{stats.stars ?? '—'}</b> · forks <b>{stats.forks ?? '—'}</b> · visits{' '}
        <b>{stats.visits ?? '—'}</b>
      </span>
    </footer>
  )
}
