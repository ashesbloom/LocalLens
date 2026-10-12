// Single source of truth for every route/command. Nav.jsx and CommandLine.jsx both derive
// from ROUTES so they can never disagree about what routes exist; commands.test.mjs asserts
// that. Pure data + lookup helpers, no JSX/React import — this file (and its test) must run
// under plain `node`. (version.js is a plain data module too — no JSX — so importing it here
// keeps that guarantee.)
import { APP_VERSION } from '../data/version.js'

// Each record carries three independent switches, because these three questions have three
// different answers and collapsing them is what makes lists drift apart:
//   nav    — shows in the header nav bar
//   listed — shows in `ls` output and Home's section list
//   key    — the letter that follows `g` to jump here (null = no chord)
export const ROUTES = [
  {
    cmd: 'post',
    title: 'Community board — LocalLens',
    description: 'Report a bug, ask for a feature, or show what you built with LocalLens, the offline photo organizer. No account needed.',
    aliases: [],
    path: '/post',
    label: 'Post',
    icon: 'post',
    blurb: 'report a bug, ask for a feature, say what you built',
    nav: true,
    listed: true,
    key: 'p',
  },
  {
    cmd: 'announce',
    title: "What's new in LocalLens — releases and roadmap",
    description: "Every LocalLens release, what is being built next, and what is being tested in Labs, taken straight from the project's changelog.",
    aliases: ['announcements', 'whatsnew'],
    path: '/announce',
    label: 'Announcement',
    icon: 'announce',
    blurb: 'what shipped, what is coming, what we are testing',
    nav: true,
    listed: true,
    key: 'a',
  },
  {
    cmd: 'blog',
    title: 'LocalLens blog — building a photo organizer in the open',
    description: 'Posts on how LocalLens, the offline photo organizer, is built: face recognition, sorting, packaging and the decisions behind them.',
    aliases: [],
    path: '/blog',
    label: 'Blog',
    icon: 'blog',
    blurb: 'how LocalLens is built, in the open',
    nav: true,
    listed: true,
    key: 'b',
  },
  {
    cmd: 'how',
    title: 'How LocalLens sorts your photos, step by step',
    description: 'What happens to a folder of photos in LocalLens: what it reads, how folders are named, and why nothing is uploaded. Plain English, six diagrams.',
    aliases: ['how-it-works', 'walkthrough', 'sorted'],
    path: '/how',
    label: 'How it works',
    icon: 'how',
    blurb: 'what happens to your photos, in plain English',
    // `g w` for walkthrough — `g h` is already home, and home is the more common jump.
    nav: true,
    listed: true,
    key: 'w',
    echo: 'cat how-it-works.md',
  },
  {
    cmd: 'pipeline',
    title: 'Inside the LocalLens photo pipeline',
    description: 'The engineering behind LocalLens: the face-detection ladder, the encoding cache and the copy-safe write path, with the measured numbers behind each.',
    aliases: ['internals', 'engine', 'arch'],
    path: '/pipeline',
    label: 'Pipeline',
    icon: 'pipeline',
    blurb: 'the engine in detail: ladder, cache, write path',
    nav: true,
    listed: true,
    key: 'i',
    echo: 'cat pipeline.md',
  },
  {
    // External: the MCP agent has its own site, so there is no /agent route here — the nav
    // item and the command open it directly. `path` stays null and `url` carries it; Nav and
    // CommandLine branch on `url`, and commands.test.mjs asserts both shapes.
    //
    // Deliberately has no `key`: a chord that opens a new browser tab is not what someone
    // pressing an arrow or a two-key jump expects. Reachable by typing `agent` / `mcp`.
    cmd: 'agent',
    aliases: ['ll-agent', 'mcp'],
    path: null,
    url: 'https://www.locallens.in',
    label: 'LL Agent',
    icon: 'agent',
    blurb: 'run LocalLens from Claude Desktop',
    nav: true,
    listed: true,
    key: null,
  },
  {
    cmd: 'contact',
    title: 'Contact LocalLens',
    description: 'Get in touch with the people who build LocalLens, the free, offline, privacy-first photo organizer for macOS and Windows.',
    aliases: [],
    path: '/contact',
    label: 'Contact',
    icon: 'contact',
    blurb: 'reach us directly',
    nav: true,
    listed: true,
    key: 'c',
  },
  // The five reference pages below exist for people arriving from a search engine or an AI
  // answer, so they are listed (Home, `ls`, the sitemap) but kept out of the header — seven
  // nav items is already the most the bar holds. `install` and `metrics` are not named after
  // their paths because `download` and `stats` were shell commands first, and resolveRoute
  // runs before the system commands, so reusing either name would silently change what it does.
  {
    cmd: 'install',
    aliases: ['get', 'setup'],
    path: '/download',
    title: 'Download LocalLens for macOS and Windows',
    description:
      'Install LocalLens, the offline photo organizer: Homebrew or a DMG on macOS, an installer on Windows. Free and open source under AGPL-3.0.',
    label: 'Download',
    icon: null,
    blurb: 'install it on macOS or Windows',
    nav: false,
    listed: true,
    key: null,
    echo: 'cat install.md',
  },
  {
    cmd: 'privacy',
    aliases: [],
    path: '/privacy',
    title: 'LocalLens privacy — your photos never leave your computer',
    description:
      'Every LocalLens privacy claim, with the command that lets you check it yourself, and the few network calls that do exist, stated up front.',
    label: 'Privacy',
    icon: null,
    blurb: 'what stays on your machine, and how to check',
    nav: false,
    listed: true,
    key: null,
    echo: 'cat privacy.md',
  },
  {
    cmd: 'faq',
    aliases: ['questions'],
    path: '/faq',
    title: 'LocalLens FAQ — the offline photo organizer, answered',
    description:
      'Answers about LocalLens: is it free, does it upload anything, how face recognition works offline, which formats it reads, and how to install it.',
    label: 'FAQ',
    icon: null,
    blurb: 'short answers to the common questions',
    nav: false,
    listed: true,
    key: null,
    echo: 'cat faq.md',
  },
  {
    cmd: 'compare',
    aliases: ['vs', 'alternatives'],
    path: '/compare',
    title: 'LocalLens vs Google Photos, Apple Photos and digiKam',
    description:
      'How LocalLens compares with Google Photos, Apple Photos and digiKam: where faces are processed, what gets uploaded, platforms, licence and price.',
    label: 'Compare',
    icon: null,
    blurb: 'LocalLens next to Google Photos, Apple Photos, digiKam',
    nav: false,
    listed: true,
    key: null,
    echo: 'cat compare.md',
  },
  {
    cmd: 'metrics',
    aliases: ['numbers'],
    path: '/stats',
    title: 'LocalLens by the numbers — stars, downloads, visits',
    description:
      'Live GitHub stars, release downloads and site visits for LocalLens, and why there is no user count: the app sends no telemetry at all.',
    label: 'Stats',
    icon: null,
    blurb: 'stars, downloads and visits, live',
    nav: false,
    listed: true,
    key: null,
    echo: 'cat stats.md',
  },
  {
    cmd: 'home',
    aliases: ['cd ~', 'cd', '~'],
    path: '/',
    title: 'LocalLens — offline, privacy-first photo organizer',
    description:
      'LocalLens sorts photos by date, location and face on your own computer. Nothing is uploaded. Free and open source (AGPL-3.0) for macOS and Windows.',
    label: 'Home',
    icon: null,
    blurb: '',
    nav: false,
    listed: false,
    key: 'h',
  },
]

