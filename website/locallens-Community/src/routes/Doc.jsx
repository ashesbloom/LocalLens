import { Link } from 'react-router-dom'

// The layout pieces the reference pages (/download, /privacy, /faq, /compare, /stats) share.
// Same doc-* classes as /how, so they read as one site. /how and /pipeline keep their own
// copies: they predate this file and their Section takes a different kicker prop.

// Pinned to a commit so a line number in a link still points at the line it quotes.
export const SRC = 'https://github.com/ashesbloom/LocalLens/blob/7b57a5e8acfce4b138d9ed5cafb8d434bf3385de'
export const RELEASES = 'https://github.com/ashesbloom/LocalLens/releases/latest'

export function Ext({ href, children }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  )
}

export function DocHead({ kicker, title, children, specs }) {
  return (
    <header className="doc-head">
      <span className="lbl doc-kicker">{kicker}</span>
      <h1 className="h1">{title}</h1>
      <p className="doc-sub">{children}</p>
      {specs ? (
        <div className="doc-specs">
          {specs.map(([b, label]) => (
            <div className="doc-spec" key={label}>
              <b>{b}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      ) : null}
    </header>
  )
}

// Every H2 on these pages is the question a reader would type, and the first paragraph under
// it answers that question on its own. That paragraph is what search and AI answers quote.
export function Section({ title, children }) {
  return (
    <section className="doc-sec">
      <div className="doc-sec-head">
        <h2>{title}</h2>
      </div>
      <div className="doc-prose">{children}</div>
    </section>
  )
}

export function DocFoot({ next }) {
  return (
    <>
      {next ? (
        <Link className="doc-next" to={next.to}>
          <span className="lbl">Next</span>
          <span className="doc-next-title">{next.title} →</span>
          <p>{next.blurb}</p>
        </Link>
      ) : null}
      <div className="doc-foot">
        <Link to="/">← home</Link>
        <span className="sep">·</span>
        <Link to="/faq">faq</Link>
        <span className="sep">·</span>
        <Link to="/download">download</Link>
        <span className="sep">·</span>
        <Link to="/privacy">privacy</Link>
        <span className="sep">·</span>
        <Link to="/compare">compare</Link>
      </div>
    </>
  )
}
