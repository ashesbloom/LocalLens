// Turns a blog post's sanitised-but-still-untrusted `content.html` (task-6-brief.md) into a
// plain-object tree that Article.jsx renders as real React elements — never through
// dangerouslySetInnerHTML (hard rule carried from Task 4). This buys defence in depth over
// the API's own server-side sanitiser, at no dependency cost, and lets us restyle the body in
// our own type and colour instead of trusting whatever inline styling rode along in the HTML.
//
// Framework-agnostic on purpose: this file exports plain data, no JSX, no React import, so it
// runs unmodified under plain `node` (postHtml.test.mjs) — Vite only parses JSX out of .jsx
// files, and DOMParser doesn't exist in Node at all. The `parse` argument is exactly the seam
// that buys that: pass a real DOMParser in the browser, or a hand-built stub node in the test.

const ELEMENT_NODE = 1
const TEXT_NODE = 3

// Real elements a post body may render as. Anything else is unwrapped, not dropped — its
// children (so its text) still come through, just without the tag (brief).
const ALLOWED_TAGS = new Set([
  'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'strong', 'em', 'a', 'br', 'hr', 'img', 'figure', 'figcaption',
])

// Attribute allowlist, per tag. Every other attribute — including every `on*` handler and
// every inline `style` — is dropped for every tag, including the allowed ones (brief).
const ATTRS_BY_TAG = {
  a: ['href'],
  img: ['src', 'alt', 'width', 'height'],
  figure: ['data-float', 'data-width', 'data-offset'],
}

// href/src scheme check (brief): http:, https:, mailto:, or protocol-relative/relative are
// fine; anything else (javascript:, data:, vbscript:, ...) is rejected outright.
function isSafeUrl(raw) {
  const url = String(raw ?? '').trim()
  if (!url) return false
  if (/^(https?|mailto):/i.test(url)) return true
  if (url.startsWith('//')) return true // protocol-relative
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false // some other scheme
  return true // relative ("/x", "x", "#frag")
}

function isExternal(url) {
  return /^(https?:|mailto:)/i.test(url) || url.startsWith('//')
}

function attrsFor(tag, el) {
  const names = ATTRS_BY_TAG[tag]
  if (!names) return {}
  const attrs = {}
  for (const name of names) {
    const value = el.getAttribute(name)
    if (value == null) continue
    if ((name === 'href' || name === 'src') && !isSafeUrl(value)) continue
    attrs[name] = value
  }
  // External links get target="_blank" rel="noopener noreferrer" (brief) — decided here,
  // not per-callsite, so the legacy path can never forget it.
  if (tag === 'a' && attrs.href && isExternal(attrs.href)) {
    attrs.target = '_blank'
    attrs.rel = 'noopener noreferrer'
  }
  return attrs
}

// One DOM node -> zero or more safe-tree nodes. An unwrapped element can yield more than one
// sibling (its children flatten up into the parent's list), which is why this returns an
// array rather than a single node.
function walkNode(node) {
  if (node.nodeType === TEXT_NODE) {
    const text = node.textContent
    return text ? [text] : []
  }
  if (node.nodeType !== ELEMENT_NODE) return [] // comments, etc. — never rendered

  const tag = String(node.tagName).toLowerCase()
  const children = walkChildren(node)

  if (!ALLOWED_TAGS.has(tag)) return children // unwrap, keep the (already-sanitised) children

  return [{ tag, attrs: attrsFor(tag, node), children }]
}

function walkChildren(parent) {
  const out = []
  for (const child of Array.from(parent.childNodes)) out.push(...walkNode(child))
  return out
}

function defaultParse(html) {
  return new DOMParser().parseFromString(html, 'text/html').body
}

// html: the raw content.html string. parse: (html) -> a root node exposing childNodes — the
// same shape the walk needs from any element. Defaults to the browser's own DOMParser;
// postHtml.test.mjs passes a stub instead (there is no DOMParser under plain node).
export function parseLegacyHtml(html, parse = defaultParse) {
  return walkChildren(parse(html))
}
