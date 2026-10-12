// Plain node:assert check, no framework. Run via `node src/shell/commands.test.mjs`.
import assert from 'node:assert/strict'
import { ROUTES, NAV_ITEMS, LISTED_ITEMS, SYSTEM_COMMANDS, resolveRoute, routeForPath, helpLines, completions } from './commands.js'
import { CHORD_TARGETS, GLOBAL_KEYS, CHORD_PREFIX, SECTION_CYCLE, stepSection, isTypingTarget, SHORTCUT_GROUPS } from './keys.js'

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
check(NAV_ITEMS.length === 7, 'exactly 7 routes are in the nav (home is excluded by design)')
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

// --- the two explainer routes exist and are reachable every way they claim to be ---
for (const [cmd, path] of [['how', '/how'], ['pipeline', '/pipeline']]) {
  check(resolveRoute(cmd)?.path === path, `'${cmd}' should resolve to ${path}`)
  check(routeForPath(path)?.cmd === cmd, `${path} should map back to '${cmd}'`)
  check(LISTED_ITEMS.some((r) => r.cmd === cmd), `'${cmd}' must appear in ls output`)
  check(NAV_ITEMS.some((r) => r.cmd === cmd), `'${cmd}' must appear in the nav`)
}
check(resolveRoute('walkthrough')?.path === '/how', "'walkthrough' should alias /how")
check(resolveRoute('internals')?.path === '/pipeline', "'internals' should alias /pipeline")

// --- ls and the nav bar are separate lists that happen to agree today -------------
// lsEntries() reads LISTED_ITEMS, not NAV_ITEMS. If those are ever wired back together,
// this is the check that notices before a page silently vanishes from one surface.
for (const item of LISTED_ITEMS) {
  check(ROUTES.includes(item), `listed item '${item.cmd}' must be a real route`)
}
check(!LISTED_ITEMS.some((r) => r.cmd === 'home'), 'home is intentionally not listed')

// --- keyboard: chords are derived from ROUTES, so only collisions need asserting ---
const seenKeys = new Map()
for (const route of ROUTES) {
  if (!route.key) continue
  check(!seenKeys.has(route.key), `chord 'g ${route.key}' is claimed by both '${seenKeys.get(route.key)}' and '${route.cmd}'`)
  seenKeys.set(route.key, route.cmd)
  check(/^[a-z]$/.test(route.key), `chord key for '${route.cmd}' must be a single lowercase letter`)
  check(!GLOBAL_KEYS.includes(route.key), `chord key '${route.key}' must not collide with a global single key`)
  check(route.key !== CHORD_PREFIX, `chord key for '${route.cmd}' must not be the prefix itself`)
  check(CHORD_TARGETS[route.key] === route, `CHORD_TARGETS must map '${route.key}' to '${route.cmd}'`)
}
check(seenKeys.size === Object.keys(CHORD_TARGETS).length, 'CHORD_TARGETS must cover exactly the routes with keys')

// An external route must never get a chord — the chord would open a browser tab.
for (const route of ROUTES) {
  if (route.url) check(!route.key, `external route '${route.cmd}' must not have a chord`)
}

// --- the arrow cycle only ever lands on an internal page -------------------------
check(SECTION_CYCLE.length > 0, 'the section cycle must not be empty')
for (const route of SECTION_CYCLE) {
  check(typeof route.path === 'string', `cycle entry '${route.cmd}' must have a path`)
  check(!route.url, `cycle must not contain the external route '${route.cmd}'`)
}
check(!SECTION_CYCLE.some((r) => r.cmd === 'agent'), 'the arrow cycle must skip the external agent link')

// stepSection wraps at both ends, and enters the cycle from anywhere outside it.
const first = SECTION_CYCLE[0]
const last = SECTION_CYCLE[SECTION_CYCLE.length - 1]
check(stepSection(last.path, 1) === first, 'forward from the last section wraps to the first')
check(stepSection(first.path, -1) === last, 'back from the first section wraps to the last')
check(stepSection('/', 1) === first, 'forward from home enters at the first section')
check(stepSection('/', -1) === last, 'back from home enters at the last section')
check(stepSection('/blog/some-article', 1) === first, 'forward from an off-cycle page enters at the first section')
for (let i = 0; i < SECTION_CYCLE.length; i++) {
  check(stepSection(SECTION_CYCLE[i].path, 1) === SECTION_CYCLE[(i + 1) % SECTION_CYCLE.length], `-> from ${SECTION_CYCLE[i].path}`)
}

