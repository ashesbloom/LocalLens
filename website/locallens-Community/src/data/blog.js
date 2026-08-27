// Talks to the live Blogs! content API (contract: llms.txt at the API's own root — see
// task-5-brief.md and task-6-brief.md). Task 5 built the index (fetchBlogPosts); Task 6 adds
// the single-post fetch (fetchBlogPost) the article reading view renders.
import { setNetActivity } from './net.js'

const BLOG_API = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BLOG_API) || 'https://blogs-1626.onrender.com'

const CACHE_KEY = 'll-blog-posts-v1'
const POST_CACHE_PREFIX = 'll-blog-post-v1:' // one entry per id — a single post is fetched and cached independently of the index (Task 6)
const CACHE_TTL_MS = 300 * 1000 // matches the API's own `cache-control: max-age=300` — also doubles as the rate-limit guard (brief)
const FETCH_TIMEOUT_MS = 30 * 1000 // the blog runs on Render's free tier: a cold start after idle can take tens of seconds
const MAX_SLUG_LEN = 60
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Human date shared by the index's latest band and the article header — 'DD Mon YYYY',
// matching Announce's CurrentBand format. Unlike the changelog's bare 'YYYY-MM-DD' (see
// changelog.js's own formatDate), publishedAt is a full ISO instant, so new Date() carries no
// ambiguity here — it renders in the viewer's local time zone, which is normal for a
// "published" timestamp.
export function formatDate(iso) {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

// title -> 'slug.md'. A display transformation of the post's real title, not an invented
// filename (brief, "The .md filename conceit"): lowercase, non-alphanumerics collapsed to a
// single hyphen, trimmed, length-capped so a long title doesn't blow out the listing row.
export function slugify(title) {
  let slug = String(title)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length > MAX_SLUG_LEN) slug = slug.slice(0, MAX_SLUG_LEN).replace(/-+$/, '')
  return slug
}

// A title with no alphanumerics at all (emoji-only, punctuation-only) slugifies to '' — a real
// live post is titled '🐈‍⬛' (cat + zero-width joiner + black square), which has no
// alphanumerics for the regex to keep. A bare '.md' with nothing in front of it is not an
// acceptable row, so fall back to the post id: it's real, unique, and already what
// canonicalUrl is built from.
function filenameFor(title, id) {
  return `${slugify(title) || id}.md`
}

// Normalises one raw API summary. Real-data facts this guards against (verified against the
// live API, not just the contract — task-5-brief.md): `readingTimeMinutes` is sometimes a
// number and sometimes a string, `cover`/`author.name` need defensive handling, and a title
// can slugify to empty (see filenameFor above).
function normalizePost(raw) {
  return {
    id: raw.id,
    title: raw.title,
    excerpt: raw.excerpt,
    author: String(raw.author?.name ?? '').trim(),
    publishedAt: raw.publishedAt,
    updatedAt: raw.updatedAt,
    readingTimeMinutes: Number(raw.readingTimeMinutes) || 0,
    canonicalUrl: raw.canonicalUrl,
    cover: raw.cover ?? null,
    filename: filenameFor(raw.title, raw.id),
  }
}

// Normalises a raw `{ posts, pagination }` payload into the array the page renders — newest
// first. Exported (not just used internally) so the test can pin it against a captured
// fixture without a network call.
export function normalizePosts(data) {
  return (data.posts ?? [])
    .map(normalizePost)
    .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt))
}

// Keyed so the index (one list, CACHE_KEY) and individual articles (one entry per id,
// POST_CACHE_PREFIX — Task 6) share the same read/write/TTL logic instead of two copies of it.
function readCache(key) {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (Date.now() - cached.ts > CACHE_TTL_MS) return null
    return cached.value
  } catch {
    return null
  }
}

function writeCache(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), value }))
  } catch {
    // storage unavailable (private browsing, quota) — the page still works, just re-fetches
  }
}

// Cache-only lookup, used by Echo.jsx to print a real `<slug>.md` in the `cat blog/...` line
// for /blog/:id without forcing a fetch of its own — Echo only has the id from the URL. A miss
// (direct link, or the index's 300s TTL already expired) is expected and handled by the
// caller, not an error here.
export function cachedPostFilename(id) {
  const posts = readCache(CACHE_KEY)
  return posts?.find((p) => p.id === id)?.filename ?? null
}

// Fetches the first page of posts (10 posts exist today — brief says not to build pagination
// UI). Wrapped with net.js so the status bar shows the host while in flight. The generous
// AbortController timeout — not the browser's own default — is what keeps a Render cold
// start from reading as a hung page; the caller renders the pending/aborted/failed states as
// shell output (Blog.jsx), never a blank page or an infinite spinner.
export async function fetchBlogPosts() {
  const cached = readCache(CACHE_KEY)
  if (cached) return cached

  const host = new URL(BLOG_API).host
  setNetActivity(host)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${BLOG_API}/api/v1/posts?page=1&limit=20`, { signal: controller.signal })
    if (!res.ok) throw new Error(`blog API responded ${res.status}`)
    const data = await res.json()
    const posts = normalizePosts(data)
    writeCache(CACHE_KEY, posts)
    return posts
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${host} did not respond in time`)
    throw err
  } finally {
    clearTimeout(timer)
    setNetActivity(null)
  }
}

// Full single-post normalisation for the article view (Task 6): the same summary fields
// (built through normalizePost, so the index and the article can never disagree about title/
// author/filename derivation) plus the body content and the licence attribution the API
// attaches to every full post.
function normalizePostDetail(raw) {
  return {
    ...normalizePost(raw),
    content: raw.content,
    images: raw.images ?? [],
    attribution: raw.attribution,
  }
}

// Fetches one full post by id — GET /api/v1/posts/:id (contract: llms.txt). A bad id is a
// real, expected outcome, not a network failure: the API answers it with 404 and a
// `{"error": "..."}` body, surfaced here as `err.notFound = true` so Article.jsx can render a
// distinct "not found" state instead of the generic "could not reach the blog" one.
export async function fetchBlogPost(id) {
  const cacheKey = POST_CACHE_PREFIX + id
  const cached = readCache(cacheKey)
  if (cached) return cached

  const host = new URL(BLOG_API).host
  setNetActivity(host)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(`${BLOG_API}/api/v1/posts/${encodeURIComponent(id)}`, { signal: controller.signal })
    if (res.status === 404) {
      const data = await res.json().catch(() => ({}))
      const err = new Error(data.error || 'post not found')
      err.notFound = true
      throw err
    }
    if (!res.ok) throw new Error(`blog API responded ${res.status}`)
    const raw = await res.json()
    const post = normalizePostDetail(raw)
    writeCache(cacheKey, post)
    return post
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${host} did not respond in time`)
    throw err
  } finally {
    clearTimeout(timer)
    setNetActivity(null)
  }
}
