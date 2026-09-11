import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { TAGS, tagFor } from '../data/tags.js'
import { canStillEdit, LIMITS } from '../data/postRules.js'
import {
  createReply, deletePost, deleteReply, editPost, fetchPosts, fetchReplies, fetchTags, replyStorageKey, votePost,
} from '../data/posts.js'
import { isAdmin, ownsPost } from '../data/mine.js'
import { useTurnstileWidget } from '../shell/useTurnstile.js'
import { parseMarkdown } from '../data/markdown.js'
import { SafeNodes } from '../shell/SafeNode.jsx'

// The feed. Every body here was written by a stranger and arrives as markdown, which is parsed
// into a node tree and rendered as real elements -- markdown.js constructs every tag itself,
// so nothing in a post can become markup it did not intend.

const MINUTE = 60000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export function ago(ms, now = Date.now()) {
  const d = Math.max(0, now - ms)
  if (d < MINUTE) return 'just now'
  if (d < HOUR) return `${Math.floor(d / MINUTE)}m ago`
  if (d < DAY) return `${Math.floor(d / HOUR)}h ago`
  if (d < 30 * DAY) return `${Math.floor(d / DAY)}d ago`
  return new Date(ms).toISOString().slice(0, 10)
}

// Up, score, down. The arrow you have already used stays lit, and pressing it again withdraws
// -- which is why the click sends 0 rather than toggling to the opposite vote.
function Votes({ post, onVote, busy }) {
  const mine = Number(post.myVote ?? 0)
  const cast = (value) => onVote(post.id, mine === value ? 0 : value)
  return (
    <div className="vt" role="group" aria-label="Vote on this post">
      <button
        type="button"
        className={`vt-arrow${mine === 1 ? ' on' : ''}`}
        aria-pressed={mine === 1}
        aria-label={mine === 1 ? 'Remove your upvote' : 'Upvote'}
        disabled={busy}
        onClick={() => cast(1)}
      >
        ▲
      </button>
      <span className={`vt-score${mine !== 0 ? ' voted' : ''}`}>{Number(post.score ?? 0)}</span>
      <button
        type="button"
        className={`vt-arrow${mine === -1 ? ' on' : ''}`}
        aria-pressed={mine === -1}
        aria-label={mine === -1 ? 'Remove your downvote' : 'Downvote'}
        disabled={busy}
        onClick={() => cast(-1)}
      >
        ▼
      </button>
    </div>
  )
}


