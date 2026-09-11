import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { fetchBlogPost, formatDate } from '../data/blog.js'
import { parseLegacyHtml } from '../data/postHtml.js'
import { SafeNodes } from '../shell/SafeNode.jsx'

const BLOG_HOME = 'https://blogs-1626.onrender.com'

// Structured image block -> a <figure data-float data-width data-offset>, the exact shape the
// contract says content.html renders the same layout as (llms.txt: "The same values appear in
// content.html as data-float/data-width/data-offset on each <figure>"). Rendering it that way
// here too means one CSS ruleset (article.css) drives both paths' image layout identically.
function ArticleImage({ block }) {
  const { url, alt, caption, float = 'none', width = 100, offset = 0 } = block
  return (
    <figure data-float={float} data-width={width} data-offset={offset}>
      <img src={url} alt={alt || ''} loading="lazy" />
      {caption ? <figcaption>{caption}</figcaption> : null}
    </figure>
  )
}

function renderBlock(block, key) {
  switch (block.type) {
    case 'paragraph':
      return <p key={key}>{block.text}</p>
    case 'heading': {
      const level = Math.min(4, Math.max(1, Number(block.level) || 2))
      const Tag = `h${level}`
      return <Tag key={key}>{block.text}</Tag>
    }
    case 'quote':
      return <blockquote key={key}>{block.text}</blockquote>
    case 'code':
      return (
        <pre key={key}>
          <code>{block.text}</code>
        </pre>
      )
    case 'image':
      return <ArticleImage key={key} block={block} />
    default:
      return null // an unrecognised block type is skipped, not crashed on
  }
}

// content.blocks in reading order -> React elements. Consecutive listItem blocks with the
// same `ordered` flag group into one <ul>/<ol> (brief) — everything else renders one block at
// a time via renderBlock.
function renderBlocks(blocks) {
  const out = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    if (block.type === 'listItem') {
      const { ordered } = block
      const items = []
      while (i < blocks.length && blocks[i].type === 'listItem' && blocks[i].ordered === ordered) {
        items.push(blocks[i])
        i++
      }
      const ListTag = ordered ? 'ol' : 'ul'
      out.push(
        <ListTag key={`list-${i}`}>
          {items.map((item, idx) => (
            <li key={idx}>{item.text}</li>
          ))}
        </ListTag>,
      )
      continue
    }
    out.push(renderBlock(block, i))
    i++
  }
  return out
}

// A legacy post's content.blocks is exactly one { type: 'html', html } block (contract:
// llms.txt — "html {html} legacy posts only; then it is the sole block"). Nine of the ten
// live posts are this shape (task-6-brief.md); only one live post uses real structured blocks.
function isLegacyHtml(blocks) {
  return blocks.length === 1 && blocks[0].type === 'html'
}

function ArticleBody({ content }) {
  if (isLegacyHtml(content.blocks)) {
    return <SafeNodes nodes={parseLegacyHtml(content.blocks[0].html)} />
  }
  return renderBlocks(content.blocks)
}

export default function Article() {
  const { id } = useParams()
  const [state, setState] = useState({ loading: true, post: null, error: null, notFound: false })

  useEffect(() => {
    let cancelled = false
    setState({ loading: true, post: null, error: null, notFound: false })
    fetchBlogPost(id).then(
      (post) => {
        if (!cancelled) setState({ loading: false, post, error: null, notFound: false })
      },
      (err) => {
        if (!cancelled) setState({ loading: false, post: null, error: err.message ?? 'fetch failed', notFound: !!err.notFound })
      },
    )
    return () => {
      cancelled = true
    }
  }, [id])

  const { loading, post, error, notFound } = state

  // Loading: the exact wording Blog.jsx already uses for the same cold-start wait (brief:
  // "reuse whatever loading treatment src/data/blog.js already established").
  if (loading) {
    return (
      <div className="msg" role="status" aria-live="polite">
        <div>connecting to blogs-1626.onrender.com…</div>
        <div>the blog runs on a free-tier host — a cold start can take up to 30s</div>
      </div>
    )
  }

  if (notFound) {
    return (
      <div className="msg" role="status" aria-live="polite">
        <div>✗ no post at that address ({error})</div>
        <div>
          <Link to="/blog">cd ../blog</Link>
        </div>
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

  // Every full post carries this (contract) — required visible wherever the content is
  // republished, and it's the article's one licence condition, not a nicety (brief).
  const originalLink = post.attribution?.requiredLink ?? post.canonicalUrl

  return (
    <>
      <h1 className="art-title">{post.title}</h1>
      {post.excerpt ? <p className="art-lede">{post.excerpt}</p> : null}

      <div className="art-meta">
        <div className="c">
          <span className="k">author</span>
          <span className="v">{post.author}</span>
        </div>
        <div className="c">
          <span className="k">published</span>
          <span className="v">{formatDate(post.publishedAt)}</span>
        </div>
        <div className="c">
          <span className="k">read time</span>
          <span className="v">{post.readingTimeMinutes} min</span>
        </div>
        <div className="c">
          <span className="k">original</span>
          <span className="v">
            <a href={originalLink} target="_blank" rel="noopener noreferrer">
              blogs-1626.onrender.com ↗
            </a>
          </span>
        </div>
      </div>

      <div className="art-body">
        <ArticleBody content={post.content} />
      </div>

      <div className="art-foot">
        <Link to="/blog">← back to blog</Link>
        {post.attribution?.text ? (
          <a href={originalLink} target="_blank" rel="noopener noreferrer">
            {post.attribution.text}
          </a>
        ) : null}
      </div>
    </>
  )
}
