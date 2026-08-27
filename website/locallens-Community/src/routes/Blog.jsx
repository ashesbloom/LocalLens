import { useEffect, useState } from 'react'
import { fetchBlogPosts } from '../data/blog.js'

const BLOG_HOME = 'https://blogs-1626.onrender.com'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Human date for the latest band — 'DD Mon YYYY', matching Announce's CurrentBand format.
// Unlike the changelog's bare 'YYYY-MM-DD' (see changelog.js's own formatDate), publishedAt
// is a full ISO instant, so new Date() carries no ambiguity here — it renders in the
// viewer's local time zone, which is normal for a "published" timestamp.
function formatDate(iso) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// The listing rows use the raw ISO date prefix — design/Blog.dc.html shows '2026-08-22', an
// ls-style date, not the human form. A display convenience, not a time-zone claim.
function isoDate(iso) {
  return iso.slice(0, 10)
}

function LatestBand({ post }) {
  const label = `Read "${post.title}" by ${post.author} — opens in a new tab`
  return (
    <section className="band">
      <span className="pill up">latest</span>
      {/* The whole card is the link — canonicalUrl must stay visible wherever this post's
          content appears (attribution is a licence condition, not decoration: brief). */}
      <a className="feat" href={post.canonicalUrl} target="_blank" rel="noopener noreferrer" aria-label={label}>
        <div className="feat-main">
          <h3>{post.title}</h3>
          <p>{post.excerpt}</p>
          <span className="read">read ↗</span>
        </div>
        <div className="adata">
          <span className="lbl">Article data</span>
          <dl className="r">
            <dt>author</dt>
            <dd>{post.author}</dd>
          </dl>
          <dl className="r">
            <dt>published</dt>
            <dd>{formatDate(post.publishedAt)}</dd>
          </dl>
          <dl className="r">
            <dt>read time</dt>
            <dd>{post.readingTimeMinutes} min</dd>
          </dl>
          <dl className="r">
            <dt>file</dt>
            <dd className="dim">{post.filename}</dd>
          </dl>
        </div>
      </a>
    </section>
  )
}

function Listing({ posts }) {
  return (
    <section className="band">
      <div className="arch-head">
        <span>earlier</span>
        <span className="ln" aria-hidden="true" />
        <span>
          {posts.length} {posts.length === 1 ? 'post' : 'posts'}
        </span>
      </div>
      <div className="lsblog">
        {posts.map((post) => {
          const label = `Read "${post.title}" by ${post.author} — opens in a new tab`
          return (
            <a
              className="lsb-row"
              key={post.id}
              href={post.canonicalUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={label}
            >
              <span className="dt">{isoDate(post.publishedAt)}</span>
              <span className="au">{post.author}</span>
              <span className="fn">{post.filename}</span>
              <span className="rt">{post.readingTimeMinutes} min</span>
            </a>
          )
        })}
      </div>
    </section>
  )
}

export default function Blog() {
  const [state, setState] = useState({ loading: true, posts: [], error: null })

  useEffect(() => {
    let cancelled = false
    fetchBlogPosts().then(
      (posts) => {
        if (!cancelled) setState({ loading: false, posts, error: null })
      },
      (err) => {
        if (!cancelled) setState({ loading: false, posts: [], error: err.message ?? 'fetch failed' })
      },
    )
    return () => {
      cancelled = true
    }
  }, [])

  const { loading, posts, error } = state

  // Loading: written as shell output that reads as "waiting on a slow host," not a hung
  // page — the blog runs on Render's free tier, and a cold start can take tens of seconds
  // (brief). Never a blank page or a bare spinner.
  if (loading) {
    return (
      <div className="msg" role="status" aria-live="polite">
        <div>connecting to blogs-1626.onrender.com…</div>
        <div>the blog runs on a free-tier host — a cold start can take up to 30s</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="msg" role="status" aria-live="polite">
        <div>✗ could not reach the blog ({error})</div>
        <div>
          Read it directly at{' '}
          <a href={BLOG_HOME} target="_blank" rel="noopener noreferrer">
            blogs-1626.onrender.com ↗
          </a>
        </div>
      </div>
    )
  }

  if (posts.length === 0) {
    return (
      <div className="msg" role="status" aria-live="polite">
        <div>no posts yet</div>
        <div>
          Check{' '}
          <a href={BLOG_HOME} target="_blank" rel="noopener noreferrer">
            blogs-1626.onrender.com ↗
          </a>{' '}
          directly.
        </div>
      </div>
    )
  }

  const [newest, ...rest] = posts

  return (
    <>
      <LatestBand post={newest} />
      {rest.length > 0 && <Listing posts={rest} />}
    </>
  )
}
