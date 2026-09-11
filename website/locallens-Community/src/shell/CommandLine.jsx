import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveRoute, normalize, collapse, completions, SYSTEM_COMMANDS, helpLines, lsEntries } from './commands.js'
import { isTypingTarget } from './keys.js'
import { adminKey, clearAdminKey, setAdminKey } from '../data/mine.js'
import { loadStats } from '../data/stats.js'
import { APP_VERSION } from '../data/version.js'
import { track } from '../data/analytics.js'

const HISTORY_LIMIT = 20

// The real input living in the header prompt. Handles its own history and the '/' / Escape
// shortcuts; delegates command output to the shell's single `message` slot via setMessage.
export default function CommandLine({ setMessage, onOpenHelp }) {
  const [value, setValue] = useState('')
  // While true the prompt is collecting the admin key rather than a command: the input is a
  // password field, the shadow renders bullets, and nothing typed reaches the history. The
  // whole reason for a mode rather than an inline `admin <key>` argument is that an argument
  // would sit in the history for anyone who presses the up arrow.
  const [secretMode, setSecretMode] = useState(false)
  const [history, setHistory] = useState([]) // newest first, capped at HISTORY_LIMIT
  const historyIndexRef = useRef(-1) // -1 = not browsing history
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // The suggestion is derived, never stored: there is no state that can fall out of step
  // with what has been typed. `ghost` is only the tail — what the shadow span renders after
  // the real text — while accepting sets the whole candidate, so typing `PO` and pressing
  // Tab yields `post`, not `POst`.
  const suggestions = secretMode ? [] : completions(value)
  const ghost = suggestions.length > 0 ? suggestions[0].slice(normalize(value).length) : ''

  // '/' focuses the command line, unless focus is already in a text field (never hijacks
  // typing elsewhere). It lives here rather than in the shared shortcut layer because it is
  // the one shortcut that needs this component's own inputRef. Escape is handled locally on
  // the input below, since it only ever matters while the input already has focus.
  //
  // The typing check is imported, not re-implemented: Shortcuts.jsx asks the same question
  // about every key it handles, and two private copies of that rule is how one surface ends
  // up swallowing a keystroke the other correctly ignores.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== '/') return
      if (isTypingTarget(e.target)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  function run(raw) {
    setHistory((h) => [collapse(raw), ...h].slice(0, HISTORY_LIMIT))
    historyIndexRef.current = -1

    const route = resolveRoute(raw)
    if (route) {
      setMessage(null)
      if (route.url) {
        window.open(route.url, '_blank', 'noopener,noreferrer')
        track('agent_click', { from: `command:${route.cmd}` })
      } else {
        navigate(route.path)
      }
      return
    }

    const norm = normalize(raw)

    if (norm === 'admin off') {
      clearAdminKey()
      setMessage({ kind: 'text', lines: ['admin mode off'] })
      return
    }

    if (!SYSTEM_COMMANDS.includes(norm)) {
      setMessage({ kind: 'text', lines: [`zsh: command not found: ${collapse(raw)} — try 'help'`] })
      return
    }

    switch (norm) {
      case 'help':
        setMessage({ kind: 'text', lines: helpLines() })
        break
      case 'keys':
        // Same dialog '?' opens — one surface, two ways in, so the keyboard list can never
        // be documented in two places that disagree.
        setMessage(null)
        onOpenHelp?.()
        break
      case 'ls':
        setMessage({ kind: 'ls', entries: lsEntries() })
        break
      case 'clear':
        setMessage(null)
        navigate('/')
        break
      case 'version':
        setMessage({ kind: 'text', lines: [`v${APP_VERSION}`] })
        break
      case 'whoami':
        setMessage(null)
        navigate('/')
        break
      case 'github':
        window.open('https://github.com/ashesbloom/LocalLens', '_blank', 'noopener,noreferrer')
        track('repo_click', { from: 'command:github' })
        setMessage(null)
        break
      case 'download':
        window.open('https://github.com/ashesbloom/LocalLens/releases/latest', '_blank', 'noopener,noreferrer')
        track('repo_click', { from: 'command:download' })
        setMessage(null)
        break
      case 'admin':
        setSecretMode(true)
        setMessage({ kind: 'text', lines: ['admin key — typing is hidden, Enter to confirm, Esc to cancel'] })
        break
      case 'stats':
        // No payload: the rows subscribe to the store themselves, so they fill in if this
        // fetch is still in flight. Frame already loaded on mount; this call de-duplicates
        // against that and only does real work if it somehow failed.
        loadStats()
        setMessage({ kind: 'stats' })
        break
      default:
        setMessage({ kind: 'text', lines: [`zsh: command not found: ${collapse(raw)} — try 'help'`] })
    }
  }

  function onKeyDown(e) {
    // Tab takes the suggestion on screen. With nothing to suggest it is deliberately left
    // alone — Tab has to keep moving focus out of the header, or the prompt becomes a
    // keyboard trap for anyone navigating without a mouse.
    if (e.key === 'Tab') {
      if (!ghost) return
      e.preventDefault()
      setValue(suggestions[0])
      return
    }
    // → also accepts, but only from the end of the line, where there is no text left to
    // move across. Anywhere else it stays an ordinary cursor key.
    if (e.key === 'ArrowRight') {
      const el = e.currentTarget
      if (!ghost || el.selectionStart !== value.length || el.selectionEnd !== value.length) return
      e.preventDefault()
      setValue(suggestions[0])
      return
    }
    if (e.key === 'Escape') {
      if (secretMode) {
        setSecretMode(false)
        setValue('')
        setMessage({ kind: 'text', lines: ['cancelled'] })
        return
      }
      e.currentTarget.blur()
      setValue('')
      return
    }
    if (e.key === 'Enter') {
      if (secretMode) {
        e.preventDefault()
        const stored = setAdminKey(value)
        setSecretMode(false)
        setValue('')
        setMessage({
          kind: 'text',
          lines: stored
            ? ['admin mode on — delete appears on every post. `admin off` clears it.']
            : ['nothing entered — admin mode unchanged'],
        })
        return
      }
      const trimmed = value.trim()
      if (!trimmed) return
      run(trimmed)
      setValue('')
      return
    }
    if (e.key === 'ArrowUp') {
      if (secretMode || history.length === 0) return
      e.preventDefault()
      const next = Math.min(historyIndexRef.current + 1, history.length - 1)
      historyIndexRef.current = next
      setValue(history[next])
      return
    }
    if (e.key === 'ArrowDown') {
      if (secretMode || historyIndexRef.current < 0) return
      e.preventDefault()
      const next = historyIndexRef.current - 1
      historyIndexRef.current = next
      setValue(next < 0 ? '' : history[next])
    }
  }

  return (
    <div className="hdr-cmd">
      <Link to="/" className="hdr-prompt" aria-label="LocalLens Community — home">
        <span className="sym">&gt;.</span>{' '}
        <span className="prompt-full">locallens@community:~$</span>
        <span className="prompt-short">locallens:~$</span>
      </Link>
      <span className="cmd-field">
        <input
          ref={inputRef}
          className="cmd-input"
          type={secretMode ? 'password' : 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck="false"
          aria-label={secretMode ? 'Admin key' : 'Terminal command'}
        />
        {/* A hidden copy of the typed text, laid over the input in the same font. It exists
            so the block cursor and the ghost land at the real cursor position without any
            character-width arithmetic — .cmd-typed is invisible but still takes up exactly
            the room the visible text does, which puts everything after it in the right
            place whatever the font's metrics turn out to be. The caret was previously a
            sibling *after* a fixed 16ch input, so it sat 16 characters from the prompt no
            matter what had been typed. aria-hidden throughout: the input itself is what a
            screen reader should read. */}
        <span className="cmd-shadow" aria-hidden="true">
          <span className="cmd-typed">{secretMode ? '\u2022'.repeat(value.length) : value}</span>
          {/* Zero-width, so the block overlays the next character instead of shoving the
              ghost sideways. `key` remounts it on every keystroke, restarting the blink at
              full opacity — a terminal cursor is solid while you type, and only blinks once
              you stop. */}
          <i className="cmd-cursor">
            <i className="cmd-caret" key={value} />
          </i>
          <span className="cmd-ghost">{ghost}</span>
        </span>
      </span>
    </div>
  )
}