// --- the shell keeps its hands off text fields -----------------------------------
check(isTypingTarget({ tagName: 'INPUT' }), 'an input is a typing target')
check(isTypingTarget({ tagName: 'TEXTAREA' }), 'a textarea is a typing target')
check(isTypingTarget({ tagName: 'DIV', isContentEditable: true }), 'a contenteditable is a typing target')
check(!isTypingTarget({ tagName: 'DIV' }), 'a plain div is not a typing target')
check(!isTypingTarget({ tagName: 'A' }), 'a link is not a typing target')
check(!isTypingTarget(null), 'a null target is not a typing target')

// --- every shortcut is documented, and 'keys' is a real command ------------------
const documented = new Set(SHORTCUT_GROUPS.flatMap((g) => g.rows.map((r) => r.keys.join(' '))))
for (const [letter, route] of Object.entries(CHORD_TARGETS)) {
  check(documented.has(`${CHORD_PREFIX} ${letter}`), `chord for '${route.cmd}' must appear in the help overlay`)
}
for (const key of GLOBAL_KEYS) {
  check(documented.has(key), `global key '${key}' must appear in the help overlay`)
}
for (const arrow of ['\u2190', '\u2192', '\u2191', '\u2193']) {
  check(documented.has(arrow), `arrow '${arrow}' must appear in the help overlay`)
}
check(SYSTEM_COMMANDS.includes('keys'), "'keys' must be a system command")

// --- deliberately unlisted commands ------------------------------------------------
// `keys` and `whoami` run, and complete, but are not advertised by `help`. That is a
// decision, not an omission: the status bar's own `? keys` button is where the keyboard
// list is advertised, and `whoami` is a joke alias for going home rather than something
// worth a line in the command list.
//
// Both halves are asserted. Dropping them from SYSTEM_COMMANDS would break the commands
// themselves, and re-adding a help line would undo the decision; this catches either.
for (const cmd of ['keys', 'whoami']) {
  check(SYSTEM_COMMANDS.includes(cmd), `'${cmd}' must still run when typed`)
  check(completions(cmd.slice(0, 2)).includes(cmd), `'${cmd}' must still tab-complete`)
  check(!helpLines().some((l) => l.startsWith(`${cmd} `)), `'${cmd}' is deliberately not listed in help`)
}

// --- completion suggests only real commands --------------------------------------
check(completions('').length === 0, 'an empty prompt suggests nothing')
check(completions('   ').length === 0, 'whitespace alone suggests nothing')
check(completions('p')[0] === 'post', "'p' suggests post first — declaration order, not alphabetical")
check(completions('h')[0] === 'how', "'h' suggests how before home and help")
check(completions('zzz').length === 0, 'nonsense suggests nothing')

// A fully typed name has nothing left to suggest, but a longer name starting with it does.
check(!completions('ls').includes('ls'), 'an exact match is not its own completion')
check(completions('how').includes('how-it-works'), "'how' still offers the longer 'how-it-works'")
check(!completions('how').includes('how'), "'how' does not offer itself")

// Case and surrounding space are normalised the same way the dispatcher normalises them,
// so what Tab accepts is always something Enter can actually run.
check(completions('PO')[0] === 'post', 'completion is case-insensitive')
check(completions('  p')[0] === 'post', 'leading space does not defeat completion')

// The guarantee that matters: accepting any suggestion leaves a runnable command.
for (const prefix of ['p', 'a', 'b', 'h', 'c', 'g', 'd', 's', 'l', 'v', 'w', 'm', 'i', 'e']) {
  for (const candidate of completions(prefix)) {
    check(
      resolveRoute(candidate) !== null || SYSTEM_COMMANDS.includes(candidate),
      `completion '${candidate}' must be a runnable command`,
    )
  }
}

// --- Tab and the accept arrow are documented -------------------------------------
const cmdLineGroup = SHORTCUT_GROUPS.find((g) => g.title === 'The command line')
check(cmdLineGroup !== undefined, 'the help overlay has a command-line group')
check(
  cmdLineGroup.rows.some((r) => r.keys.join(' ') === 'Tab'),
  'Tab-to-accept must appear in the help overlay',
)

console.log(`ok — commands.test.mjs (${checks} checks)`)
