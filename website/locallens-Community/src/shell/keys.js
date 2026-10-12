// The keyboard layer's data. Pure functions and plain objects — no JSX, no React — so this
// file runs under plain `node` for commands.test.mjs, the same constraint commands.js keeps.
//
// Everything here is derived from ROUTES rather than maintained beside it. A new route with
// a `key` gets its chord, its help row and its place in the arrow cycle for free; the test
// catches the one thing derivation cannot, which is two routes claiming the same letter.
import { NAV_ITEMS, ROUTES } from './commands.js'

// How long a pending `g` waits for its second key before giving up. Long enough to be typed
// deliberately, short enough that a `g` pressed by accident does not lie in wait.
export const CHORD_TIMEOUT_MS = 1400

// Single keys the shell claims globally. A chord letter must never collide with one of these,
// or the chord's first press would be swallowed by the action instead.
export const GLOBAL_KEYS = ['/', '?']

// The `g` prefix itself.
export const CHORD_PREFIX = 'g'

// letter -> route, for every route that opted into a chord.
export const CHORD_TARGETS = Object.fromEntries(
  ROUTES.filter((r) => r.key).map((r) => [r.key, r]),
)

// What ←/→ cycles through. Nav order, but internal routes only: the MCP agent is an external
// URL, and an arrow key that opens a new browser tab is a genuinely surprising thing to have
// built. Home is not in the cycle either — it is `g h`, and a wrap-around that kept landing
// on the front page would make the arrows feel like they had lost their place.
export const SECTION_CYCLE = NAV_ITEMS.filter((r) => r.path)

// Where ←/→ go from `pathname`. Wraps at both ends. A pathname outside the cycle (home, a
// 404, an article) is treated as "before the first section", so → enters at the start and
// ← enters at the end — from anywhere, one arrow press lands somewhere real.
export function stepSection(pathname, delta) {
  const cycle = SECTION_CYCLE
  if (cycle.length === 0) return null
  const index = cycle.findIndex((r) => r.path === pathname)
  if (index === -1) return delta > 0 ? cycle[0] : cycle[cycle.length - 1]
  const next = (index + delta + cycle.length) % cycle.length
  return cycle[next]
}

// True when the event target is somewhere the user is composing text, and the shell must keep
// its hands off every key. CommandLine's '/' handler and the global shortcut hook both ask
// this — they used to carry separate copies, which is exactly how one of them ends up
// hijacking a keystroke the other correctly ignores.
export function isTypingTarget(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true
}

// True when a modifier is held. Browser and OS shortcuts win over ours, always — Cmd+←
// is "back" and must stay "back".
export function hasModifier(e) {
  return e.metaKey || e.ctrlKey || e.altKey
}

// The help overlay's content, and the answer to "all the keys should be mentioned properly".
// Grouped the way someone learns them: jump somewhere, move around, then the shell itself.
export const SHORTCUT_GROUPS = [
  {
    title: 'Jump to a section',
    hint: 'press g, then the letter',
    rows: [
      ...ROUTES.filter((r) => r.key).map((r) => ({
        keys: ['g', r.key],
        label: r.cmd === 'home' ? 'Home' : r.label,
        note: r.cmd === 'how' ? 'walkthrough' : r.cmd === 'pipeline' ? 'inside the engine' : '',
      })),
    ],
  },
  {
    title: 'Move around',
    hint: 'no prefix — just press it',
    rows: [
      { keys: ['←'], label: 'Previous section', note: 'wraps around' },
      { keys: ['→'], label: 'Next section', note: 'wraps around' },
      { keys: ['↑'], label: 'Scroll up', note: '' },
      { keys: ['↓'], label: 'Scroll down', note: '' },
      { keys: ['PgUp'], label: 'Scroll up a screen', note: '' },
      { keys: ['PgDn'], label: 'Scroll down a screen', note: '' },
      { keys: ['Home'], label: 'Top of the page', note: '' },
      { keys: ['End'], label: 'Bottom of the page', note: '' },
      { keys: ['Tab'], label: 'Next link or control', note: 'Shift+Tab goes back' },
    ],
  },
  {
    title: 'The command line',
    hint: 'the prompt in the header',
    rows: [
      { keys: ['/'], label: 'Focus the command line', note: 'from anywhere' },
      { keys: ['Tab'], label: 'Accept the suggestion', note: 'the dim text after the cursor' },
      { keys: ['\u2192'], label: 'Accept the suggestion', note: 'from the end of the line' },
      { keys: ['Enter'], label: 'Run what you typed', note: '' },
      { keys: ['↑'], label: 'Previous command', note: 'while the prompt has focus' },
      { keys: ['↓'], label: 'Next command', note: 'while the prompt has focus' },
      { keys: ['Esc'], label: 'Clear and leave the prompt', note: '' },
      { keys: ['?'], label: 'Open this list', note: 'or type keys' },
    ],
  },
]
