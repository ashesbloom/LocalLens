// The board's categories. Pure data, no JSX, so it runs under plain `node` in the test.
//
// Six built-in tags, chosen for what this project actually gets asked about rather than for
// a generic forum. `performance` and `faces` earn their place because they are the two
// subsystems people have opinions about; everything else lands in `general` or a custom tag.
//
// -- colour ------------------------------------------------------------------------
// Six coloured chips would wreck a green-on-black page, and two hues are already spoken for
// project-wide: --iris means "current release" and --cool means "Labs". So the hue lives on
// the glyph only. The chip stays phosphor text; the glyph carries the colour and a 1px left
// edge repeats it. The page stays green, the tags stay scannable, and neither reserved
// meaning gets borrowed.
export const TAGS = [
  { slug: 'bug', label: 'bug', glyph: '\u2297', blurb: 'something is broken' },
  { slug: 'feature', label: 'feature', glyph: '\u2726', blurb: 'a request' },
  { slug: 'performance', label: 'performance', glyph: '\u25c7', blurb: 'slow sorts, memory, stalls' },
  { slug: 'faces', label: 'faces', glyph: '\u25c9', blurb: 'enrolment and recognition' },
  { slug: 'help', label: 'help', glyph: '?', blurb: 'how do I' },
  { slug: 'general', label: 'general', glyph: '\u00b7', blurb: 'everything else' },
]

export const DEFAULT_TAG = 'general'
// A hash, not a plus. '+' beside a tag name reads as a button that adds something,
// which is exactly what it is not once the tag exists.
export const CUSTOM_GLYPH = '#'

const BY_SLUG = new Map(TAGS.map((t) => [t.slug, t]))

export function isBuiltIn(slug) {
  return BY_SLUG.has(slug)
}

// Custom tag text -> a slug. Anything outside [a-z0-9-] becomes a hyphen, runs collapse, and
// the ends are trimmed. Returns '' when nothing usable is left, which the caller treats as
// "no custom tag" rather than as an error -- an empty slug must never reach the database.
export function slugifyTag(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '')
}

// The display record for any tag, built-in or custom. One shape, so the chip component and
// the feed row never branch on which kind they were handed.
export function tagFor(slug, label) {
  const known = BY_SLUG.get(slug)
  if (known) return { ...known, custom: false }
  return { slug, label: label || slug, glyph: CUSTOM_GLYPH, blurb: '', custom: true }
}
