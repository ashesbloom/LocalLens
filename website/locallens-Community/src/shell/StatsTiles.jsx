import { useSyncExternalStore } from 'react'
import StatBand from './StatBand.jsx'
import { getStats, subscribeStats } from '../data/stats.js'

// Shared by the `stats` command's output (Frame.jsx) and the /stats page.
// Subscribes rather than rendering a snapshot handed over by whoever ran the command. Typing
// `stats` on a cold load used to capture whatever was known at that instant — all dashes —
// and never update when the fetch landed a moment later. Reading the store directly means the
// numbers fill themselves in while the output is on screen.
export default function StatsTiles() {
  const stats = useSyncExternalStore(subscribeStats, getStats, getStats)
  const series = stats.series ?? {}
  const tiles = [
    { key: 'stars', label: 'stars', value: stats.stars, note: '' },
    { key: 'forks', label: 'forks', value: stats.forks, note: '' },
    { key: 'openIssues', label: 'open issues', value: stats.openIssues, note: 'pull requests included' },
    // ponytail: downloads has no history series (no snapshots column), so its band stays dithered.
    // Add a snapshots column + migration when a downloads trend line is wanted.
    { key: 'downloads', label: 'downloads', value: stats.downloads, note: 'installers and updates, all releases' },
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
