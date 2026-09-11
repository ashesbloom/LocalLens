// What counts as a valid post, and how much of it anyone may send. Pure data and pure
// functions -- no JSX, no React, no browser API -- because this file is imported by BOTH the
// browser (src/data/posts.js, for instant feedback while typing) and the Cloudflare Pages
// Function that writes to the database (functions/api/posts.js, where it is the actual
// control). Two copies of these rules would drift, and the copy that drifts is always the
// one on the server.
//
// The client's checks are a courtesy. The server calls the same validatePost() and is the
// only thing that decides whether a row is written.
import { DEFAULT_TAG, isBuiltIn, slugifyTag } from './tags.js'

export const LIMITS = {
  bodyMax: 8000,
  bodyMin: 2,
  authorMax: 40,
  tagLabelMax: 24,
  pageSize: 20,

  // Rate limits, counted in D1 against a salted hash of the source address. Posting is live
  // -- nothing waits for review -- so these are what stands between the board and a bad
  // afternoon. Tuned to be invisible to someone writing a real bug report and tedious for
  // anything automated that gets past Turnstile.
  postsPer10Min: 3,
  postsPerDay: 20,

  votesPer10Min: 60,

  replyBodyMax: 2000,
  replyBodyMin: 1,
  repliesPer10Min: 5,
  repliesPerDay: 40,

  uploadsPer10Min: 6,
  uploadMaxBytes: 5 * 1024 * 1024,
  uploadBytesPerDay: 40 * 1024 * 1024,
  uploadOrphanMs: 24 * 60 * 60 * 1000,
}

export const ANON = 'anon'

// Control characters, tab and newline excepted, are stripped from every field. They render
// as nothing, they break terminal output, and they have no business in a name or a body.
const CONTROL = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g')

function stripControl(s) {
  return String(s ?? '').replace(CONTROL, '')
}

// Returns { ok, errors, value }. `value` is the normalised row to write -- callers must use
// it rather than the input they passed in, because normalisation is part of validation here
// (a name of pure whitespace becomes 'anon', which is not an error).
export function validatePost(input) {
  const errors = {}

  const rawAuthor = String(input?.author ?? '').trim()
  const author = stripControl(rawAuthor).replace(/\s+/g, ' ').slice(0, LIMITS.authorMax)
  if (rawAuthor.length > LIMITS.authorMax) {
    errors.author = `A name is at most ${LIMITS.authorMax} characters.`
  }

  const body = stripControl(input?.body).replace(/[ \t]+$/gm, '').trim()
  if (body.length < LIMITS.bodyMin) errors.body = 'Write something first.'
  else if (body.length > LIMITS.bodyMax) {
    errors.body = `A post is at most ${LIMITS.bodyMax} characters. This one is ${body.length}.`
  }

  // A custom label only means anything when the slug is not already a built-in one.
  const slug = slugifyTag(input?.tag) || DEFAULT_TAG
  const custom = !isBuiltIn(slug)
  if (custom && String(input?.tag ?? '').trim().length > LIMITS.tagLabelMax) {
    errors.tag = `A tag is at most ${LIMITS.tagLabelMax} characters.`
  }
  const tagLabel = custom
    ? stripControl(input?.tagLabel || input?.tag).trim().slice(0, LIMITS.tagLabelMax) || slug
    : null

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { author: author || ANON, tag: slug, tagLabel, body },
  }
}

// A reply is a smaller thing than a post: no tag, a shorter cap, and a name that defaults the
// same way. Its own function rather than a `validatePost` with everything else undefined --
// a reply row has fewer fields, and pretending it is a post with blanks invites a blank
// eventually reaching a column it should never touch (the tag columns, most obviously).
export function validateReply(input) {
  const errors = {}

  const rawAuthor = String(input?.author ?? '').trim()
  const author = stripControl(rawAuthor).replace(/\s+/g, ' ').slice(0, LIMITS.authorMax)
  if (rawAuthor.length > LIMITS.authorMax) {
    errors.author = `A name is at most ${LIMITS.authorMax} characters.`
  }

  const body = stripControl(input?.body).replace(/[ \t]+$/gm, '').trim()
  if (body.length < LIMITS.replyBodyMin) errors.body = 'Write something first.'
  else if (body.length > LIMITS.replyBodyMax) {
    errors.body = `A reply is at most ${LIMITS.replyBodyMax} characters. This one is ${body.length}.`
  }

  return { ok: Object.keys(errors).length === 0, errors, value: { author: author || ANON, body } }
}

// Sortable id: a base-36 timestamp prefix plus randomness. Sortable means "newest first" is
// an ordered scan rather than a sort, and unlike an auto-increment it does not tell every
// visitor how many posts the board has ever had.
export function makePostId(now = Date.now(), random = Math.random) {
  const stamp = now.toString(36).padStart(9, '0')
  const noise = Math.floor(random() * 0xffffffff).toString(36).padStart(7, '0')
  return `${stamp}${noise}`
}

// Ownership without accounts. The server hands this to the browser once, at creation, and
// keeps only its hash -- so the token in localStorage is the only copy that can delete or
// edit the post, and a dump of the posts table grants nothing.
//
// 32 hex characters is 128 bits, which is not guessable at any rate a rate limiter would let
// through. `bytes` is injected so the test can pin the encoding without pinning randomness.
export function makePostToken(bytes) {
  const source = bytes ?? crypto.getRandomValues(new Uint8Array(16))
  return [...source].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// How long after posting someone may still fix a typo. Past this the post is what it says.
export const EDIT_WINDOW_MS = 15 * 60 * 1000

export function canStillEdit(created, now = Date.now()) {
  return Number.isFinite(created) && now - created <= EDIT_WINDOW_MS && now >= created
}

export const SORTS = ['new', 'top']

export function normalizeSort(raw) {
  return SORTS.includes(raw) ? raw : 'new'
}

// Keyset pagination cursors. `new` orders by id alone; `top` orders by score then id, so its
// cursor has to carry both or the page after a run of equal scores would repeat or skip rows.
// Encoded as one opaque string because the client only ever hands it back.
export function encodeCursor(sort, row) {
  if (!row) return null
  return normalizeSort(sort) === 'top' ? `${Number(row.score) || 0}:${row.id}` : String(row.id)
}

// Returns null for anything malformed. A cursor comes from the query string, so it is
// untrusted input like any other -- it must not reach a bound parameter as NaN.
export function decodeCursor(sort, raw) {
  const text = String(raw ?? '')
  if (!text) return null
  if (normalizeSort(sort) !== 'top') return /^[A-Za-z0-9]{1,64}$/.test(text) ? { id: text } : null
  const at = text.indexOf(':')
  if (at < 1) return null
  const score = Number(text.slice(0, at))
  const id = text.slice(at + 1)
  if (!Number.isSafeInteger(score) || !/^[A-Za-z0-9]{1,64}$/.test(id)) return null
  return { score, id }
}
