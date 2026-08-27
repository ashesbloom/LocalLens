// Single source of truth for every route/command. Nav.jsx and CommandLine.jsx both derive
// from ROUTES so they can never disagree about what routes exist; commands.test.mjs asserts
// that. Pure data + lookup helpers, no JSX/React import — this file (and its test) must run
// under plain `node`. (version.js is a plain data module too — no JSX — so importing it here
// keeps that guarantee.)
import { APP_VERSION } from '../data/version.js'

export const ROUTES = [
  {
    cmd: 'post',
    aliases: [],
    path: '/post',
    label: 'Post',
    icon: 'post',
    blurb: 'file a request or report a bug',
    nav: true,
  },
  {
    cmd: 'announce',
    aliases: ['announcements', 'whatsnew'],
    path: '/announce',
    label: 'Announcement',
    icon: 'announce',
    blurb: 'what shipped, what is coming, what we are testing',
    nav: true,
  },
  {
    cmd: 'blog',
    aliases: [],
    path: '/blog',
    label: 'Blog',
    icon: 'blog',
    blurb: 'how LocalLens is built, in the open',
    nav: true,
  },
  {
    // External: the MCP agent has its own site, so there is no /agent route here — the nav
    // item and the command open it directly. `path` stays null and `url` carries it; Nav and
    // CommandLine branch on `url`, and commands.test.mjs asserts both shapes.
    cmd: 'agent',
    aliases: ['ll-agent', 'mcp'],
    path: null,
    url: 'https://locallensmcp.vercel.app',
    label: 'LL Agent',
    icon: 'agent',
    blurb: 'run LocalLens from Claude Desktop',
    nav: true,
  },
  {
    cmd: 'contact',
    aliases: [],
    path: '/contact',
    label: 'Contact',
    icon: 'contact',
    blurb: 'reach us directly',
    nav: true,
  },
  {
    cmd: 'home',
    aliases: ['cd ~', 'cd', '~'],
    path: '/',
    label: 'Home',
    icon: null,
    blurb: '',
    nav: false,
  },
]

// Commands with no route of their own — handled by CommandLine's dispatcher, not by lookup.
export const SYSTEM_COMMANDS = ['help', 'ls', 'clear', 'version', 'whoami', 'github', 'download', 'stats']

export const NAV_ITEMS = ROUTES.filter((r) => r.nav)

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

// `ls` content — same section list the Home page shows. Meta is real where the site
// actually has the number (the shipped version; the MCP agent's verified tool count) and
// '—' everywhere else — open-issue counts and view counts are not fetched yet (Task 7).
// The 15/11 split (by @require_pro decorator in locallens_mcp_agent/src/mcp_server/tools/*.py
// — the README and marketing/CLAIMS.md both say 16/10, which miscounts start_find_group as
// free when it is Pro-gated) must not be flattened into a bare "26 tools" (task-5-brief.md) —
// shown here as '15+11' to keep both numbers visible even in this compact column.
const LS_META = {
  post: '—',
  announce: `v${APP_VERSION}`,
  blog: '—',
  agent: '15+11 tools',
  contact: '—',
}

export function lsEntries() {
  return NAV_ITEMS.map((r) => ({ name: `${r.cmd}/`, blurb: r.blurb, meta: LS_META[r.cmd] ?? '—' }))
}

// Derived from ROUTES, not hand-maintained — one line per navigable command, plus one line
// per system command (those have no backing table; they're prose-only in the brief).
export function helpLines() {
  const routeLines = ROUTES.map((r) => {
    const names = [r.cmd, ...r.aliases].join(', ')
    return r.url ? `${names} — open ${r.url} in a new tab` : `${names} — go to ${r.path}`
  })
  const systemLines = [
    'help — list every command',
    'ls — list sections',
    'clear — clear this output and go home',
    'version — print the current version',
    'whoami — go home',
    'github — open the repo in a new tab',
    'download — open the latest release in a new tab',
    'stats — print repo stats',
  ]
  return [...routeLines, ...systemLines]
}
