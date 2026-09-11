// Plain node:assert check, no framework. Run via `node src/data/markdown.test.mjs`.
import assert from 'node:assert/strict'
import { parseMarkdown, markdownToText } from './markdown.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// Every tag this parser is allowed to construct. The point of the first block below is that
// nothing outside this set can ever appear, whatever the input says.
const CONSTRUCTED = new Set([
  'p', 'br', 'hr', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'strong', 'em', 'a', 'img',
])

function tagsIn(nodes, out = new Set()) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    out.add(node.tag)
    if (node.children) tagsIn(node.children, out)
  }
  return out
}

function textIn(nodes) {
  let s = ''
  for (const node of nodes) {
    if (typeof node === 'string') s += node
    else if (node.children) s += textIn(node.children)
  }
  return s
}

function findAll(nodes, tag, out = []) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    if (node.tag === tag) out.push(node)
    if (node.children) findAll(node.children, tag, out)
  }
  return out
}

// --- markup cannot get through, at all ------------------------------------------
// This is the property the whole file exists for: the parser constructs nodes, it never
// interprets input as markup, so there is no sanitiser to defeat.
const ATTACKS = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<IMG SRC=x ONERROR=alert(1)>',
  '<svg/onload=alert(1)>',
  '<iframe src="https://evil.test"></iframe>',
  '<a href="javascript:alert(1)">click</a>',
  '<style>body{display:none}</style>',
  '<!-- --><script>alert(1)</script>',
  '&lt;script&gt;alert(1)&lt;/script&gt;',
  '<div onclick="alert(1)">x</div>',
]
for (const attack of ATTACKS) {
  const tree = parseMarkdown(attack)
  const tags = tagsIn(tree)
  for (const tag of tags) {
    check(CONSTRUCTED.has(tag), `'${attack}' must not produce a <${tag}>`)
  }
  check(!tags.has('script'), `'${attack}' must not produce a script element`)
  // The characters survive as text — nothing is silently swallowed.
  check(textIn(tree).includes('alert(1)') || !attack.includes('alert(1)'), `'${attack}' keeps its text`)
}

// An attribute cannot be injected either: no node anywhere carries an on* handler or a style.
function attrsOk(nodes) {
  for (const node of nodes) {
    if (typeof node === 'string') continue
    for (const name of Object.keys(node.attrs ?? {})) {
      check(!/^on/i.test(name), `attribute '${name}' must never be emitted`)
      check(name !== 'style', 'inline style must never be emitted')
    }
    if (node.children) attrsOk(node.children)
  }
}
attrsOk(parseMarkdown(ATTACKS.join('\n\n')))

// --- unsafe URLs are refused, their words are not -------------------------------
for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,<script>', 'vbscript:x']) {
  const link = parseMarkdown(`[click me](${bad})`)
  check(findAll(link, 'a').length === 0, `'${bad}' must not become a link`)
  check(textIn(link).includes('click me'), `'${bad}' keeps the link text`)

  const image = parseMarkdown(`![a photo](${bad})`)
  check(findAll(image, 'img').length === 0, `'${bad}' must not become an image`)
  check(textIn(image).includes('a photo'), `'${bad}' keeps the alt text`)
}

// Safe URLs do become links, and every outbound one is opener-safe.
const safe = parseMarkdown('[docs](https://example.test/x) and [rel](/how)')
const anchors = findAll(safe, 'a')
check(anchors.length === 2, 'both safe links become anchors')
check(anchors[0].attrs.href === 'https://example.test/x', 'href is preserved')
check(anchors[0].attrs.rel === 'noopener noreferrer nofollow', 'external links drop opener and referrer')
check(anchors[0].attrs.target === '_blank', 'external links open in a new tab')
check(anchors[1].attrs.target === undefined, 'an internal link stays in the tab')

// --- every block type round-trips ------------------------------------------------
check(parseMarkdown('# t')[0].tag === 'h3', 'one hash starts at h3, never h1')
check(parseMarkdown('## t')[0].tag === 'h4', 'two hashes is h4')
check(parseMarkdown('###### t')[0].tag === 'h6', 'six hashes is h6')
check(parseMarkdown('####### t')[0].tag !== 'h7', 'headings clamp at h6')
check(parseMarkdown('---')[0].tag === 'hr', 'three dashes is a rule')
check(parseMarkdown('> quoted')[0].tag === 'blockquote', 'angle bracket is a quote')
check(parseMarkdown('- a\n- b')[0].children.length === 2, 'a bullet run is one list')
check(parseMarkdown('1. a\n2. b')[0].tag === 'ol', 'a numbered run is an ordered list')
check(parseMarkdown('plain')[0].tag === 'p', 'bare text is a paragraph')
check(findAll(parseMarkdown('**b**'), 'strong').length === 1, 'double asterisk is bold')
check(findAll(parseMarkdown('*i*'), 'em').length === 1, 'single asterisk is italic')
check(findAll(parseMarkdown('_i_'), 'em').length === 1, 'underscore is italic')
check(findAll(parseMarkdown('`c`'), 'code').length === 1, 'backtick is code')

// Fenced code is verbatim: the characters people paste into a bug report survive.
const fenced = parseMarkdown('```\n**not bold** _not italic_\n  indented\n```')
const codeText = textIn(fenced)
check(codeText.includes('**not bold**'), 'asterisks inside a fence are literal')
check(codeText.includes('  indented'), 'leading whitespace inside a fence survives')
check(findAll(fenced, 'strong').length === 0, 'a fence suppresses inline markup')
check(parseMarkdown('```js\nx\n```')[0].children[0].attrs['data-lang'] === 'js', 'the fence language is kept')

// An unclosed fence is someone mid-sentence, not an error.
check(findAll(parseMarkdown('```\nstill typing'), 'pre').length === 1, 'an unclosed fence still renders')

// A newline inside a paragraph is a real break — repro steps keep their shape.
check(findAll(parseMarkdown('step one\nstep two'), 'br').length === 1, 'a single newline breaks the line')
check(parseMarkdown('a\n\nb').length === 2, 'a blank line starts a new paragraph')

// --- the plain-text form ---------------------------------------------------------
check(markdownToText('# Title\n\n**bold** text') === 'Title bold text', 'text form drops markup')
check(markdownToText('') === '', 'text form of nothing is nothing')
check(markdownToText(null) === '', 'text form of null is nothing')
check(parseMarkdown(undefined).length === 0, 'undefined parses to an empty tree')

console.log(`ok — markdown.test.mjs (${checks} checks)`)
