// The browser's side of the community board. Throws on failure, the same way blog.js does,
// so every caller handles one kind of thing going wrong instead of two.
//
// This is the first real caller of setNetActivity(). That mechanism was wired when the status
// bar was built and had never had a consumer, so the `net:` readout always said "idle".
import { LIMITS, validatePost, validateReply } from './postRules.js'
import { rememberPost, forgetPost, tokenFor, adminKey } from './mine.js'
import { setNetActivity } from './net.js'

const TIMEOUT_MS = 12000

// Same-origin, so a relative path is correct in dev and in production with no base URL to
// configure or get wrong.
const API = '/api/posts'

// Whatever proof of identity this browser holds for one thing it may have made. The token
// says "I wrote this"; the admin key says "I run this board". Both are sent when both exist --
// the server accepts either, and which one it honoured is not the client's business.
//
// `storageKey` is whatever mine.js was given when the token was first remembered: a bare post
// id for a post, `reply:<postId>:<replyId>` for a reply. The prefix is what keeps the two
// namespaces apart in one small map without a second table in storage.
function identity(storageKey) {
  const headers = {}
  const token = storageKey ? tokenFor(storageKey) : null
  if (token) headers['x-post-token'] = token
  const admin = adminKey()
  if (admin) headers['x-admin-key'] = admin
  return headers
}

export function replyStorageKey(postId, replyId) {
  return `reply:${postId}:${replyId}`
}

async function call(url, init = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  setNetActivity(new URL(url, location.origin).host)
  try {
    const res = await fetch(url, { ...init, signal: controller.signal })

    // Check the content type before parsing. Swallowing a parse failure into {} is what made
    // a missing API look like an empty board: a dev server answers any unknown GET with
    // index.html and a 200, which then read as "no posts yet" on a site whose backend was not
    // running at all. An answer that is not JSON is a broken endpoint, and has to say so.
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('application/json')) {
      const err = new Error('The board API did not return data. It may not be running.')
      err.code = 'not-json'
      err.status = res.status
      throw err
    }

    // Every endpoint answers in one shape -- { error, message } on failure -- so the message
    // a person sees is the one the server wrote, not a status code translated twice.
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      const err = new Error(data.message || `The board responded ${res.status}.`)
      err.code = data.error || 'http-error'
      err.status = res.status
      err.fieldErrors = data.errors || null
      throw err
    }
    return data
  } catch (err) {
    if (err.name === 'AbortError') {
      const timeout = new Error('The board did not respond in time.')
      timeout.code = 'timeout'
      throw timeout
    }
    if (!err.code) err.code = 'offline'
    throw err
  } finally {
    clearTimeout(timer)
    setNetActivity(null) // the module's own way of saying idle
  }
}

// One page of the feed. `cursor` is the `next` value from the previous page, and is opaque --
// its shape depends on the sort, which is the server's concern.
export async function fetchPosts({ tag = '', sort = 'new', cursor = '' } = {}) {
  const params = new URLSearchParams()
  if (tag) params.set('tag', tag)
  if (sort && sort !== 'new') params.set('sort', sort)
  if (cursor) params.set('cursor', cursor)
  const query = params.toString()
  const data = await call(query ? `${API}?${query}` : API)
  return { posts: data.posts ?? [], next: data.next ?? null, sort: data.sort ?? sort }
}

export async function fetchPost(id) {
  const data = await call(`${API}/${encodeURIComponent(id)}`)
  return data.post
}

export async function fetchTags() {
  const data = await call('/api/tags')
  return { tags: data.tags ?? [], total: data.total ?? 0 }
}

// Validates locally first so an obvious mistake is caught without a round trip. The server
// runs the identical check from the identical module and is the one that decides -- this is
// for the person typing, not for correctness.
export async function createPost({ author, tag, tagLabel, body, turnstileToken }) {
  const { ok, errors, value } = validatePost({ author, tag, tagLabel, body })
  if (!ok) {
    const err = new Error('That post needs a change before it can go up.')
    err.code = 'invalid'
    err.fieldErrors = errors
    throw err
  }

  const data = await call(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...value, turnstileToken }),
  })

  // The token comes back exactly once and no endpoint will hand it over again, so this write
  // is the only chance to keep it. If storage is blocked the post still went up -- the author
  // simply cannot take it down again, which is why the composer says so.
  const kept = rememberPost(data.post.id, data.token)
  return { post: data.post, canManage: kept }
}

export async function editPost(id, body) {
  const data = await call(`${API}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', ...identity(id) },
    body: JSON.stringify({ body }),
  })
  return data.post
}

export async function deletePost(id) {
  await call(`${API}/${encodeURIComponent(id)}`, { method: 'DELETE', headers: identity(id) })
  // Only after the server agreed. Dropping it first would lose the proof needed to retry.
  forgetPost(id)
  return id
}

export async function votePost(id, value) {
  const data = await call(`${API}/${encodeURIComponent(id)}/vote`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ value }),
  })
  return data
}

// A post's replies, oldest first -- a thread reads top to bottom like a conversation.
export async function fetchReplies(postId) {
  const data = await call(`${API}/${encodeURIComponent(postId)}/replies`)
  return data.replies ?? []
}

export async function createReply(postId, { author, body, turnstileToken }) {
  const { ok, errors, value } = validateReply({ author, body })
  if (!ok) {
    const err = new Error('That reply needs a change before it can go up.')
    err.code = 'invalid'
    err.fieldErrors = errors
    throw err
  }

  const data = await call(`${API}/${encodeURIComponent(postId)}/replies`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...value, turnstileToken }),
  })

  const kept = rememberPost(replyStorageKey(postId, data.reply.id), data.token)
  return { reply: data.reply, canManage: kept }
}

export async function deleteReply(postId, replyId) {
  const key = replyStorageKey(postId, replyId)
  await call(`${API}/${encodeURIComponent(postId)}/replies/${encodeURIComponent(replyId)}`, {
    method: 'DELETE',
    headers: identity(key),
  })
  forgetPost(key)
  return replyId
}

export { LIMITS }
