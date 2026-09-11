import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { track } from '../data/analytics.js'

// Register once, at module level — never inside the component (Echo.jsx, Announce.jsx and
// DitherLens.jsx all follow the same rule for their own plugins).
gsap.registerPlugin(ScrambleTextPlugin)

const EMAIL = 'mayankpandeydk123@gmail.com'

// The artboard also drew an `x` row. No handle was ever given for it, and the site's rule is
// that unknown values are not invented — dropping the row beats printing a placeholder.
const DIRECT = [
  { key: 'email', value: EMAIL, href: `mailto:${EMAIL}` },
  { key: 'repo', value: 'github.com/ashesbloom/LocalLens', href: 'https://github.com/ashesbloom/LocalLens' },
]

const ELSEWHERE = [
  { key: 'github', value: 'github.com/ashesbloom', href: 'https://github.com/ashesbloom' },
  { key: 'linkedin', value: 'linkedin.com/in/onlinerecord-mayank', href: 'https://www.linkedin.com/in/onlinerecord-mayank/' },
  { key: 'portfolio', value: 'ashesbloom.github.io/career.footprint', href: 'https://ashesbloom.github.io/career.footprint/' },
]

// A mailto URL has to survive the browser, the OS handler and the mail client, and the
// shortest ceiling among them is the one that counts. 1500 leaves room for the subject and
// the percent-encoding, which can triple a character's length.
const BODY_MAX = 1500

const DEFAULT_SUBJECT = 'LocalLens'

