import { Link } from 'react-router-dom'
import { FAQ } from '../content/faq.js'
import { DocFoot, DocHead, Section } from './Doc.jsx'

// The questions live in content/faq.js because scripts/prerender.mjs also builds this page's
// FAQPage structured data from them.
export default function Faq() {
  return (
    <div className="doc doc-lite">
      <DocHead kicker="FAQ" title="LocalLens questions, answered">
        Short answers about LocalLens, the free, privacy-first photo organizer that sorts by
        date, place and face on your own computer. Each answer links to the page with the
        detail behind it.
      </DocHead>

      {FAQ.map(({ q, a, link }) => (
        <Section title={q} key={q}>
          <p>{a}</p>
          {link ? (
            <p className="doc-faq-more">
              <Link to={link.to}>{link.label} →</Link>
            </p>
          ) : null}
        </Section>
      ))}

      <DocFoot
        next={{
          to: '/post',
          title: 'Ask on the board',
          blurb: 'Question not here? Post it. No account needed, and the answer helps the next person.',
        }}
      />
    </div>
  )
}
