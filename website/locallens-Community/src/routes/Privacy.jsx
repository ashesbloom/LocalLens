import { Link } from 'react-router-dom'
import { DocFoot, DocHead, Ext, Section, SRC } from './Doc.jsx'

// Every row is a claim from marketing/CLAIMS.md, re-checked against the commit SRC is pinned
// to. If the code moves, update SRC and the line anchors together, never one without the other.
const CLAIMS = [
  {
    claim: 'The backend makes no external network calls',
    where: ['backend/scheduler_daemon.py#L69', 'scheduler_daemon.py'],
    check: 'grep -rn "requests\\|httpx\\|urlopen\\|socket" backend/*.py',
    note: 'Every hit is a call to 127.0.0.1 or the local port picker.',
  },
  {
    claim: 'Its API listens on this computer only',
    where: ['backend/main.py#L2347', 'main.py'],
    check: 'lsof -nP -iTCP -sTCP:LISTEN | grep 127.0.0.1',
    note: 'Bound to 127.0.0.1, never 0.0.0.0.',
  },
  {
    claim: 'Sensitive endpoints need a local secret',
    where: ['backend/main.py#L107', 'main.py'],
    check: 'ls -l ~/.config/LocalLens/local_api_token.txt',
    note: 'A random 64-character token, readable by your user only (0600).',
  },
  {
    claim: 'A web page cannot call the API',
    where: ['backend/main.py#L354', 'main.py'],
    check: 'curl -si -H "Origin: https://example.com" http://127.0.0.1:$(cat ~/.config/LocalLens/port.txt)/',
    note: 'No Access-Control-Allow-Origin comes back: only the app’s own window is allowed.',
  },
  {
    claim: 'Face recognition runs on your machine',
    where: ['backend/requirements.txt#L6', 'requirements.txt'],
    check: 'grep -n "face_recognition\\|dlib" backend/requirements.txt',
    note: 'face_recognition and dlib, no model server, no API key.',
  },
  {
    claim: 'Place names are looked up offline',
    where: ['backend/requirements.txt#L8', 'requirements.txt'],
    check: 'grep -n reverse_geocoder backend/requirements.txt',
    note: 'The place-name dataset ships inside the app.',
  },
]

export default function Privacy() {
  return (
    <div className="doc doc-lite">
      <DocHead
        kicker="Privacy"
        title="Your photos never leave your computer"
        specs={[
          ['0', 'photos uploaded'],
          ['0', 'external calls from the backend'],
          ['0', 'analytics events'],
        ]}
      >
        LocalLens is a photo organizer with no cloud upload: sorting, face recognition and
        place names all run on your own machine. Below is each privacy claim, the line of code
        behind it, and a command you can run to check it yourself, followed by the few
        connections that do exist.
      </DocHead>

      <Section title="Does LocalLens upload my photos?">
        <p>
          No. LocalLens reads your photos from disk, works on them in memory and writes the
          sorted copies back to disk, and its backend has no code that talks to any server
          but itself. The face data it learns and its settings stay in folders on your
          computer too.
        </p>
        <p>
          The app is open source under AGPL-3.0, so this is not a promise you have to take on
          trust: the <Ext href="https://github.com/ashesbloom/LocalLens">full source</Ext> is
          public, and every claim below points at the line that makes it true.
        </p>
      </Section>

      <Section title="How can I check these claims myself?">
        <p>
          Run the command in the last column against the source or a running copy of the app.
          Each one takes seconds and needs no special tools. Paths are the macOS ones; on
          Windows the same files are in <code>%APPDATA%\LocalLens</code>.
        </p>
        <div className="doc-table wrap">
          <table>
            <thead>
              <tr>
                <th>Claim</th>
                <th>Where</th>
                <th>Check it</th>
              </tr>
            </thead>
            <tbody>
              {CLAIMS.map((c) => (
                <tr key={c.claim}>
                  <td>
                    {c.claim}
                    <span className="cell-note">{c.note}</span>
                  </td>
                  <td className="where">
                    <Ext href={`${SRC}/${c.where[0]}`}>{c.where[1]}</Ext>
                  </td>
                  <td>
                    <code>{c.check}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Does LocalLens connect to the internet at all?">
        <p>
          Yes, for two checks of its own, and neither carries anything about your photos. It
          asks GitHub whether a newer release exists, and from the release after v3.1.0 it
          also asks this site whether anyone has replied to your posts on the board.
        </p>
        <ul>
          <li>
            <strong>The update check</strong> is the{' '}
            <Ext href={`${SRC}/frontend/src-tauri/tauri.conf.json#L57`}>updater</Ext> fetching a
            small file from the latest GitHub release.
          </li>
          <li>
            <strong>The board check</strong> (from the release after v3.1.0) runs only while the
            app is open, every two minutes. It sends a random key your install made for itself
            and the time of its last check, and gets back new posts and replies. The key is not
            tied to you or your device: the site stores only a hash of it, and only next to
            posts you wrote from a browser the app opened. Cloudflare, which hosts the site,
            sees the request the way it sees any web request. There is no setting to turn this
            check off yet.
          </li>
        </ul>
        <p>The other cases are ones you start yourself, and each is stated here so nobody has to find it first:</p>
        <ul>
          <li>
            <strong>Links you click</strong>, such as this site or the release page, open in
            your normal browser.
          </li>
          <li>
            <strong>LL Agent</strong>, the optional MCP server, lets Claude or another assistant
            run LocalLens. The assistant receives text: counts, folder names and the person
            names you chose. It never receives the image files.
          </li>
          <li>
            <strong>LL Agent Pro</strong> checks its licence key once with the licence
            provider when you activate it.
          </li>
        </ul>
        <p>This list changes only with a release note.</p>
      </Section>

      <Section title="Does LocalLens collect analytics or telemetry?">
        <p>
          No. Neither the app nor its backend sends analytics of any kind, anonymised,
          aggregated or opt-in. Adoption is measured only from public numbers such as GitHub
          release downloads, which you can see on <Link to="/stats">the stats page</Link>.
        </p>
      </Section>

      <Section title="What does this website record?">
        <p>
          This site counts one visit per address per day, stored as a salted SHA-256 hash
          rather than the address itself, so the number on <Link to="/stats">/stats</Link> means
          something. It runs no third-party analytics, and posting on the board passes a
          Cloudflare Turnstile check instead of asking for an account.
        </p>
      </Section>

      <DocFoot
        next={{
          to: '/compare',
          title: 'LocalLens next to Google Photos, Apple Photos and digiKam',
          blurb: 'Where each one processes faces, what gets uploaded, and what it costs.',
        }}
      />
    </div>
  )
}