// One post's replies: a toggle showing the count, a lazily-loaded flat list, and a small
// form to add one. Loaded only once opened -- fetching every post's replies while the feed
// itself is loading would turn one page load into N+1 requests.
function Reply({ postId, reply, onRemove }) {
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const mine = ownsPost(replyStorageKey(postId, reply.id))
  const admin = isAdmin()

  async function remove() {
    if (!window.confirm('Remove this reply?')) return
    setBusy(true)
    try {
      await deleteReply(postId, reply.id)
      onRemove(reply.id)
    } catch (err) {
      setProblem(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="rp-item">
      <header className="rp-meta">
        <span className="rp-who">{reply.author}</span>
        <time className="rp-when" dateTime={new Date(reply.created).toISOString()}>
          {ago(reply.created)}
        </time>
        {mine ? <span className="fd-yours">yours</span> : null}
        {mine || admin ? (
          <button type="button" className="fd-act danger" disabled={busy} onClick={remove}>
            delete{!mine && admin ? ' (admin)' : ''}
          </button>
        ) : null}
      </header>
      <div className="rp-body fd-body">
        <SafeNodes nodes={parseMarkdown(reply.body)} />
      </div>
      {problem ? <span className="fd-bad">{problem}</span> : null}
    </div>
  )
}

function ReplyForm({ postId, onAdded }) {
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const widgetRef = useRef(null)
  const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY
  const { tokenRef, reset: resetTurnstile } = useTurnstileWidget(sitekey, widgetRef, {
    onError: () => setProblem('The bot check could not load, so replying is unavailable.'),
  })

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setProblem(null)
    try {
      const { reply } = await createReply(postId, { author, body, turnstileToken: tokenRef.current })
      setBody('')
      onAdded(reply)
    } catch (err) {
      setProblem(err.message)
    } finally {
      resetTurnstile()
      setBusy(false)
    }
  }

  return (
    <form className="rp-form" onSubmit={submit}>
      <textarea
        className="cmp-input rp-box"
        value={body}
        maxLength={LIMITS.replyBodyMax}
        placeholder="write a reply"
        aria-label="Write a reply"
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="rp-formfoot">
        <input
          className="cmp-field rp-who-field"
          value={author}
          maxLength={LIMITS.authorMax}
          placeholder="your name (optional)"
          aria-label="Your name"
          onChange={(e) => setAuthor(e.target.value)}
        />
        <button type="submit" className="cmp-mini" disabled={busy || body.trim().length === 0}>
          {busy ? 'sending' : 'reply'}
        </button>
      </div>
      <div className="cmp-turnstile" ref={widgetRef} />
      {problem ? <span className="fd-bad">{problem}</span> : null}
    </form>
  )
}

// The thread's own state, kept apart from where it is drawn. The toggle button belongs in
// the footer row beside "open" and "copy link"; the panel has to be a block under that whole
// row. Those are two different places in the DOM, so the state that both need lives here
// rather than in a component wrapping both -- an earlier version wrapped them together in an
// inline-flex box, which laid the panel out *beside* the button and on top of its neighbours.
//
// Nothing is fetched until the thread is opened: loading every post's replies while the feed
// itself loads would turn one page load into N+1 requests for replies almost nobody expands.
function useReplyThread(postId, open) {
  const [items, setItems] = useState(null) // null = not fetched yet
  const [problem, setProblem] = useState(null)

  useEffect(() => {
    if (!open || items !== null) return
    let live = true
    fetchReplies(postId)
      .then((replies) => {
        if (live) setItems(replies)
      })
      .catch((err) => {
        if (live) setProblem(err.message)
      })
    return () => {
      live = false
    }
  }, [open, items, postId])

  return { items, setItems, problem }
}

function ReplyPanel({ postId, items, setItems, problem, onCountChange }) {
  return (
    <div className="rp-panel">
      {items === null && !problem ? <p className="fd-note">reading replies…</p> : null}
      {problem ? <p className="fd-note fd-bad">{problem}</p> : null}
      {items?.map((r) => (
        <Reply
          key={r.id}
          postId={postId}
          reply={r}
          onRemove={(id) => {
            setItems((cur) => cur.filter((x) => x.id !== id))
            onCountChange(-1)
          }}
        />
      ))}
      <ReplyForm
        postId={postId}
        onAdded={(reply) => {
          setItems((cur) => [...(cur ?? []), reply])
          onCountChange(1)
        }}
      />
    </div>
  )
}

export function Entry({ post, onVote, onReplace, onRemove, standalone = false }) {
  const tag = tagFor(post.tag, post.tagLabel)
  const [editing, setEditing] = useState(false)
  const [repliesOpen, setRepliesOpen] = useState(false)
  const [draft, setDraft] = useState(post.body)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [copied, setCopied] = useState(false)

  // Ownership is a token this browser holds; there are no accounts. Admin is the key entered
  // at the prompt. Both are read at render, so entering the key lights up every row at once.
  const mine = ownsPost(post.id)
  const admin = isAdmin()
  const thread = useReplyThread(post.id, repliesOpen)
  const replyCount = Number(post.replies ?? 0)
  const bumpReplies = (delta) => onReplace?.({ id: post.id, replies: replyCount + delta })
  const editable = mine && canStillEdit(post.created)

  async function remove() {
    if (!window.confirm('Take this post down?')) return
    setBusy(true)
    setProblem(null)
    try {
      await deletePost(post.id)
      onRemove?.(post.id)
    } catch (err) {
      setProblem(err.message)
      setBusy(false)
    }
  }

  async function save() {
    setBusy(true)
    setProblem(null)
    try {
      onReplace?.(await editPost(post.id, draft))
      setEditing(false)
    } catch (err) {
      setProblem(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function copyLink() {
    const url = `${location.origin}/post/${post.id}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // Clipboard access can be refused outright. Say nothing rather than throwing -- the
      // permalink is right there in the address bar of the post's own page.
      setProblem('Could not copy. The link is /post/' + post.id)
    }
  }

  return (
    <article className={`fd-post${standalone ? ' solo' : ''}`}>
      <Votes post={post} onVote={onVote} busy={busy} />

      <div className="fd-main">
        <header className="fd-meta">
          <span className="tag-chip on" data-tag={tag.slug}>
            <span className="tag-glyph">{tag.glyph}</span>
            {tag.label}
          </span>
          <span className="fd-who">{post.author}</span>
          <time className="fd-when" dateTime={new Date(post.created).toISOString()}>
            {ago(post.created)}
          </time>
          {post.edited ? <span className="fd-edited">edited</span> : null}
          {mine ? <span className="fd-yours">yours</span> : null}
        </header>

        {editing ? (
          <div className="fd-edit">
            <textarea
              className="cmp-input fd-editbox"
              value={draft}
              maxLength={LIMITS.bodyMax}
              autoFocus
              aria-label="Edit your post"
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className="fd-editfoot">
              <button type="button" className="cmp-mini" disabled={busy} onClick={save}>
                {busy ? 'saving' : 'save'}
              </button>
              <button
                type="button"
                className="fd-act"
                onClick={() => {
                  setDraft(post.body)
                  setEditing(false)
                  setProblem(null)
                }}
              >
                cancel
              </button>
              <span className="fd-hint">markdown, same as the box above</span>
            </div>
          </div>
        ) : (
          <div className="fd-body">
            <SafeNodes nodes={parseMarkdown(post.body)} />
          </div>
        )}

        <footer className="fd-acts">
          {standalone ? null : (
            <Link className="fd-act" to={`/post/${post.id}`}>
              open
            </Link>
          )}
          <button
            type="button"
            className="fd-act fd-replies"
            aria-expanded={repliesOpen}
            onClick={() => setRepliesOpen((v) => !v)}
          >
            {replyCount > 0 ? `${replyCount} ${replyCount === 1 ? 'reply' : 'replies'}` : 'reply'}
          </button>
          <button type="button" className="fd-act" onClick={copyLink}>
            {copied ? 'copied' : 'copy link'}
          </button>
          {editable && !editing ? (
            <button type="button" className="fd-act" onClick={() => setEditing(true)}>
              edit
            </button>
          ) : null}
          {mine || admin ? (
            <button type="button" className="fd-act danger" disabled={busy} onClick={remove}>
              delete{!mine && admin ? ' (admin)' : ''}
            </button>
          ) : null}
          {problem ? <span className="fd-bad">{problem}</span> : null}
        </footer>

        {repliesOpen ? (
          <ReplyPanel
            postId={post.id}
            items={thread.items}
            setItems={thread.setItems}
            problem={thread.problem}
            onCountChange={bumpReplies}
          />
        ) : null}
      </div>
    </article>
  )
}

export default function PostFeed({ pending }) {
  const [tag, setTag] = useState('')
  const [sort, setSort] = useState('new')
  const [posts, setPosts] = useState([])
  const [counts, setCounts] = useState([])
  const [next, setNext] = useState(null)
  const [state, setState] = useState('loading')
  const [problem, setProblem] = useState(null)

  const load = useCallback(async (forTag, forSort) => {
    setState('loading')
    setProblem(null)
    try {
      const page = await fetchPosts({ tag: forTag, sort: forSort })
      setPosts(page.posts)
      setNext(page.next)
      setState('ready')
    } catch (err) {
      setProblem(err.message)
      setState('failed')
    }
  }, [])

  useEffect(() => {
    load(tag, sort)
  }, [tag, sort, load])

  // Counts are their own request: they cover the whole board, not the page being read, so
  // they must not be recomputed every time someone pages further down.
  const loadCounts = useCallback(async () => {
    try {
      const data = await fetchTags()
      setCounts(data.tags)
    } catch {
      setCounts([])
    }
  }, [])

  useEffect(() => {
    loadCounts()
  }, [loadCounts])

  // A post made in the composer above is prepended rather than refetched: it is already the
  // newest row, and a refetch would drop whatever page the reader had loaded.
  useEffect(() => {
    if (!pending) return
    setPosts((current) => (current.some((p) => p.id === pending.id) ? current : [pending, ...current]))
    loadCounts()
  }, [pending, loadCounts])

  async function more() {
    if (!next) return
    try {
      const page = await fetchPosts({ tag, sort, cursor: next })
      setPosts((current) => [...current, ...page.posts])
      setNext(page.next)
    } catch (err) {
      setProblem(err.message)
    }
  }

  // The server is the authority on the new tallies, so they are written back rather than
  // guessed at -- two people voting at once would otherwise leave both screens wrong.
  const onVote = useCallback(async (id, value) => {
    try {
      const result = await votePost(id, value)
      setPosts((current) =>
        current.map((p) =>
          p.id === id ? { ...p, score: result.score, ups: result.ups, downs: result.downs, myVote: result.myVote } : p,
        ),
      )
    } catch (err) {
      setProblem(err.message)
    }
  }, [])

  const onReplace = useCallback((updated) => {
    setPosts((current) => current.map((p) => (p.id === updated.id ? { ...p, ...updated } : p)))
  }, [])

  const onRemove = useCallback(
    (id) => {
      setPosts((current) => current.filter((p) => p.id !== id))
      loadCounts()
    },
    [loadCounts],
  )

  // Built-ins always show so the row is stable; tags people invented appear once used, which
  // is the only way a custom tag was ever reachable.
  const countFor = (slug) => counts.find((c) => c.tag === slug)
  const customTags = counts.filter((c) => !TAGS.some((t) => t.slug === c.tag))
  const total = counts.reduce((n, c) => n + Number(c.count), 0)

  const visible = tag ? posts.filter((p) => p.tag === tag) : posts

  return (
    <section className="fd">
      <div className="fd-rule">
        <span className="fd-rule-label">feed</span>
        <div className="fd-sorts" role="group" aria-label="Order the feed">
          <button className={`fd-sort${sort === 'new' ? ' on' : ''}`} onClick={() => setSort('new')}>
            newest
          </button>
          <span className="fd-sep">·</span>
          <button className={`fd-sort${sort === 'top' ? ' on' : ''}`} onClick={() => setSort('top')}>
            top
          </button>
        </div>
      </div>

      <div className="fd-filters" role="group" aria-label="Filter the feed">
        <button className={`fd-filter${tag === '' ? ' on' : ''}`} onClick={() => setTag('')}>
          all
          {total ? <span className="fd-count">{total}</span> : null}
        </button>
        {[...TAGS, ...customTags.map((c) => tagFor(c.tag, c.tagLabel))].map((t) => {
          const found = countFor(t.slug)
          return (
            <button
              key={t.slug}
              className={`fd-filter${tag === t.slug ? ' on' : ''}`}
              data-tag={t.slug}
              onClick={() => setTag(t.slug)}
            >
              <span className="tag-glyph">{t.glyph}</span>
              {t.label}
              {found ? <span className="fd-count">{found.count}</span> : null}
            </button>
          )
        })}
      </div>

      {state === 'loading' ? <p className="fd-note">reading the board…</p> : null}

      {state === 'failed' ? (
        <p className="fd-note fd-bad" role="alert">
          {problem}{' '}
          <button className="cmp-mini" onClick={() => load(tag, sort)}>
            try again
          </button>
        </p>
      ) : null}

      {state === 'ready' && visible.length === 0 ? (
        <p className="fd-note">
          {tag ? `Nothing tagged ${tag} yet.` : 'Nothing posted yet. The box above is open.'}
        </p>
      ) : null}

      {visible.map((post) => (
        <Entry key={post.id} post={post} onVote={onVote} onReplace={onReplace} onRemove={onRemove} />
      ))}

      {next ? (
        <button className="fd-more" onClick={more}>
          older posts
        </button>
      ) : null}
    </section>
  )
}