// Commands with no route of their own — handled by CommandLine's dispatcher, not by lookup.
export const SYSTEM_COMMANDS = ['help', 'keys', 'ls', 'clear', 'version', 'whoami', 'github', 'download', 'stats', 'admin']

export const NAV_ITEMS = ROUTES.filter((r) => r.nav)

// Where the site lives. Canonical links, the sitemap and the JSON-LD all build on this.
export const SITE_URL = 'https://locallens-community.pages.dev'

// Every internal page. scripts/prerender.mjs writes each one to static HTML at build time,
// and the sitemap lists exactly these.
export const PAGES = ROUTES.filter((r) => r.path)

// `ls` is no longer the same list as the nav bar: home is in neither, but the split exists so
// a page can be listed without also being a seventh thing in the header, should that change.
export const LISTED_ITEMS = ROUTES.filter((r) => r.listed)

export function collapse(input) {
  return input.trim().replace(/\s+/g, ' ')
}

export function normalize(input) {
  return collapse(input).toLowerCase()
}

const ROUTE_LOOKUP = new Map()
for (const route of ROUTES) {
  ROUTE_LOOKUP.set(route.cmd, route)
  for (const alias of route.aliases) ROUTE_LOOKUP.set(alias, route)
}

export function resolveRoute(input) {
  return ROUTE_LOOKUP.get(normalize(input)) ?? null
}

