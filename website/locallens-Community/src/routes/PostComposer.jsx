import { useEffect, useRef, useState } from 'react'
import { TAGS, DEFAULT_TAG, slugifyTag, tagFor } from '../data/tags.js'
import { LIMITS } from '../data/postRules.js'
import { TOOLS, applyTool } from '../data/mdEdit.js'
import { parseMarkdown } from '../data/markdown.js'
import { createPost } from '../data/posts.js'
import { useTurnstileWidget } from '../shell/useTurnstile.js'
import { SafeNodes } from '../shell/SafeNode.jsx'

// The composer, following the sketch: a lifted slab with the tag row across the top, two
// rows of controls under it, and the body with a blinking block where you type.
//
// There is deliberately no shell prompt inside the slab. An earlier pass put a
// `locallens@community:~$ post --tag x` line here, which restated the tag chips one line
// below the tag chips and was not in the sketch.

const ROW_ONE = TOOLS.filter((t) => t.row === 1)
const ROW_TWO = TOOLS.filter((t) => t.row === 2)

export default function PostComposer({ onPosted }) {
  const [tag, setTag] = useState(DEFAULT_TAG)
  const [customTag, setCustomTag] = useState('')
  const [author, setAuthor] = useState('')
  const [body, setBody] = useState('')
  const [preview, setPreview] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState(null)
  const [storageWarning, setStorageWarning] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})

  const widgetRef = useRef(null)
  const bodyRef = useRef(null)

  const sitekey = import.meta.env.VITE_TURNSTILE_SITEKEY
  const { tokenRef, reset: resetTurnstile } = useTurnstileWidget(sitekey, widgetRef, {
    onError: () => setProblem('The bot check could not load, so posting is unavailable.'),
  })

  // Expanded is a fixed-position slab rather than a <dialog>, because showModal() would
  // remount the textarea and lose the cursor mid-sentence. That costs one Escape handler.
  useEffect(() => {
    if (!expanded) return
    const onKey = (e) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [expanded])

  // Typing in the tag field is the whole gesture -- there is no "use it" to press. As soon as
  // what has been typed slugs to something usable it becomes the tag, and the chip that
  // appears at the head of the row is the confirmation.
  const customSlug = slugifyTag(customTag)
  const activeTag = customSlug || tag
  const chosen = tagFor(activeTag, customTag)
  const remaining = LIMITS.bodyMax - body.length

  // Picking a built-in clears the field: one selection, never two.
  function pickBuiltIn(slug) {
    setTag(slug)
    setCustomTag('')
  }

  // Runs a toolbar button against the live selection and writes the caret back where the
  // person would keep typing. Without restoring the selection every button would send the
  // cursor to the end of the post.
  function tool(id) {
    const el = bodyRef.current
    if (!el) return
    const next = applyTool(id, body, el.selectionStart, el.selectionEnd)
    setBody(next.text)
    setPreview(false)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(next.start, next.end)
    })
  }


  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setProblem(null)
    setFieldErrors({})
    setBusy(true)
    try {
      const { post, canManage } = await createPost({
        author,
        tag: activeTag,
        tagLabel: chosen.custom ? customTag : null,
        body,
        turnstileToken: tokenRef.current,
      })
      setBody('')
      setPreview(false)
      setExpanded(false)
      setStorageWarning(!canManage)
      onPosted?.(post)
    } catch (err) {
      setProblem(err.message)
      setFieldErrors(err.fieldErrors ?? {})
    } finally {
      resetTurnstile()
      setBusy(false)
    }
  }

  function onBodyKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      e.currentTarget.form?.requestSubmit()
      return
    }
    // The usual shortcuts, so muscle memory works before anyone finds the row of buttons.
    if (e.metaKey || e.ctrlKey) {
      const id = { b: 'bold', i: 'italic', k: 'link' }[e.key.toLowerCase()]
      if (id) {
        e.preventDefault()
        tool(id)
      }
    }
  }

  const canPost = !busy && body.trim().length >= LIMITS.bodyMin

  return (
    <>
      {expanded ? <div className="cmp-shade" onClick={() => setExpanded(false)} /> : null}
      <form className={`cmp${expanded ? ' is-expanded' : ''}`} onSubmit={submit}>
        <div className="cmp-slab">
          <div className="cmp-row cmp-tagrow">
            {/* The label IS the control. It used to be a dead span beside a `+ new` chip that
                opened a second row with its own field and a confirm button -- three clicks and
                an extra row for what the label already said it did. */}
            <input
              className="cmp-tagnew"
              value={customTag}
              maxLength={LIMITS.tagLabelMax}
              placeholder="create your tag"
              aria-label="Create your own tag"
              onChange={(e) => setCustomTag(e.target.value)}
              onKeyDown={(e) => {
                // Enter here means "done naming it", not "post" -- the tag is already applied.
                if (e.key === 'Enter') e.preventDefault()
                if (e.key === 'Escape') setCustomTag('')
              }}
            />
            <div className="cmp-tags" role="radiogroup" aria-label="What is this about?">
              {chosen.custom ? (
                <button type="button" role="radio" aria-checked="true" className="tag-chip on custom">
                  <span className="tag-glyph">{chosen.glyph}</span>
                  {chosen.label}
                </button>
              ) : null}
              {TAGS.map((t) => (
                <button
                  key={t.slug}
                  type="button"
                  role="radio"
                  aria-checked={activeTag === t.slug}
                  className={`tag-chip${activeTag === t.slug ? ' on' : ''}`}
                  data-tag={t.slug}
                  title={t.blurb}
                  onClick={() => pickBuiltIn(t.slug)}
                >
                  <span className="tag-glyph">{t.glyph}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="cmp-tools">
            <div className="cmp-toolrow">
              {ROW_ONE.map((t) => (
                <button key={t.id} type="button" className="cmp-tool" title={t.title} aria-label={t.title} onClick={() => tool(t.id)}>
                  {t.glyph}
                </button>
              ))}
              <span className="cmp-toolgap" />
              {ROW_TWO.map((t) => (
                <button key={t.id} type="button" className="cmp-tool" title={t.title} aria-label={t.title} onClick={() => tool(t.id)}>
                  {t.glyph}
                </button>
              ))}
              <button
                type="button"
                className={`cmp-tool cmp-preview${preview ? ' on' : ''}`}
                aria-pressed={preview}
                onClick={() => setPreview((v) => !v)}
              >
                {preview ? 'edit' : 'preview'}
              </button>
            </div>
          </div>

          <div className="cmp-body">
            {preview ? (
              <div className="cmp-rendered fd-body">
                {body.trim() ? <SafeNodes nodes={parseMarkdown(body)} /> : <p className="cmp-hint">Nothing to preview yet.</p>}
              </div>
            ) : (
              <>
                <textarea
                  ref={bodyRef}
                  className="cmp-input"
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  onKeyDown={onBodyKeyDown}
                  spellCheck="true"
                  aria-label="Your post"
                />
                {/* The sketch's blinking block. It is the empty state -- once there is text
                    the browser's own caret is the honest one. */}
                {body.length === 0 ? (
                  <span className="cmp-ghost" aria-hidden="true">
                    <span className="cmp-caret" />
                    <span className="cmp-hint">what happened?</span>
                  </span>
                ) : null}
              </>
            )}
          </div>

          <div className="cmp-foot">
            <input
              className="cmp-field cmp-who"
              value={author}
              maxLength={LIMITS.authorMax}
              placeholder="your name (optional)"
              aria-label="Your name"
              onChange={(e) => setAuthor(e.target.value)}
            />
            {remaining < 500 ? <span className={`cmp-count${remaining < 0 ? ' over' : ''}`}>{remaining}</span> : null}
            <button
              type="button"
              className="cmp-expand"
              aria-pressed={expanded}
              title={expanded ? 'Shrink back down' : 'Give it more room'}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? 'shrink' : 'expand'}
            </button>
            <button className="cmp-post" type="submit" disabled={!canPost}>
              {busy ? 'posting' : 'post'}
            </button>
          </div>

          <div className="cmp-turnstile" ref={widgetRef} />
        </div>

        {problem ? (
          <p className="cmp-problem" role="alert">
            {problem}
            {fieldErrors.body ? ` ${fieldErrors.body}` : ''}
            {fieldErrors.author ? ` ${fieldErrors.author}` : ''}
          </p>
        ) : null}
        {storageWarning ? (
          <p className="cmp-note" role="status">
            That post is up, but this browser would not store the key that lets you delete it
            again. Site data looks to be blocked here.
          </p>
        ) : null}
        {!sitekey ? (
          <p className="cmp-problem" role="status">
            No Turnstile site key is set, so posting will be refused. Set VITE_TURNSTILE_SITEKEY.
          </p>
        ) : null}
      </form>
    </>
  )
}
