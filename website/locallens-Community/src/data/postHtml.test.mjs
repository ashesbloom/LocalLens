// Plain node:assert check, no framework, no jsdom. Run via `node src/data/postHtml.test.mjs`.
// DOMParser does not exist under plain node (postHtml.js's own comment), so every case below
// drives parseLegacyHtml with a hand-built stub "parse" function returning fake nodes that
// duck-type just the DOM surface the walker touches: nodeType, tagName, childNodes,
// textContent, getAttribute. Real element/text nodes below are built with the two tiny
// helpers (el/text) rather than hand-writing every object literal.
import assert from 'node:assert/strict'
import { parseLegacyHtml } from './postHtml.js'

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function text(value) {
  return { nodeType: TEXT_NODE, textContent: value }
}

function el(tagName, attrs = {}, children = []) {
  return {
    nodeType: ELEMENT_NODE,
    tagName,
    childNodes: children,
    getAttribute: (name) => (Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null),
  }
}

// parseLegacyHtml walks the *children* of whatever `parse()` returns (it treats it as a body
// element), so every stub root below is itself an `el(...)` wrapper.
function parse(root) {
  return () => root
}

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

function findTag(nodes, tag) {
  for (const n of nodes) {
    if (typeof n === 'string') continue
    if (n.tag === tag) return n
    const found = findTag(n.children, tag)
    if (found) return found
  }
  return null
}

// --- a <script> tag does not survive ---
{
  const root = el('BODY', {}, [el('P', {}, [text('safe')]), el('SCRIPT', {}, [text('alert(1)')])])
  const out = parseLegacyHtml('<p>safe</p><script>alert(1)</script>', parse(root))
  check(findTag(out, 'script') === null, 'a <script> element must never appear in the safe tree')
}

// --- an onclick attribute is dropped ---
{
  const root = el('BODY', {}, [el('P', { onclick: 'evil()' }, [text('hi')])])
  const out = parseLegacyHtml('<p onclick="evil()">hi</p>', parse(root))
  const p = findTag(out, 'p')
  check(p !== null, 'the <p> itself must still render')
  check(!('onclick' in p.attrs), 'onclick must not survive on any element')
}

// --- a javascript: href is rejected while a normal one lives ---
{
  const root = el('BODY', {}, [
    el('A', { href: 'javascript:alert(1)' }, [text('bad')]),
    el('A', { href: 'https://example.com' }, [text('good')]),
  ])
  const out = parseLegacyHtml('', parse(root))
  const [badLink, goodLink] = out
  check(!('href' in badLink.attrs), 'a javascript: href must be dropped')
  check(goodLink.attrs.href === 'https://example.com', 'a normal https href must survive')
  check(goodLink.attrs.target === '_blank' && goodLink.attrs.rel === 'noopener noreferrer', 'an external link must open in a new tab safely')
}

// --- an unknown wrapper element is unwrapped with its text intact ---
{
  const root = el('BODY', {}, [el('DIV', {}, [el('DIV', {}, [text('nested')])])])
  const out = parseLegacyHtml('<div><div>nested</div></div>', parse(root))
  check(out.length === 1 && out[0] === 'nested', 'nested <div>s must unwrap down to their bare text')
}

// --- data-float / data-width / data-offset survive on a figure ---
{
  const root = el('BODY', {}, [
    el('FIGURE', { 'data-float': 'right', 'data-width': '40', 'data-offset': '-180' }, [
      el('IMG', { src: 'https://example.com/x.png', alt: 'x' }, []),
      el('FIGCAPTION', {}, [text('caption')]),
    ]),
  ])
  const out = parseLegacyHtml('', parse(root))
  const figure = out[0]
  check(figure.tag === 'figure', 'the figure itself must survive (it is an allowed element)')
  check(
    figure.attrs['data-float'] === 'right' && figure.attrs['data-width'] === '40' && figure.attrs['data-offset'] === '-180',
    'data-float/data-width/data-offset must all survive on the figure',
  )
  const img = findTag(figure.children, 'img')
  check(img.attrs.src === 'https://example.com/x.png' && img.attrs.alt === 'x', 'img src/alt must survive inside the figure')
}

// --- a style attribute never survives, even on an allowed element ---
{
  const root = el('BODY', {}, [el('H1', { style: 'color:red' }, [text('hi')])])
  const out = parseLegacyHtml('', parse(root))
  check(!('style' in out[0].attrs), 'style must be dropped even on an allowed element like h1')
}

console.log(`ok — postHtml.test.mjs (${checks} checks)`)
