// Plain node:assert check, no framework. Run via `node src/shell/commands.test.mjs`.
import assert from 'node:assert/strict'
import { ROUTES, NAV_ITEMS, resolveRoute, helpLines } from './commands.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- every cmd and every alias resolves to its own route's path ---
for (const route of ROUTES) {
  check(resolveRoute(route.cmd)?.path === route.path, `cmd '${route.cmd}' should resolve to ${route.path}`)
  for (const alias of route.aliases) {
    check(resolveRoute(alias)?.path === route.path, `alias '${alias}' should resolve to ${route.path}`)
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
const routePaths = new Set(ROUTES.map((r) => r.path))
check(NAV_ITEMS.length === 5, 'exactly 5 routes are in the nav (home is excluded by design)')
for (const item of NAV_ITEMS) {
  check(routePaths.has(item.path), `nav item '${item.cmd}' path must exist in ROUTES`)
}
check(NAV_ITEMS.every((item) => ROUTES.includes(item)), 'NAV_ITEMS must be derived from ROUTES, not a separate list')
check(!NAV_ITEMS.some((item) => item.cmd === 'home'), 'home is intentionally not part of the nav')

// --- help is derived from the table, not a hand-maintained duplicate ---
const help = helpLines()
for (const route of ROUTES) {
  const mentioned = help.some((line) => line.startsWith(`${route.cmd} `) || line.startsWith(`${route.cmd},`))
  check(mentioned, `help must mention '${route.cmd}'`)
}

console.log(`ok — commands.test.mjs (${checks} checks)`)
