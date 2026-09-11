// Post bodies are markdown. This turns that markdown into the same plain-object tree
// postHtml.js produces from blog HTML — { tag, attrs, children } — so one renderer
// (shell/SafeNode.jsx) draws both a blog article and a community post.
//
// Pure data, no JSX, no React import, so markdown.test.mjs runs under plain `node`. Same
// constraint changelog.js and postHtml.js keep, and for the same reason.
//
// ── why markdown here is safer than HTML ──────────────────────────────────────────
// postHtml.js takes HTML someone else wrote and removes what is not allowed. This parser
// never accepts HTML at all: it *constructs* every node itself, and a '<' in the source is
// just a character that ends up inside a text string. There is no unwrap path, no attribute
// allowlist to get wrong, and no tag that can be smuggled through an encoding trick, because
// nothing in the input is ever interpreted as markup. Post bodies come from anonymous
// strangers, so that difference is the whole reason this file exists rather than reusing the
// HTML path.
//
// URLs are the one place untrusted input reaches an attribute, so they go through the same
// isSafeUrl() the blog path uses — one rule about what a link may be, in one file.
import { isSafeUrl } from './postHtml.js'

// Post bodies must not introduce an h1 or h2: the page already owns those, and a stranger's
// post outranking the page title breaks the document outline for anyone navigating by
// heading. '#' therefore starts at h3 and deeper levels clamp at h6.
function headingTag(hashes) {
  return `h${Math.min(6, hashes + 2)}`
}

function el(tag, children, attrs = {}) {
  return { tag, attrs, children }
}

// One alternation, tried in order. Code first, because a span of code suppresses every other
// marker inside it; image before link, because an image is a link with a '!' in front.
const INLINE_SOURCE = [
  '(`+)([\\s\\S]*?)\\1', //                          1,2  `code`
  '!\\[([^\\]]*)\\]\\(\\s*([^)\\s]+)\\s*\\)', //     3,4  ![alt](src)
  '\\[([^\\]]*)\\]\\(\\s*([^)\\s]+)\\s*\\)', //      5,6  [text](href)
  '\\*\\*([\\s\\S]+?)\\*\\*', //                     7    **bold**
  '\\*([^*\\n]+?)\\*', //                            8    *italic*
  '_([^_\\n]+?)_', //                                9    _italic_
].join('|')

// The regex is built per call rather than shared at module scope: this function recurses
// (bold can contain a link), and a shared /g regex would have its lastIndex clobbered by the
// inner call the moment it returned.
function inline(text) {
  const re = new RegExp(INLINE_SOURCE, 'g')
  const out = []
  let last = 0
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[2] !== undefined) {
      out.push(el('code', [m[2].trim()]))
    } else if (m[4] !== undefined) {
      // A rejected src drops the image but keeps its alt text — the words someone wrote are
      // not the unsafe part, and silently vanishing content reads as a bug.
      if (isSafeUrl(m[4])) out.push(el('img', [], { src: m[4], alt: m[3] || '' }))
      else if (m[3]) out.push(m[3])
    } else if (m[6] !== undefined) {
      if (isSafeUrl(m[6])) out.push(el('a', inline(m[5]), linkAttrs(m[6])))
      else out.push(...inline(m[5]))
    } else if (m[7] !== undefined) {
      out.push(el('strong', inline(m[7])))
    } else if (m[8] !== undefined) {
      out.push(el('em', inline(m[8])))
    } else if (m[9] !== undefined) {
      out.push(el('em', inline(m[9])))
    }
    last = re.lastIndex
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

// Every post link leaves the site, so every post link opens in a new tab and drops the
// referrer/opener. Decided once, here, rather than at each callsite.
function linkAttrs(href) {
  const external = /^(https?:|mailto:)/i.test(href) || href.startsWith('//')
  return external ? { href, target: '_blank', rel: 'noopener noreferrer nofollow' } : { href }
}

// A newline inside a paragraph becomes a real line break rather than being folded into the
// previous line. Markdown's default folding is wrong for this board specifically: people
// paste log lines and step-by-step repros into the box, and joining those into one run-on
// line loses the shape of what they were showing.
function paragraph(lines) {
  const out = []
  lines.forEach((line, i) => {
    if (i > 0) out.push(el('br', []))
    out.push(...inline(line))
  })
  return el('p', out)
}

const FENCE = /^\s*```/
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s*>\s?(.*)$/
const BULLET = /^\s*[-*+]\s+(.*)$/
const NUMBER = /^\s*\d+[.)]\s+(.*)$/

function startsBlock(line) {
  return (
    !line.trim() ||
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    NUMBER.test(line)
  )
}

// Collects the run of consecutive lines matching `re`, returning [items, nextIndex].
function collect(lines, i, re) {
  const items = []
  while (i < lines.length) {
    const m = lines[i].match(re)
    if (!m) break
    items.push(m[1])
    i++
  }
  return [items, i]
}

export function parseMarkdown(src) {
  const lines = String(src ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
  const out = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]

    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code. Everything up to the closing fence is taken verbatim — no inline pass, so
    // a pasted stack trace full of asterisks and underscores survives exactly as typed. An
    // unclosed fence runs to the end of the post rather than failing, because the person is
    // usually still typing it.
    if (FENCE.test(line)) {
      const lang = line.replace(/^\s*```/, '').trim()
      const body = []
      i++
      while (i < lines.length && !FENCE.test(lines[i])) body.push(lines[i++])
      if (i < lines.length) i++ // consume the closing fence
      out.push(el('pre', [el('code', [body.join('\n')], lang ? { 'data-lang': lang } : {})]))
      continue
    }

    const heading = line.match(HEADING)
    if (heading) {
      out.push(el(headingTag(heading[1].length), inline(heading[2])))
      i++
      continue
    }

    if (RULE.test(line)) {
      out.push(el('hr', []))
      i++
      continue
    }

    if (QUOTE.test(line)) {
      const [quoted, next] = collect(lines, i, QUOTE)
      i = next
      out.push(el('blockquote', [paragraph(quoted.length ? quoted : [''])]))
      continue
    }

    if (BULLET.test(line)) {
      const [items, next] = collect(lines, i, BULLET)
      i = next
      out.push(el('ul', items.map((t) => el('li', inline(t)))))
      continue
    }

    if (NUMBER.test(line)) {
      const [items, next] = collect(lines, i, NUMBER)
      i = next
      out.push(el('ol', items.map((t) => el('li', inline(t)))))
      continue
    }

    // Paragraph: everything up to the next blank line or block starter.
    const para = []
    while (i < lines.length && !startsBlock(lines[i])) para.push(lines[i++])
    out.push(paragraph(para))
  }

  return out
}

// The plain-text form, for the feed's collapsed preview and for anywhere a length needs
// measuring against what a reader actually sees rather than against the markup.
export function markdownToText(src) {
  // Each block contributes its own string and they are joined with a space. Concatenating
  // straight through would run the last word of a heading into the first word of the
  // paragraph under it, which is exactly the join a one-line feed preview shows.
  const flatten = (nodes) => {
    let s = ''
    for (const node of nodes) {
      if (typeof node === 'string') s += node
      else if (node.tag === 'br') s += ' '
      else if (node.children) s += flatten(node.children)
    }
    return s
  }
  return parseMarkdown(src)
    .map((node) => (typeof node === 'string' ? node : flatten(node.children ?? [])))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}
