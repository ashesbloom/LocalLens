// Fetches the blog index from the live Blogs! content API (contract: llms.txt at the API's
// own root — see task-5-brief.md). One exported function, kept deliberately small: this task
// builds the index only, not the article reading view (Task 6).
import { setNetActivity } from './net.js'

const BLOG_API = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BLOG_API) || 'https://blogs-1626.onrender.com'

const CACHE_KEY = 'll-blog-posts-v1'
const CACHE_TTL_MS = 300 * 1000 // matches the API's own `cache-control: max-age=300` — also doubles as the rate-limit guard (brief)
const FETCH_TIMEOUT_MS = 30 * 1000 // the blog runs on Render's free tier: a cold start after idle can take tens of seconds
const MAX_SLUG_LEN = 60

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

// Normalises one raw API summary. Two real-data facts this guards against (verified against
// the live API, not just the contract — task-5-brief.md): `readingTimeMinutes` is sometimes a
// number and sometimes a string, and `cover`/`author.name` need defensive handling.
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
    filename: `${slugify(raw.title)}.md`,
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

function readCache() {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw)
    if (Date.now() - cached.ts > CACHE_TTL_MS) return null
    return cached.posts
  } catch {
    return null
  }
}

function writeCache(posts) {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), posts }))
  } catch {
    // storage unavailable (private browsing, quota) — the page still works, just re-fetches
  }
}

// Fetches the first page of posts (10 posts exist today — brief says not to build pagination
// UI). Wrapped with net.js so the status bar shows the host while in flight. The generous
// AbortController timeout — not the browser's own default — is what keeps a Render cold
// start from reading as a hung page; the caller renders the pending/aborted/failed states as
// shell output (Blog.jsx), never a blank page or an infinite spinner.
export async function fetchBlogPosts() {
  const cached = readCache()
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
    writeCache(posts)
    return posts
  } catch (err) {
    if (err.name === 'AbortError') throw new Error(`${host} did not respond in time`)
    throw err
  } finally {
    clearTimeout(timer)
    setNetActivity(null)
  }
}
