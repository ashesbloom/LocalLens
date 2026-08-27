import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { resolveRoute, normalize, collapse, SYSTEM_COMMANDS, helpLines, lsEntries } from './commands.js'
import { getStats } from '../data/stats.js'
import { APP_VERSION } from '../data/version.js'
import { track } from '../data/analytics.js'

const HISTORY_LIMIT = 20

// The real input living in the header prompt. Handles its own history and the '/' / Escape
// shortcuts; delegates command output to the shell's single `message` slot via setMessage.
export default function CommandLine({ setMessage }) {
  const [value, setValue] = useState('')
  const [history, setHistory] = useState([]) // newest first, capped at HISTORY_LIMIT
  const historyIndexRef = useRef(-1) // -1 = not browsing history
  const inputRef = useRef(null)
  const navigate = useNavigate()

  // The only global shortcut: '/' focuses the command line, unless focus is already in a
  // text field (never hijacks typing elsewhere). Escape is handled locally on the input
  // itself below, since it only ever matters while the input already has focus.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key !== '/') return
      const t = e.target
      const isTyping = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
      if (isTyping) return
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
    if (!SYSTEM_COMMANDS.includes(norm)) {
      setMessage({ kind: 'text', lines: [`zsh: command not found: ${collapse(raw)} — try 'help'`] })
      return
    }

    switch (norm) {
      case 'help':
        setMessage({ kind: 'text', lines: helpLines() })
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
      case 'stats':
        setMessage({ kind: 'stats', stats: getStats() })
        break
      default:
        setMessage({ kind: 'text', lines: [`zsh: command not found: ${collapse(raw)} — try 'help'`] })
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.currentTarget.blur()
      setValue('')
      return
    }
    if (e.key === 'Enter') {
      const trimmed = value.trim()
      if (!trimmed) return
      run(trimmed)
      setValue('')
      return
    }
    if (e.key === 'ArrowUp') {
      if (history.length === 0) return
      e.preventDefault()
      const next = Math.min(historyIndexRef.current + 1, history.length - 1)
      historyIndexRef.current = next
      setValue(history[next])
      return
    }
    if (e.key === 'ArrowDown') {
      if (historyIndexRef.current < 0) return
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
      <input
        ref={inputRef}
        className="cmd-input"
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck="false"
        aria-label="Terminal command"
      />
      <span className="caret cmd-caret" aria-hidden="true" />
    </div>
  )
}
