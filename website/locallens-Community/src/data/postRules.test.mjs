// Plain node:assert check, no framework. Run via `node src/data/postRules.test.mjs`.
// Covers tags.js and postRules.js together: they are one contract -- what a post may say and
// how it is filed -- and the server enforces both from the same import.
import assert from 'node:assert/strict'
import { TAGS, DEFAULT_TAG, isBuiltIn, slugifyTag, tagFor } from './tags.js'
import {
  LIMITS, ANON, validatePost, validateReply, makePostId, makePostToken,
  EDIT_WINDOW_MS, canStillEdit, normalizeSort, encodeCursor, decodeCursor,
} from './postRules.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- the tag table is internally sound -------------------------------------------
const slugs = new Set()
for (const tag of TAGS) {
  check(!slugs.has(tag.slug), `tag slug '${tag.slug}' must be unique`)
  slugs.add(tag.slug)
  check(slugifyTag(tag.slug) === tag.slug, `built-in slug '${tag.slug}' must already be slug-shaped`)
  check(tag.glyph.length > 0, `tag '${tag.slug}' needs a glyph`)
  check(tag.blurb.length > 0, `tag '${tag.slug}' needs a blurb`)
}
check(isBuiltIn(DEFAULT_TAG), 'the default tag must be one of the built-ins')

// --- slugifying whatever someone types --------------------------------------------
check(slugifyTag('Bug Report') === 'bug-report', 'spaces become hyphens')
check(slugifyTag('  RAW  ') === 'raw', 'case and padding are normalised')
check(slugifyTag('a///b') === 'a-b', 'runs of punctuation collapse to one hyphen')
check(slugifyTag('---') === '', 'punctuation alone yields nothing usable')
check(slugifyTag('') === '', 'empty in, empty out')
check(slugifyTag(null) === '', 'null in, empty out')
check(slugifyTag('x'.repeat(80)).length <= 24, 'a slug is capped')
check(!slugifyTag('x'.repeat(23) + ' y').endsWith('-'), 'a cap must not leave a trailing hyphen')

// --- one display shape, built-in or not -------------------------------------------
check(tagFor('bug').custom === false, 'a built-in tag is not custom')
check(tagFor('bug').glyph === TAGS[0].glyph, 'a built-in keeps its own glyph')
check(tagFor('my-thing', 'My Thing').custom === true, 'an unknown slug is custom')
check(tagFor('my-thing', 'My Thing').label === 'My Thing', 'a custom tag shows the typed label')
check(tagFor('my-thing').label === 'my-thing', 'a custom tag with no label falls back to its slug')

// --- what a post may say -----------------------------------------------------------
const good = validatePost({ author: 'Mayank', tag: 'bug', body: 'It stalls at 40%.' })
check(good.ok, 'an ordinary post is valid')
check(good.value.tagLabel === null, 'a built-in tag carries no custom label')

check(!validatePost({ body: '' }).ok, 'an empty post is refused')
check(!validatePost({ body: ' \n\t ' }).ok, 'a whitespace-only post is refused')
check(validatePost({ body: 'x'.repeat(LIMITS.bodyMax) }).ok, 'a post exactly at the cap is fine')
check(!validatePost({ body: 'x'.repeat(LIMITS.bodyMax + 1) }).ok, 'one character over the cap is refused')
check(!validatePost({ author: 'x'.repeat(LIMITS.authorMax + 1), body: 'hi' }).ok, 'an over-long name is refused')

// Normalisation is part of validation: callers must write `value`, not what they passed in.
check(validatePost({ author: '   ', body: 'hi' }).value.author === ANON, 'a blank name becomes anon')
check(validatePost({ author: 'a\u0000b', body: 'hi' }).value.author === 'ab', 'control characters are stripped from a name')
check(!validatePost({ body: 'a\u0007b' }).value.body.includes('\u0007'), 'control characters are stripped from a body')
check(validatePost({ body: 'line\ttab\nbreak' }).value.body.includes('\n'), 'tabs and newlines survive')
check(validatePost({ author: 'a   b', body: 'hi' }).value.author === 'a b', 'runs of space in a name collapse')
check(validatePost({ body: 'hi' }).value.tag === DEFAULT_TAG, 'no tag means the default tag')
check(validatePost({ tag: '!!!', body: 'hi' }).value.tag === DEFAULT_TAG, 'an unusable tag falls back to the default')