export function routeForPath(pathname) {
  return ROUTES.find((r) => r.path === pathname) ?? null
}

// ── completion ────────────────────────────────────────────────────────────────────
// Every name the prompt accepts, in the order a suggestion should prefer them: the routes
// in declaration order (which is nav order, so `p` suggests post before anything else),
// each followed by its own aliases, then the system commands. Declaration order rather than
// alphabetical is deliberate — `h` should suggest `how` before `home` before `help`, and
// alphabetising would put `help` first, which is the least likely of the three.
const ALL_COMMANDS = [...ROUTES.flatMap((r) => [r.cmd, ...r.aliases]), ...SYSTEM_COMMANDS]

// What `input` could still become. An exact match is not one of its own completions — there
// is nothing left to suggest once a name is fully typed — but a longer name that starts with
// it still is, which is why `how` keeps offering `how-it-works`.
export function completions(input) {
  const q = normalize(input)
  if (!q) return []
  return ALL_COMMANDS.filter((c) => c.startsWith(q) && c !== q)
}

// `ls` content — same section list the Home page shows. Meta is real where the site
// actually has the number (the shipped version; the MCP agent's verified tool count) and
// '—' everywhere else — open-issue counts and view counts are not fetched yet (Task 7).
// The 16/10 split — counted by parsing the decorators in
// locallens_mcp_agent/src/mcp_server/tools/*.py: 26 functions with @mcp.tool, 10 of them
// @require_pro (a raw grep says 11; one hit is prose). start_find_group is free. Must not be
// flattened into a bare "26 tools" (task-5-brief.md) — shown as '16+10' to keep both numbers
// visible even in this compact column.
const LS_META = {
  post: 'open',
  announce: `v${APP_VERSION}`,
  blog: '—',
  how: '5 min read',
  pipeline: '12 min read',
  agent: '16+10 tools',
  contact: 'email',
  install: 'macOS · Windows',
  privacy: '0 photos uploaded',
  faq: 'Q&A',
  compare: '4 apps',
  metrics: 'live',
}

export function lsEntries() {
  // `to`/`href` make each row a real link, so the list is a way in for a crawler as well as a reader.
  return LISTED_ITEMS.map((r) => ({
    name: `${r.cmd}/`,
    to: r.path,
    href: r.url,
    blurb: r.blurb,
    meta: LS_META[r.cmd] ?? '—',
  }))
}

// Derived from ROUTES, not hand-maintained — one line per navigable command, plus one line
// per system command (those have no backing table; they're prose-only in the brief).
export function helpLines() {
  const routeLines = ROUTES.map((r) => {
    const names = [r.cmd, ...r.aliases].join(', ')
    return r.url ? `${names} — open ${r.url} in a new tab` : `${names} — go to ${r.path}`
  })
  // `keys` and `whoami` are deliberately absent: both still run when typed and still
  // tab-complete, they are just not advertised here. `keys` is advertised by the status
  // bar's own `? keys` button instead, which is a better place for it — a keyboard hint
  // belongs on screen, not in a list you have to ask for. commands.test.mjs pins this so
  // neither can drift back in unnoticed.
  const systemLines = [
    'help — list every command',
    'ls — list sections',
    'clear — clear this output and go home',
    'version — print the current version',
    'github — open the repo in a new tab',
    'download — open the latest release in a new tab',
    'stats — print repo stats',
    'admin — enter the board admin key (admin off clears it)',
  ]
  return [...routeLines, ...systemLines]
}