function reduced() {
  // Read at the moment of the interaction rather than through gsap.matchMedia(): that API
  // sets up and tears down machinery around a *declarative* branch, which is right for the
  // mount animation below and wrong for a one-shot reaction to a click.
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export default function Contact() {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState(null)
  const [sending, setSending] = useState(false)

  const colRef = useRef(null)
  // One node per row's key label, so the copy confirmation can be written straight to the
  // DOM. Deliberately not React state: driving that text from state would make React the
  // owner of a string GSAP is mid-way through scrambling, and the two would fight.
  const keyRefs = useRef(new Map())

  useLayoutEffect(() => {
    const mm = gsap.matchMedia()
    // Under reduce this branch creates nothing at all — no tween, no timeline, no ticker.
    // The rows are already at their final text and opacity in the markup, so there is
    // nothing to set either.
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      // Scramble only — deliberately no opacity fade underneath it. A staggered
      // `gsap.from(values, { opacity: 0 })` leaves the later rows blank for their whole
      // delay, and an interrupted tween can strand one of them at zero. Blank contact
      // details are the single worst thing this page can render, so every row holds real
      // characters on every frame: ScrambleText starts from noise and resolves into the
      // address rather than arriving from nothing.
      gsap.utils.toArray('.con-line .v', colRef.current).forEach((el, i) => {
        gsap.to(el, {
          duration: 0.5,
          delay: i * 0.06,
          scrambleText: { text: el.textContent, chars: 'lowerCase', revealDelay: 0.12, speed: 0.6 },
        })
      })
    })
    return () => mm.revert()
  }, [])

  // Swaps a row's key label to `copied` and back. Purely imperative, so React never
  // re-renders these nodes and never resets the text mid-flight.
  function confirmCopy(rowKey) {
    const el = keyRefs.current.get(rowKey)
    if (!el) return
    if (reduced()) {
      el.textContent = 'copied'
      setTimeout(() => {
        if (keyRefs.current.get(rowKey) === el) el.textContent = rowKey
      }, 1400)
      return
    }
    gsap
      .timeline()
      .to(el, { duration: 0.28, scrambleText: { text: 'copied', chars: 'lowerCase', speed: 0.8 } })
      .to(el, { duration: 0.28, scrambleText: { text: rowKey, chars: 'lowerCase', speed: 0.8 } }, '+=1.1')
  }

  async function copyRow(row) {
    try {
      await navigator.clipboard.writeText(row.value)
      confirmCopy(row.key)
      track('contact_copy', { row: row.key })
    } catch {
      // Clipboard access can be refused outright (an insecure origin, or a browser setting).
      // The value is visible on screen either way, so this says what to do rather than
      // pretending the copy worked.
      setResult({ ok: false, head: 'could not reach the clipboard', sub: `Select and copy ${row.value} by hand.` })
    }
  }

  const body = message.trim()
  const remaining = BODY_MAX - message.length
  const canSend = body.length > 0 && remaining >= 0 && !sending

  // Both destinations carry the same three values, so they are built together and the caller
  // only picks which one to open. `mailto:` goes to whatever the OS registered as the default
  // mail client, which is why it can land in Outlook on a machine that has it installed —
  // nothing here chooses Outlook, and nothing can.
  function compose() {
    const line = subject.trim() || DEFAULT_SUBJECT
    const su = encodeURIComponent(line)
    const text = encodeURIComponent(body)
    return {
      gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(EMAIL)}&su=${su}&body=${text}`,
      mailto: `mailto:${EMAIL}?subject=${su}&body=${text}`,
    }
  }

  function finish(head, sub) {
    setResult({ ok: true, head, sub })
    // Long enough to read as a deliberate handoff rather than a flicker, short enough that
    // the button is ready again by the time anyone comes back to the tab.
    setTimeout(() => setSending(false), 1200)
  }

  function send(e) {
    e.preventDefault()
    if (!canSend) return
    setSending(true)
    track('contact_send', { via: 'gmail' })
    window.open(compose().gmail, '_blank', 'noopener,noreferrer')
    finish('✓ opened in Gmail', `Addressed to ${EMAIL}. Nothing was sent from this page — the draft is yours until you press send in Gmail.`)
  }

  function sendViaMailApp() {
    if (!canSend) return
    setSending(true)
    track('contact_send', { via: 'mailapp' })
    // Assigning location rather than opening a window: a mailto: has no document to show, and
    // window.open leaves an orphaned blank tab behind in several browsers.
    window.location.href = compose().mailto
    finish('✓ handed to your mail app', `Addressed to ${EMAIL}. Nothing was sent from this page — the draft is yours until you send it.`)
  }

  async function copyMessage() {
    const line = subject.trim() || DEFAULT_SUBJECT
    try {
      await navigator.clipboard.writeText(`Subject: ${line}\n\n${body}`)
      track('contact_copy', { row: 'message' })
      setResult({ ok: true, head: '✓ copied', sub: `Paste it into an email to ${EMAIL}.` })
    } catch {
      setResult({ ok: false, head: 'could not reach the clipboard', sub: `Send it to ${EMAIL} instead.` })
    }
  }

  return (
    <div className="con">
      {/* The heading lives inside the left column rather than spanning both. Full width, it
          pushed the card down level with the Direct rows and left the top right of the page
          empty; in the column, `align-items: start` puts the card's label level with the
          top of the h1. On one column the order reads heading, rows, card. */}
      <div className="con-cols">
        <div className="con-stack" ref={colRef}>
          <div className="con-head">
            <h1 className="h1">Contact</h1>
            <p className="lede">
              For anything the Post board is the wrong place for — a licensing question, a
              security report, or something you would rather not put in public. A feature idea
              or a bug does better in <Link to="/post">post/</Link>, where everyone can see it
              and pile on.
            </p>
          </div>
          <RowGroup label="Direct" rows={DIRECT} onCopy={copyRow} keyRefs={keyRefs} />
          <RowGroup label="Elsewhere" rows={ELSEWHERE} onCopy={copyRow} keyRefs={keyRefs} />
        </div>

        <div className="con-stack">
          <div className="con-grp">
            <span className="lbl">Say hello</span>
            <form className="con-card" onSubmit={send}>
              <div className="con-fld">
                <label htmlFor="con-subject">Subject</label>
                <input
                  id="con-subject"
                  className="con-inp"
                  value={subject}
                  maxLength={120}
                  placeholder="what this is about"
                  onChange={(e) => setSubject(e.target.value)}
                />
              </div>
              <div className="con-fld">
                <label htmlFor="con-message">Message</label>
                <textarea
                  id="con-message"
                  className="con-inp tall"
                  value={message}
                  placeholder="what is on your mind"
                  spellCheck="true"
                  onChange={(e) => setMessage(e.target.value)}
                />
              </div>
              <div className="con-acts">
                <button className="con-send" type="submit" disabled={!canSend}>
                  {sending ? 'opening…' : 'send with Gmail'}
                  <span className="g" aria-hidden="true">
                    ▶
                  </span>
                </button>
                {/* The secondary path, for anyone who does not use Gmail. Without it, sending
                    would push an Outlook or Apple Mail user through a Gmail sign-in. */}
                <button className="con-alt" type="button" disabled={!canSend} onClick={sendViaMailApp}>
                  use my mail app
                </button>
                <button className="con-alt" type="button" disabled={body.length === 0} onClick={copyMessage}>
                  copy instead
                </button>
                {/* Only near the cap — a counter reading 1500 from the first keystroke is noise. */}
                {remaining < 300 ? (
                  <span className={`con-count${remaining < 0 ? ' over' : ''}`}>{remaining}</span>
                ) : null}
              </div>
            </form>
          </div>

          {result ? (
            <div className="con-grp">
              <span className="lbl">status</span>
              <div className="con-result" role="status" aria-live="polite">
                <span className="ok">{result.head}</span>
                <span className="sub">{result.sub}</span>
              </div>
            </div>
          ) : null}

          <p className="con-fine">
            This form sends nothing. It composes the message and hands it to Gmail or to your
            own mail app, so no server here ever sees it — the same promise LocalLens makes
            about your photos.
          </p>
        </div>
      </div>
    </div>
  )
}

function RowGroup({ label, rows, onCopy, keyRefs }) {
  return (
    <div className="con-grp">
      <span className="lbl">{label}</span>
      {rows.map((row) => (
        <div className="con-line-wrap" key={row.key}>
          <button className="con-line" type="button" onClick={() => onCopy(row)} title={`Copy ${row.value}`}>
            <span className="s" aria-hidden="true">
              $
            </span>
            <span
              className="k"
              ref={(el) => {
                if (el) keyRefs.current.set(row.key, el)
                else keyRefs.current.delete(row.key)
              }}
            >
              {row.key}
            </span>
            <span className="v">{row.value}</span>
          </button>
          <a
            className="con-go"
            href={row.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Open ${row.value}`}
            onClick={() => track('contact_link', { row: row.key })}
          >
            ↗
          </a>
        </div>
      ))}
    </div>
  )
}