const custom = validatePost({ tag: 'Release Notes', body: 'hi' })
check(custom.value.tag === 'release-notes', 'a custom tag is slugged')
check(custom.value.tagLabel === 'Release Notes', 'a custom tag keeps what was typed as its label')

// --- ids sort by time --------------------------------------------------------------
check(makePostId(2000, () => 0) > makePostId(1000, () => 0), 'a newer id sorts after an older one')
check(makePostId(1000, () => 0) !== makePostId(1000, () => 0.5), 'the random half varies')
check(/^[a-z0-9]+$/.test(makePostId()), 'an id is url-safe')

// --- what a reply may say ----------------------------------------------------------------
check(validateReply({ author: 'x', body: 'nice catch' }).ok, 'an ordinary reply is valid')
check(!validateReply({ body: '' }).ok, 'an empty reply is refused')
check(validateReply({ body: 'x'.repeat(LIMITS.replyBodyMax) }).ok, 'a reply exactly at its cap is fine')
check(!validateReply({ body: 'x'.repeat(LIMITS.replyBodyMax + 1) }).ok, 'one character over is refused')
check(validateReply({ body: 'hi' }).value.author === ANON, 'a blank name becomes anon, same as a post')
check(!('tag' in validateReply({ author: 'a', body: 'hi', tag: 'bug' }).value), 'a reply carries no tag field at all')
check(validateReply({ body: 'x'.repeat(LIMITS.bodyMax) }).ok === false, "a reply this long would pass a post's cap but not its own")

// --- ownership tokens -----------------------------------------------------------------
check(/^[0-9a-f]{32}$/.test(makePostToken()), 'a token is 32 hex characters')
check(makePostToken() !== makePostToken(), 'two tokens differ')
check(makePostToken(new Uint8Array(16)) === '0'.repeat(32), 'the encoding is plain lowercase hex')
check(makePostToken(new Uint8Array([255, 0])) === 'ff00', 'each byte becomes two padded digits')

// --- the edit window --------------------------------------------------------------------
check(canStillEdit(1000, 1000), 'a post can be edited the instant it exists')
check(canStillEdit(1000, 1000 + EDIT_WINDOW_MS), 'and exactly at the end of the window')
check(!canStillEdit(1000, 1001 + EDIT_WINDOW_MS), 'but not one millisecond later')
check(!canStillEdit(undefined), 'a missing timestamp is not editable')
check(!canStillEdit(5000, 1000), 'a post from the future is not editable either')

// --- sorts ------------------------------------------------------------------------------
check(normalizeSort('top') === 'top', 'top is a sort')
check(normalizeSort('new') === 'new', 'new is a sort')
check(normalizeSort('sideways') === 'new', 'anything else falls back to new')
check(normalizeSort(undefined) === 'new', 'so does nothing at all')

// --- cursors ----------------------------------------------------------------------------
// The property that matters: what encode produces, decode accepts, for both sorts.
{
  const row = { id: 'abc123', score: 7 }
  check(decodeCursor('new', encodeCursor('new', row)).id === 'abc123', 'a new cursor round-trips')
  const top = decodeCursor('top', encodeCursor('top', row))
  check(top.id === 'abc123' && top.score === 7, 'a top cursor round-trips both halves')
  check(decodeCursor('top', encodeCursor('top', { id: 'x', score: -3 })).score === -3, 'a negative score survives')
  check(encodeCursor('new', null) === null, 'no row means no cursor')
}
// Cursors arrive in a query string, so they are untrusted like anything else.
for (const bad of ['', 'no-colon', ':abc', 'NaN:abc', '1.5:abc', "1:abc'; DROP TABLE posts--", '1:' + 'x'.repeat(200)]) {
  check(decodeCursor('top', bad) === null, `top cursor '${bad.slice(0, 24)}' is rejected`)
}
for (const bad of ['', "abc'; DROP TABLE posts--", 'x'.repeat(200), 'has space']) {
  check(decodeCursor('new', bad) === null, `new cursor '${bad.slice(0, 24)}' is rejected`)
}

console.log(`ok - postRules.test.mjs (${checks} checks)`)
