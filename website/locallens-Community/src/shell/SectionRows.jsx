// Shared row renderer for the section list: name / blurb / meta. Used by the shell's own
// `ls` command output (Frame.jsx's ShellMessage) and by Home's `ls` section, so the two
// can never drift apart into two slightly different row layouts. `rowClass` lets each
// caller keep its own CSS hook (.msg-row vs .ls-row) without duplicating the JSX shape.
import { Link } from 'react-router-dom'

function Name({ e }) {
  if (e.to) return <Link className="n" to={e.to}>{e.name}</Link>
  if (e.href) return <a className="n" href={e.href} target="_blank" rel="noopener noreferrer">{e.name}</a>
  return <span className="n">{e.name}</span>
}

export default function SectionRows({ entries, rowClass = 'msg-row' }) {
  return (
    <>
      {entries.map((e) => (
        <div className={rowClass} key={e.name}>
          <Name e={e} />
          <span className="d">{e.blurb}</span>
          <span className="m">{e.meta}</span>
        </div>
      ))}
    </>
  )
}
