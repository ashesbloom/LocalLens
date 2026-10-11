import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import roadmap from '../content/roadmap.json'
import { fetchChangelog } from '../data/changelog.js'
import { LOCALLENS } from '../data/products.js'
import { track } from '../data/analytics.js'

// Register once, at module level — never inside the component (see Echo.jsx/DitherLens.jsx
// for the same rule applied to their own plugins).
gsap.registerPlugin(ScrollTrigger)

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// 'YYYY-MM-DD' -> '22 Aug 2026'. Hand-rolled rather than `new Date(iso)` + Intl — the
// changelog date has no time/zone component, and `new Date('2026-08-22')` parses as UTC
// midnight, which prints as the previous day in negative-offset zones. Splitting the
// string avoids that entirely.
function formatDate(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  return `${String(d).padStart(2, '0')} ${MONTHS[m - 1]} ${y}`
}

// semver-ish compare of two dotted version strings — 'major'/'minor'/'patch', derived by
// diffing against the previous release rather than hardcoded per the brief.
function releaseType(current, previous) {
  if (!previous) return 'major' // nothing to diff against — the oldest release parsed
  const c = current.split('.').map(Number)
  const p = previous.split('.').map(Number)
  if (c[0] !== p[0]) return 'major'
  if (c[1] !== p[1]) return 'minor'
  return 'patch'
}

// Singular/plural per Keep-a-Changelog heading. An unknown heading falls back to itself
// lowercased, so a changelog that invents a section still reads as English.
const SECTION_LABELS = {
  Added: ['new feature', 'new features'],
  Fixed: ['fix', 'fixes'],
  Changed: ['change', 'changes'],
  Removed: ['removal', 'removals'],
  Deprecated: ['deprecation', 'deprecations'],
  Security: ['security fix', 'security fixes'],
}

// What a release contains, counted and labelled from the sections it actually has.
// This used to read sectionCount(release, 'Fixed') and 'Added' literally, which was fine
// while LocalLens' changelog was the only one -- it always uses those two headings. LL
// Agent's generated changelog groups its historical releases under 'Changed' alone, and
// the literal version announced "0 fixes, 0 new features" about a release with nine notes.
function contentsSummary(release) {
  const parts = release.sections
    .filter((section) => section.items.length > 0)
    .map((section) => {
      const [one, many] = SECTION_LABELS[section.heading] ?? [section.heading.toLowerCase(), section.heading.toLowerCase()]
      return `${section.items.length} ${section.items.length === 1 ? one : many}`
    })
  return parts.length > 0 ? parts.join(', ') : 'no notes'
}

// One-line archive summary: the first bold lead found anywhere in the release, falling
// back to the section names when a release has no bolded item (brief, section 3).
function leadSummary(release) {
  for (const section of release.sections) {
    for (const item of section.items) {
      const strong = item.runs.find((r) => r.type === 'strong')
      if (strong) return strong.value
    }
  }
  return release.sections.map((s) => s.heading).join(', ')
}

// Renders a parsed inline-run list (`text` / `strong` / `code`) as real JSX — never
// dangerouslySetInnerHTML.
function Runs({ runs }) {
  return runs.map((r, i) => {
    if (r.type === 'strong') return <strong key={i}>{r.value}</strong>
    if (r.type === 'code') return <code key={i}>{r.value}</code>
    return <Fragment key={i}>{r.value}</Fragment>
  })
}

function NoteItem({ item }) {
  return (
    <div className="note">
      <span className="b" aria-hidden="true">
        —
      </span>
      <span>
        <Runs runs={item.runs} />
        {item.children.length > 0 && (
          <ul className="note-children">
            {item.children.map((child, i) => (
              <li key={i}>
                <Runs runs={child.runs} />
              </li>
            ))}
          </ul>
        )}
      </span>
    </div>
  )
}

function ReleaseSections({ sections }) {
  return sections.map((s) => (
    <div key={s.heading}>
      {sections.length > 1 && <p className="notes-sub">{s.heading}</p>}
      {s.items.map((item, i) => (
        <NoteItem key={i} item={item} />
      ))}
    </div>
  ))
}

