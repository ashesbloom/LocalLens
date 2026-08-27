// Plain node:assert check, no framework. Run via `node src/shell/commands.test.mjs`.
import assert from 'node:assert/strict'
import { ROUTES, NAV_ITEMS, resolveRoute, routeForPath, helpLines } from './commands.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- every cmd and every alias resolves to its own route's path ---
for (const route of ROUTES) {
  const target = route.url ?? route.path
  const got = resolveRoute(route.cmd)
  check((got?.url ?? got?.path) === target, `cmd '${route.cmd}' should resolve to ${target}`)
  for (const alias of route.aliases) {
    const g = resolveRoute(alias)
    check((g?.url ?? g?.path) === target, `alias '${alias}' should resolve to ${target}`)
  }
}

// --- unknown input is rejected ---
check(resolveRoute('not-a-real-command') === null, 'unknown input must not resolve')
check(resolveRoute('') === null, 'empty input must not resolve')
check(resolveRoute('   ') === null, 'whitespace-only input must not resolve')

// --- whitespace / case normalisation ('cd ~' and 'cd  ~' both work) ---
check(resolveRoute('cd ~')?.path === '/', "'cd ~' should resolve home")
check(resolveRoute('cd  ~')?.path === '/', 'repeated inner whitespace should still resolve home')
check(resolveRoute('  CD   ~  ')?.path === '/', 'leading/trailing whitespace and case should still resolve home')
check(resolveRoute('BLOG')?.path === '/blog', 'command lookup should be case-insensitive')
check(resolveRoute('  blog  ')?.path === '/blog', 'command lookup should trim surrounding whitespace')

// --- nav and the command table cannot drift ---
const routeTargets = new Set(ROUTES.map((r) => r.url ?? r.path))
check(NAV_ITEMS.length === 5, 'exactly 5 routes are in the nav (home is excluded by design)')
for (const item of NAV_ITEMS) {
  check(routeTargets.has(item.url ?? item.path), `nav item '${item.cmd}' target must exist in ROUTES`)
}
check(NAV_ITEMS.every((item) => ROUTES.includes(item)), 'NAV_ITEMS must be derived from ROUTES, not a separate list')
check(!NAV_ITEMS.some((item) => item.cmd === 'home'), 'home is intentionally not part of the nav')

// --- help is derived from the table, not a hand-maintained duplicate ---
const help = helpLines()
for (const route of ROUTES) {
  const mentioned = help.some((line) => line.startsWith(`${route.cmd} `) || line.startsWith(`${route.cmd},`))
  check(mentioned, `help must mention '${route.cmd}'`)
}


// --- external entries are exclusively external -------------------------------
// Nav.jsx and CommandLine.jsx both branch on `url`. A record carrying both would render as
// an anchor while still claiming a route, so the two surfaces could disagree.
for (const route of ROUTES) {
  if (route.url) {
    check(route.path === null, `external route '${route.cmd}' must not also declare a path`)
    check(/^https:\/\//.test(route.url), `external route '${route.cmd}' must be an https URL`)
  } else {
    check(typeof route.path === 'string', `route '${route.cmd}' must declare a path`)
  }
}
check(resolveRoute('mcp')?.url === 'https://locallensmcp.vercel.app', "'mcp' should resolve to the MCP agent site")
check(routeForPath('/agent') === null, 'there is no /agent route any more')

console.log(`ok — commands.test.mjs (${checks} checks)`)
