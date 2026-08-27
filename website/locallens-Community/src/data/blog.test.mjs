// Plain node:assert check, no framework. Run via `node src/data/blog.test.mjs`.
// Never hits the network (task-5-brief.md) — the fixture below is a trimmed but real sample
// captured from `GET /api/v1/posts?page=1&limit=20` on the live API on 2026-08-27, kept small
// but carrying every real-data quirk that fixture needs to prove the normaliser handles:
// a numeric readingTimeMinutes, a string one, a null cover, a trailing-whitespace author, and
// an emoji-only title (cat + zero-width joiner + black square) that has no alphanumerics to
// slugify — found in review, filed against a live post the size sweep below didn't catch
// because it only checked types and trimming, not "does the slug end up empty."
import assert from 'node:assert/strict'
import { normalizePosts, slugify } from './blog.js'

const FIXTURE = {
  posts: [
    {
      id: '6a8f5efb45551ad7eeaa0dbe',
      title: 'This is a test.',
      excerpt: 'I have been introduced to CS since my schooling…',
      author: { name: 'Mayank Pandey' },
      publishedAt: '2026-08-26T21:47:39.772Z',
      updatedAt: '2026-08-27T04:51:11.970Z',
      readingTimeMinutes: 1, // numeric, as the API sends it for this post
      canonicalUrl: 'https://blogs-1626.onrender.com/blog/6a8f5efb45551ad7eeaa0dbe',
      cover: { url: 'https://blogs-1626.onrender.com/image/6a8ccb2a/cat.jpg' },
    },
    {
      id: '66a3f59583b35828715ed432',
      title: 'Efficient Live Wallpaper Engine', // the real, pinned title
      excerpt: "Hello, Readers 👋 You know what's the best live wallpaper engine?…",
      author: { name: 'Mayank' },
      publishedAt: '2024-07-26T19:14:29.839Z',
      updatedAt: '2024-08-12T17:09:37.451Z',
      readingTimeMinutes: '7', // string, as the API sends it for this post — the real quirk
      canonicalUrl: 'https://blogs-1626.onrender.com/blog/66a3f59583b35828715ed432',
      cover: { url: 'https://blogs-1626.onrender.com/image/669a4b90/wall-blog.png' },
    },
    {
      id: '66a31f4783b35828715ed208',
      title: 'low',
      excerpt: 'high',
      author: { name: 'vinayak ' }, // real trailing whitespace
      publishedAt: '2024-07-26T04:00:07.277Z',
      updatedAt: '2024-07-26T04:00:07.277Z',
      readingTimeMinutes: '1',
      canonicalUrl: 'https://blogs-1626.onrender.com/blog/66a31f4783b35828715ed208',
      cover: null, // real null cover
    },
    {
      id: '669a65d1144f34c7ac947dbc',
      title: '🐈‍⬛', // the real pinned title — cat + ZWJ + black square, no alphanumerics
      excerpt: 'who said *pstpst* 🐈‍⬛',
      author: { name: 'Bot' },
      publishedAt: '2024-07-19T13:10:41.661Z',
      updatedAt: '2024-07-30T18:23:33.744Z',
      readingTimeMinutes: '1',
      canonicalUrl: 'https://blogs-1626.onrender.com/blog/669a65d1144f34c7ac947dbc',
      cover: { url: 'https://blogs-1626.onrender.com/image/669a4f25/cat.jpeg' },
    },
  ],
  pagination: { page: 1, limit: 20, total: 4, hasMore: false },
}

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- slugify: pinned against the real title (brief) ---
check(
  slugify('Efficient Live Wallpaper Engine') === 'efficient-live-wallpaper-engine',
  'slugify must turn the real pinned title into the expected slug',
)
check(slugify('  Weird---Title!! 2026  ') === 'weird-title-2026', 'slugify must collapse repeats and trim')
check(slugify('a'.repeat(200)).length <= 60, 'slugify must cap the length')

// --- slugify on titles with no alphanumerics at all: the real emoji title, and a
// punctuation-only stand-in that hits the same code path (the regex doesn't distinguish
// emoji from punctuation — both are "not [a-z0-9]") ---
check(slugify('🐈‍⬛') === '', 'an emoji-only title (with a ZWJ) must slugify to empty — this is why a filename fallback exists')
check(slugify('!!! ??? ---') === '', 'a punctuation-only title must also slugify to empty')

// --- normalizePosts: readingTimeMinutes coercion ---
const posts = normalizePosts(FIXTURE)
const numericSource = posts.find((p) => p.id === '6a8f5efb45551ad7eeaa0dbe')
const stringSource = posts.find((p) => p.id === '66a3f59583b35828715ed432')
check(typeof numericSource.readingTimeMinutes === 'number', 'a numeric readingTimeMinutes must come out a number')
check(typeof stringSource.readingTimeMinutes === 'number', 'a string readingTimeMinutes must come out a number too')
check(stringSource.readingTimeMinutes === 7, 'the string "7" must coerce to the number 7, not NaN or a concatenation bug')

// --- null cover must not throw, and must normalise to null ---
const noCoverPost = posts.find((p) => p.id === '66a31f4783b35828715ed208')
check(noCoverPost.cover === null, 'a null cover must survive as null, not throw')

// --- author names are trimmed ---
check(noCoverPost.author === 'vinayak', 'a trailing-whitespace author name must be trimmed')

// --- filename is derived from the real title ---
check(
  stringSource.filename === 'efficient-live-wallpaper-engine.md',
  'the filename must be the slugified real title plus .md',
)

// --- an empty-slugifying title must still produce a non-empty filename (the id fallback) ---
const catPost = posts.find((p) => p.id === '669a65d1144f34c7ac947dbc')
check(catPost.filename !== '.md', 'a bare ".md" with nothing in front of it must never render')
check(
  catPost.filename === '669a65d1144f34c7ac947dbc.md',
  'an emoji-only title must fall back to the post id as the filename stem',
)

// --- newest-first, regardless of fixture order ---
check(posts[0].id === '6a8f5efb45551ad7eeaa0dbe', 'posts must come out newest-first by publishedAt')
check(
  posts.every((p, i) => i === 0 || new Date(posts[i - 1].publishedAt) >= new Date(p.publishedAt)),
  'every post must be no newer than the one before it',
)

console.log(`ok — blog.test.mjs (${checks} checks)`)
