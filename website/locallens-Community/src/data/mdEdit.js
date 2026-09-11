// The composer's formatting controls, as pure text operations. No JSX, no DOM -- a toolbar
// button is just "given this text and this selection, what is the new text and the new
// selection", which is the part worth testing and the part that is easy to get subtly wrong.
//
// Glyphs rather than icons: this is a terminal, and a monospace character sits in the row
// without needing an icon set. They are also the actual markdown they insert, mostly, which
// makes the row teach the syntax as you use it.

export const TOOLS = [
  // Row one: things that mark up a span.
  { id: 'bold', glyph: 'B', title: 'Bold', kind: 'wrap', marker: '**', sample: 'bold', row: 1 },
  { id: 'italic', glyph: 'i', title: 'Italic', kind: 'wrap', marker: '*', sample: 'italic', row: 1 },
  { id: 'code', glyph: '`', title: 'Inline code', kind: 'wrap', marker: '`', sample: 'code', row: 1 },
  { id: 'link', glyph: 'link', title: 'Link', kind: 'link', sample: 'text', row: 1 },
  { id: 'image', glyph: 'img', title: 'Image', kind: 'image', sample: 'alt text', row: 1 },

  // Row two: things that change whole lines.
  { id: 'heading', glyph: '#', title: 'Heading', kind: 'line', prefix: '### ', row: 2 },
  { id: 'quote', glyph: '>', title: 'Quote', kind: 'line', prefix: '> ', row: 2 },
  { id: 'bullet', glyph: '-', title: 'Bullet list', kind: 'line', prefix: '- ', row: 2 },
  { id: 'number', glyph: '1.', title: 'Numbered list', kind: 'ordered', row: 2 },
  { id: 'fence', glyph: '```', title: 'Code block', kind: 'fence', row: 2 },
  { id: 'rule', glyph: '---', title: 'Divider', kind: 'insert', text: '\n---\n', row: 2 },
]

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]))

// Widens [start,end] to cover the whole of every line it touches, so a line operation applied
// from the middle of a word still prefixes that word's line rather than splitting it.
function lineSpan(text, start, end) {
  const from = text.lastIndexOf('\n', start - 1) + 1
  const nl = text.indexOf('\n', end)
  return [from, nl === -1 ? text.length : nl]
}

function replace(text, from, to, insert, selFrom, selTo) {
  return {
    text: text.slice(0, from) + insert + text.slice(to),
    start: selFrom,
    end: selTo,
  }
}

// Returns { text, start, end } -- the caller writes all three back to the textarea, so the
// cursor lands where someone would keep typing rather than jumping to the end.
export function applyTool(id, text = '', start = 0, end = start) {
  const tool = BY_ID.get(id)
  if (!tool) return { text, start, end }
  const selected = text.slice(start, end)

  if (tool.kind === 'wrap') {
    const m = tool.marker
    // Pressing bold on already-bold text unwraps it, the way every editor does. Without this
    // the button only ever adds, and turning something off means selecting the asterisks.
    if (selected.startsWith(m) && selected.endsWith(m) && selected.length >= m.length * 2) {
      const inner = selected.slice(m.length, -m.length)
      return replace(text, start, end, inner, start, start + inner.length)
    }
    const body = selected || tool.sample
    const out = m + body + m
    return replace(text, start, end, out, start + m.length, start + m.length + body.length)
  }

  if (tool.kind === 'link' || tool.kind === 'image') {
    const label = selected || tool.sample
    const bang = tool.kind === 'image' ? '!' : ''
    const url = 'https://'
    const out = `${bang}[${label}](${url})`
    // Select the URL: the label is either what was highlighted or a placeholder, but the
    // address is the one part nobody can guess for you.
    const urlAt = start + bang.length + 1 + label.length + 2
    return replace(text, start, end, out, urlAt, urlAt + url.length)
  }

  if (tool.kind === 'line' || tool.kind === 'ordered') {
    const [from, to] = lineSpan(text, start, end)
    const lines = text.slice(from, to).split('\n')
    const prefixOf = (i) => (tool.kind === 'ordered' ? `${i + 1}. ` : tool.prefix)
    // Already prefixed? Take it off. Same reasoning as unwrapping bold.
    const allPrefixed = lines.every((line, i) => line.startsWith(prefixOf(i)))
    const out = lines
      .map((line, i) => (allPrefixed ? line.slice(prefixOf(i).length) : prefixOf(i) + line))
      .join('\n')
    return replace(text, from, to, out, from, from + out.length)
  }

  if (tool.kind === 'fence') {
    const [from, to] = lineSpan(text, start, end)
    const body = text.slice(from, to) || 'paste code here'
    const lead = from > 0 && text[from - 1] !== '\n' ? '\n' : ''
    const out = `${lead}\`\`\`\n${body}\n\`\`\`\n`
    const bodyAt = from + lead.length + 4
    return replace(text, from, to, out, bodyAt, bodyAt + body.length)
  }

  // insert: drop it in at the cursor, replacing any selection.
  const at = start + tool.text.length
  return replace(text, start, end, tool.text, at, at)
}
