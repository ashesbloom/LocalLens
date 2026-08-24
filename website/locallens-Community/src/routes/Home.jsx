import DitherLens from '../lens/DitherLens.jsx'
import SectionRows from '../shell/SectionRows.jsx'
import { lsEntries } from '../shell/commands.js'
import { APP_VERSION } from '../data/version.js'
import { track } from '../data/analytics.js'

// Real release date for the current APP_VERSION — the version number itself still comes
// from the module so the two can't drift apart.
const RELEASE_DATE = '22 Aug 2026'

export default function Home() {
  return (
    <>
      {/* Frame already renders the route's echo line above <Outlet/> (see Frame.jsx) — the
          artboard's `whoami` line duplicates that, so it is not repeated here. */}
      <section className="hero">
        <div className="lens-wrap">
          <DitherLens />
          <span className="lens-cap">click to focus</span>
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