function CurrentBand({ loading, error, current, previous, product }) {
  return (
    <section className="band">
      <span className="pill cur">
        <span className="dot" aria-hidden="true" />
        current
      </span>
      {error ? (
        <div className="msg" role="status" aria-live="polite">
          <div>✗ could not read the changelog</div>
        </div>
      ) : loading || !current ? (
        <p className="lede">reading CHANGELOG.md…</p>
      ) : (
        <div className="cur-panel">
          <div>
            <p className="ver">
              <small>running now</small>
              {current.version}
            </p>
            <dl className="meta">
              <dt>released</dt>
              <dd>{formatDate(current.date)}</dd>
              <dt>type</dt>
              <dd>
                <span className="chip">{releaseType(current.version, previous?.version)}</span>
              </dd>
              <dt>contains</dt>
              <dd>{contentsSummary(current)}</dd>
              <dt>update via</dt>
              <dd>{product.updateVia}</dd>
            </dl>
            {product.buildVersion && current.version !== product.buildVersion && (
              // The changelog is the source of truth for what shipped (brief, section 3) —
              // shown quietly rather than silently rendering the build's own claim instead.
              // Skipped entirely when buildVersion is null: LL Agent ships from another
              // repository, so this site has no second opinion about its version and
              // comparing against APP_VERSION would report drift on every load.
              <p className="ver-note">The app build reports v{product.buildVersion}; CHANGELOG.md says v{current.version}.</p>
            )}
            <div className="acts">
              <a
                className="btn pri"
                href={`${product.releasesUrl}/tag/v${current.version}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('release_notes_click', { version: current.version })}
              >
                release notes ↗
              </a>
              <a
                className="btn"
                href={product.releasesUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track('all_releases_click', {})}
              >
                all releases ↗
              </a>
            </div>
          </div>
          <div className="notes">
            <h4>What changed</h4>
            <ReleaseSections sections={current.sections} />
          </div>
        </div>
      )}
    </section>
  )
}

function StateRows({ items, variant }) {
  return (
    <div className="rows">
      {items.map((item) => (
        <div className={variant === 'lab' ? 'row lab' : 'row'} key={item.title}>
          <span className="st">{item.state}</span>
          <div>
            <h5>{item.title}</h5>
            <p>{item.detail}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// Scroll-lit, expandable archive rows. GSAP motion lives entirely inside its own
// gsap.matchMedia() branch — under prefers-reduced-motion:reduce no ScrollTrigger is ever
// created, every row just renders at full opacity (brief, section 3).
function ArchiveBand({ releases }) {
  const containerRef = useRef(null)
  const [expanded, setExpanded] = useState(() => new Set())

  useLayoutEffect(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set('.arch-row', { opacity: 1 })
    })
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      const rows = gsap.utils.toArray('.arch-row', containerRef.current)
      rows.forEach((row) => {
        gsap.fromTo(
          row,
          { opacity: 0.16 },
          {
            opacity: 1,
            ease: 'none',
            scrollTrigger: { trigger: row, start: 'top 92%', end: 'top 55%', scrub: true },
          },
        )
      })
    })
    return () => mm.revert()
  }, [releases])

  // Expanding a row changes the page height, which shifts the scroll position every
  // trigger below it is measured against — refresh after React commits the new DOM
  // (task-4-brief.md, section 3) rather than leaving the rest of the archive mistimed.
  useLayoutEffect(() => {
    ScrollTrigger.refresh()
  }, [expanded])

  function toggle(version) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(version)) next.delete(version)
      else next.add(version)
      return next
    })
  }

  return (
    <section className="band" ref={containerRef}>
      <div className="arch-head">
        <span>archive</span>
        <span className="ln" aria-hidden="true" />
        <span>{releases.length} releases</span>
      </div>
      <div className="arch">
        {releases.map((r) => {
          const isOpen = expanded.has(r.version)
          return (
            <div className="arch-item" key={r.version}>
              <button type="button" className="arch-row" aria-expanded={isOpen} onClick={() => toggle(r.version)}>
                <span className="v">{r.version}</span>
                <span className="d">{formatDate(r.date)}</span>
                <span className="s">{leadSummary(r)}</span>
              </button>
              {isOpen && (
                <div className="arch-detail">
                  <ReleaseSections sections={r.sections} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

// Mounted twice: at /announce for LocalLens, and inside /agent for LL Agent. Everything
// that differs between the two lives in the product record, so both views share one
// fetch path, one error state and one archive animation rather than drifting apart.
//
// `showRoadmap` is off for the agent because roadmap.json is LocalLens' roadmap --
// rendering it under LL Agent would attribute the wrong plans to the wrong product.
export default function Announce({ product = LOCALLENS, showRoadmap = true }) {
  const [state, setState] = useState({ loading: true, releases: [], error: null })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, releases: [], error: null })
    fetchChangelog(product).then(
      (releases) => {
        if (!cancelled) setState({ loading: false, releases, error: null })
      },
      (err) => {
        if (!cancelled) setState({ loading: false, releases: [], error: err.message ?? 'fetch failed' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [product])

  const { loading, releases, error } = state
  const current = releases[0]
  const previous = releases[1] // only for the current band's patch/minor/major diff — still a real archive row
  const archive = releases.slice(1)

  return (
    <>
      <CurrentBand loading={loading} error={error} current={current} previous={previous} product={product} />

      {showRoadmap && (
        <>
          <section className="band">
            <span className="pill up">upcoming</span>
            <StateRows items={roadmap.upcoming} />
          </section>

          <section className="band">
            <span className="pill lab">labs</span>
            <StateRows items={roadmap.labs} variant="lab" />
          </section>
        </>
      )}

      {!loading && !error && archive.length > 0 && <ArchiveBand releases={archive} />}
    </>
  )
}
