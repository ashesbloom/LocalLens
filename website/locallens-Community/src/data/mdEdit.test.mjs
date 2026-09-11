// Plain node:assert check. Run via `node src/data/mdEdit.test.mjs`.
import assert from 'node:assert/strict'
import { TOOLS, applyTool } from './mdEdit.js'
import { parseMarkdown } from './markdown.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- the table is sound -----------------------------------------------------------
const ids = new Set()
for (const tool of TOOLS) {
  check(!ids.has(tool.id), `tool id '${tool.id}' must be unique`)
  ids.add(tool.id)
  check(tool.glyph.length > 0, `tool '${tool.id}' needs a glyph`)
  check(tool.title.length > 0, `tool '${tool.id}' needs a title for its tooltip`)
  check(tool.row === 1 || tool.row === 2, `tool '${tool.id}' belongs to a row`)
}
check(TOOLS.some((t) => t.row === 1) && TOOLS.some((t) => t.row === 2), 'both rows are populated')

// --- wrapping a selection ------------------------------------------------------------
{
  const r = applyTool('bold', 'make this loud', 5, 9)
  check(r.text === 'make **this** loud', 'bold wraps the selection')
  check(r.text.slice(r.start, r.end) === 'this', 'and leaves the words selected, not the markers')
}
{
  const r = applyTool('bold', '', 0, 0)
  check(r.text === '**bold**', 'bold with no selection inserts a sample')
  check(r.text.slice(r.start, r.end) === 'bold', 'with the sample selected so typing replaces it')
}
{
  // Pressing it again takes it off, which is what every editor does.
  const on = applyTool('bold', 'make this loud', 5, 9)
  const off = applyTool('bold', on.text, on.start - 2, on.end + 2)
  check(off.text === 'make this loud', 'bold on already-bold text unwraps it')
}
check(applyTool('bold', 'x', 0, 0).text === '**bold**x', 'inserting at a cursor keeps the text around it')
check(applyTool('italic', 'ab', 0, 2).text === '*ab*', 'italic uses one asterisk')
check(applyTool('code', 'ab', 0, 2).text === '`ab`', 'code uses a backtick')

// --- links and images ------------------------------------------------------------------
{
  const r = applyTool('link', 'see the docs', 8, 12)
  check(r.text === 'see the [docs](https://)', 'link keeps the selection as the label')
  check(r.text.slice(r.start, r.end) === 'https://', 'and selects the address, the part nobody can guess')
}
{
  const r = applyTool('image', '', 0, 0)
  check(r.text.startsWith('!['), 'image is a link with a bang')
  check(r.text.slice(r.start, r.end) === 'https://', 'and also selects the address')
}

// --- line operations -------------------------------------------------------------------
check(applyTool('quote', 'one\ntwo', 0, 7).text === '> one\n> two', 'quote prefixes every selected line')
check(applyTool('bullet', 'one\ntwo', 0, 7).text === '- one\n- two', 'bullet prefixes every selected line')
check(applyTool('number', 'one\ntwo\nthree', 0, 13).text === '1. one\n2. two\n3. three', 'numbering counts up')
check(applyTool('heading', 'title', 0, 0).text === '### title', 'a heading starts at h3, matching the parser')
{
  // From the middle of a word, the whole line is still what gets prefixed.
  const r = applyTool('bullet', 'hello world', 6, 6)
  check(r.text === '- hello world', 'a line operation covers the whole line, not the cursor')
}
{
  const on = applyTool('quote', 'one\ntwo', 0, 7)
  const off = applyTool('quote', on.text, on.start, on.end)
  check(off.text === 'one\ntwo', 'quoting twice unquotes')
}

// --- fenced code -----------------------------------------------------------------------
{
  const r = applyTool('fence', 'x = 1', 0, 5)
  check(r.text === '```\nx = 1\n```\n', 'fence wraps the selected lines')
  check(r.text.slice(r.start, r.end) === 'x = 1', 'with the code selected')
}
{
  const r = applyTool('fence', '', 0, 0)
  check(parseMarkdown(r.text)[0].tag === 'pre', 'an empty fence still parses as a code block')
}

// --- the divider -------------------------------------------------------------------------
check(applyTool('rule', 'a', 1, 1).text === 'a\n---\n', 'the divider drops in at the cursor')

// --- an unknown id changes nothing --------------------------------------------------------
{
  const r = applyTool('nope', 'text', 1, 2)
  check(r.text === 'text' && r.start === 1 && r.end === 2, 'an unknown tool is a no-op')
}
check(applyTool('bold').text === '**bold**', 'applyTool copes with no arguments at all')

// --- everything a tool produces round-trips through the parser -----------------------------
// The guarantee that matters: no button can insert something the feed cannot render.
for (const tool of TOOLS) {
  const r = applyTool(tool.id, 'sample text', 0, 11)
  const tree = parseMarkdown(r.text)
  check(tree.length > 0, `'${tool.id}' produces something the parser understands`)
}

console.log(`ok - mdEdit.test.mjs (${checks} checks)`)
