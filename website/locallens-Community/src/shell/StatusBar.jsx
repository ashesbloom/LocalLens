import { useSyncExternalStore } from 'react'
import { getNetActivity, subscribeNetActivity } from '../data/net.js'

// `stats` is `{ stars, views, repoViews, openPosts }` — Task 7 fills in the real source;
// this component only ever needs to know how to print a null as '—'.
export default function StatusBar({ stats }) {
  const net = useSyncExternalStore(subscribeNetActivity, getNetActivity, getNetActivity)

  return (
    <footer className="status">
      <span>© LocalLens · AGPL-3.0</span>
      <span className="mid">net: {net}</span>
      <span>
        stars <b>{stats.stars ?? '—'}</b> · views <b>{stats.views ?? '—'}</b>
      </span>
    </footer>
  )
}
