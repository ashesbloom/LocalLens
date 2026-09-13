import { Link } from 'react-router-dom'
import DitherLens from '../lens/DitherLens.jsx'
import SectionRows from '../shell/SectionRows.jsx'
import { lsEntries } from '../shell/commands.js'
import { APP_VERSION } from '../data/version.js'
import { track } from '../data/analytics.js'

// Real release date for the current APP_VERSION — the version number itself still comes
// from the module so the two can't drift apart.
const RELEASE_DATE = '13 Sep 2026'

// The two explainers. Kept as data so the card band and its markup stay one shape apart —
// they are the same card twice, and the only honest difference between them is the audience.
const READS = [
  {
    to: '/how',
    file: 'how-it-works.md',
    tag: 'Walkthrough',
    title: 'Basic Understanding of LocalLens',
    blurb:
      'What actually happens to a folder of photos: what gets read, how the folders are decided, and why nothing leaves your machine.',
    meta: '6 diagrams · 5 min · no jargon',
  },
  {
    to: '/pipeline',
    file: 'pipeline.md',
    tag: 'Engineering',
    title: 'Inside the Pipeline',
    blurb:
      'The detection ladder, the encoding cache, the write path — and the measured numbers behind each decision.',
    meta: '6 diagrams · 12 min · for engineers',
  },
]

export default function Home() {
  return (
    <>
      {/* Frame already renders the route's echo line above <Outlet/> (see Frame.jsx) — the
          artboard's `whoami` line duplicates that, so it is not repeated here. */}
      <section className="hero">
        <div className="lens-wrap">
          <DitherLens />
          <span className="lens-cap">hover to focus</span>
        </div>
        <div className="hero-text">
          <h1 className="h1">
            LocalLens
            <br />
            Community
          </h1>
          <p className="lede">
            Where the people who use LocalLens say what it should do next — and where we say
            what shipped.
          </p>
          <dl className="kv">
            <dt>repo</dt>
            <dd>
              <a
                href="https://github.com/ashesbloom/LocalLens"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('repo_click', { from: 'home' })}
              >
                github.com/ashesbloom/LocalLens
              </a>
            </dd>
            <dt>license</dt>
            <dd>AGPL-3.0 · agent BUSL-1.1</dd>
            <dt>version</dt>
            <dd>
              {APP_VERSION} — released {RELEASE_DATE}
            </dd>
            <dt>photos uploaded</dt>
            <dd>0</dd>
          </dl>
        </div>
      </section>
      <section className="reads">
        <p className="echo">
          locallens@community:~$ <b>cat how-it-works.md pipeline.md</b>
        </p>
        <div className="read-cards">
          {READS.map((read) => (
            <Link className="read-card" to={read.to} key={read.to}>
              <span className="read-top">
                <span className="lbl">{read.tag}</span>
                <span className="read-file">{read.file}</span>
              </span>
              <span className="read-title">{read.title}</span>
              <span className="read-blurb">{read.blurb}</span>
              <span className="read-meta">{read.meta}</span>
            </Link>
          ))}
        </div>
      </section>
      <section className="ls">
        <p className="echo">
          locallens@community:~$ <b>ls</b>
        </p>
        <div className="ls-rows">
          <SectionRows entries={lsEntries()} rowClass="ls-row" />
        </div>
      </section>
    </>
  )
}
