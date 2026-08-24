import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { routeForPath } from './commands.js'

// Register once, at module level — never inside the component (it re-renders on every route).
gsap.registerPlugin(ScrambleTextPlugin)

function commandFor(pathname) {
  const route = routeForPath(pathname)
  if (route) return route.cmd
  // No matching route (404) — echo what was actually typed in the URL, not a guess.
  return pathname.replace(/^\//, '') || 'home'
}

// The `locallens@community:~$ <cmd>` line shown above page content on every route change.
export default function Echo() {
  const { pathname } = useLocation()
  const wordRef = useRef(null)
  const cmd = commandFor(pathname)

  useLayoutEffect(() => {
    // gsap.matchMedia() already creates its own context — mm.revert() alone is the correct
    // cleanup here (no need to additionally nest a separate gsap.context()).
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: reduce)', () => {
      // Plain DOM write, not gsap.set({text}) — that property belongs to TextPlugin, which
      // isn't registered here. An instant set needs no tweening engine at all.
      if (wordRef.current) wordRef.current.textContent = cmd
    })
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.to(wordRef.current, {
        duration: 0.35,
        scrambleText: { text: cmd, chars: 'lowerCase', revealDelay: 0.1 },
      })
    })
    return () => mm.revert()
  }, [cmd])

  return (
    <p className="echo">
      locallens@community:~$ <b ref={wordRef}>{cmd}</b>
    </p>
  )
}
