import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  CHORD_PREFIX,
  CHORD_TARGETS,
  CHORD_TIMEOUT_MS,
  SHORTCUT_GROUPS,
  hasModifier,
  isTypingTarget,
  stepSection,
} from './keys.js'

// The site's global keyboard layer. Everything it knows lives in keys.js, which is derived
// from the route table — this file is only the wiring.
//
// Two rules it never breaks:
//   1. If the user is typing, the shell is not listening. Every branch below sits behind
//      isTypingTarget, so the command line keeps every keystroke that lands in it.
//   2. A held modifier belongs to the browser. Cmd/Ctrl+← is "back" and stays "back".
//
// Returns `chordArmed` so the status bar can show that `g` is waiting for its second key —
// a chord you cannot see is a chord nobody learns.
export function useShortcuts({ helpOpen, onOpenHelp }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [chordArmed, setChordArmed] = useState(false)
  const chordTimer = useRef(null)

  // Everything the listener needs is read through a ref, so the effect below has an empty
  // dependency array and the window listener is registered exactly once for the life of the
  // shell.
  //
  // That is not a micro-optimisation, it is the fix for a real bug. `navigate` from
  // react-router changes identity when the router's location settles, so listing it as a
  // dependency tore the listener down and rebuilt it shortly after every navigation — and
  // the cleanup clears the pending chord. Pressing `g` in that window silently disarmed it,
  // so roughly every other `g`-chord did nothing at all. Caught by the CDP driver in
  // scratch: `g w`, `g i`, `g b` worked and then `g a` did not.
  const pathRef = useRef(pathname)
  pathRef.current = pathname
  const helpOpenRef = useRef(helpOpen)
  helpOpenRef.current = helpOpen
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const openHelpRef = useRef(onOpenHelp)
  openHelpRef.current = onOpenHelp

  useEffect(() => {
    function disarm() {
      clearTimeout(chordTimer.current)
      chordTimer.current = null
      setChordArmed(false)
    }

    function onKeyDown(e) {
      // Auto-repeat is not a second press. Holding `g` for a beat emits a stream of keydowns,
      // and without this the pair below armed and disarmed the chord once per repeat — so
      // whether `g w` worked came down to whether the repeat count happened to be odd.
      // Found with a CDP driver pressing the real keys; it never showed up by hand because a
      // quick tap emits exactly one event.
      if (e.repeat) return
      if (hasModifier(e)) return
      if (isTypingTarget(e.target)) return
      // While the help dialog is open its own focus trap owns the keyboard, and Escape is
      // handled natively by <dialog>. Navigating behind an open modal would be a bug.
      if (helpOpenRef.current) return

      // A pending `g` consumes exactly one more key, whatever it is. An unrecognised second
      // key cancels rather than falling through to the single-key handlers below, so `g` then
      // `→` does not also step a section.
      //
      // Pressing `g` again is the exception: it restarts the wait instead of cancelling it,
      // which is what someone who taps `g`, hesitates, and taps it again actually means.
      if (chordTimer.current !== null) {
        if (e.key === CHORD_PREFIX) {
          clearTimeout(chordTimer.current)
          chordTimer.current = setTimeout(disarm, CHORD_TIMEOUT_MS)
          return
        }
        disarm()
        const target = CHORD_TARGETS[e.key.toLowerCase()]
        if (target?.path) {
          e.preventDefault()
          navigateRef.current(target.path)
        }
        return
      }

      if (e.key === CHORD_PREFIX) {
        setChordArmed(true)
        chordTimer.current = setTimeout(disarm, CHORD_TIMEOUT_MS)
        return
      }

      if (e.key === '?') {
        e.preventDefault()
        openHelpRef.current()
        return
      }

      // ←/→ step through the sections. ↑/↓/PgUp/PgDn/Home/End are deliberately absent: the
      // scrolling region is focused on every route change (see Frame.jsx), so the browser
      // already does all of that correctly and faster than we would.
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const target = stepSection(pathRef.current, e.key === 'ArrowRight' ? 1 : -1)
        if (target?.path) {
          e.preventDefault()
          navigateRef.current(target.path)
        }
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      clearTimeout(chordTimer.current)
      chordTimer.current = null
    }
    // Empty on purpose — see the refs above. This must run once, not per navigation.
  }, [])

  return { chordArmed }
}

// One chip per key. `+` between two keys means "together"; the chord group renders its two
// keys as a sequence instead, which the group heading explains once.
function Keys({ keys }) {
  return (
    <span className="keys-combo">
      {keys.map((k, i) => (
        <kbd key={i}>{k}</kbd>
      ))}
    </span>
  )
}

// A native <dialog> opened with showModal(): the focus trap, Escape-to-close, inertness of
// the page behind it and focus returning to whatever opened it are all browser behaviour.
// Hand-rolling those is where accessible modals usually go wrong.
export function KeyHelp({ open, onClose }) {
  const ref = useRef(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    else if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      className="keys-dialog"
      aria-labelledby="keys-title"
      onClose={onClose}
      // The backdrop is not a child, so a click that lands on the <dialog> element itself
      // rather than on any of its content is a click outside the panel.
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
    >
      <div className="keys-panel">
        <div className="keys-head">
          <p className="echo" id="keys-title">
            locallens@community:~$ <b>keys</b>
          </p>
          <button type="button" className="keys-close" onClick={onClose}>
            <kbd>Esc</kbd> close
          </button>
        </div>

        <div className="keys-groups">
          {SHORTCUT_GROUPS.map((group) => (
            <section className="keys-group" key={group.title}>
              <h2 className="lbl">{group.title}</h2>
              <p className="keys-hint">{group.hint}</p>
              <div className="keys-rows">
                {group.rows.map((row) => (
                  <div className="keys-row" key={row.keys.join(' ') + row.label}>
                    <Keys keys={row.keys} />
                    <span className="keys-label">{row.label}</span>
                    {row.note ? <span className="keys-note">{row.note}</span> : <span />}
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <p className="keys-foot">
          Nothing here needs a mouse. Type <b>help</b> at the prompt for the command list.
        </p>
      </div>
    </dialog>
  )
}
