import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import StatsTiles from '../shell/StatsTiles.jsx'
import { loadStats } from '../data/stats.js'
import { DocFoot, DocHead, Ext, RELEASES, Section } from './Doc.jsx'

export default function Stats() {
  // Frame already loads these once per page load; this de-duplicates against that.
  useEffect(() => {
    loadStats()
  }, [])

  return (
    <div className="doc doc-lite">
      <DocHead kicker="Stats" title="LocalLens by the numbers">
        Live numbers for LocalLens, the offline photo organizer: GitHub stars and forks,
        release downloads and visits to this site. They refresh every few minutes, and the
        same data is available as JSON at <a href="/api/stats">/api/stats</a>.
      </DocHead>

      <Section title="How many people use LocalLens?">
        <p>
          Nobody knows exactly, including us, because the app sends no telemetry. The closest
          honest number is how many times the release files have been downloaded, shown below
          next to the GitHub and site numbers.
        </p>
        <StatsTiles />
      </Section>

      <Section title="Where do these numbers come from?">
        <ul>
          <li>
            <strong>Stars, forks and open issues</strong> come from the GitHub API for{' '}
            <Ext href="https://github.com/ashesbloom/LocalLens">ashesbloom/LocalLens</Ext>.
            GitHub counts open pull requests as issues too.
          </li>
          <li>
            <strong>Downloads</strong> add up the download counter GitHub keeps for each
            installer on every <Ext href={RELEASES}>release</Ext>: the macOS DMG and update
            archive, and the Windows <code>.exe</code> and <code>.msi</code>. Updates count as
            downloads. The <code>latest.json</code> file the app fetches on each update check
            is left out, because counting it would turn update checks into downloads.
          </li>
          <li>
            <strong>Visits</strong> are unique visitors per day to this site, counted from a
            salted hash, never a stored address. <Link to="/privacy">More on that</Link>.
          </li>
        </ul>
      </Section>

      <Section title="Why is there no user count?">
        <p>
          Counting users would need the app to report home, and LocalLens does not, not even
          anonymously or as an opt-in. That is a deliberate choice: the claim that the app
          sends nothing anywhere is only worth something if it stays true.
        </p>
      </Section>

      <DocFoot
        next={{
          to: '/privacy',
          title: 'What stays on your machine',
          blurb: 'Every privacy claim, with the command that lets you check it yourself.',
        }}
      />
    </div>
  )
}
