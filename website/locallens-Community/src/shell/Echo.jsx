import { useLayoutEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import gsap from 'gsap'
import { ScrambleTextPlugin } from 'gsap/ScrambleTextPlugin'
import { routeForPath } from './commands.js'
import { cachedPostFilename } from '../data/blog.js'

// Register once, at module level — never inside the component (it re-renders on every route).
gsap.registerPlugin(ScrambleTextPlugin)

function commandFor(pathname) {
  const route = routeForPath(pathname)
  if (route) return route.cmd

  // /blog/:id has no static ROUTES entry (it's a param route, not a typeable command) — give
  // it a real "reading a file" echo instead of falling through to the bare-path fallback
  // below. cachedPostFilename is a synchronous, cache-only lookup (Article.jsx does the
  // actual fetch): a hit — the common case, arriving from the Blog index, which just
  // populated that cache — prints the post's real <slug>.md; a miss (direct link, or the
  // index's 300s TTL already expired) falls back to the id itself, which is still a real,
  // sensible file name (task-6-brief.md).
  const articleId = pathname.match(/^\/blog\/([^/]+)$/)?.[1]
  if (articleId) return `cat blog/${cachedPostFilename(articleId) ?? `${articleId}.md`}`

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
