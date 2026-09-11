// GET  /api/posts  -- one page of the feed: ?tag= ?sort=new|top ?cursor=
// POST /api/posts  -- create a post
//
// The board publishes immediately, so the guards below run cheapest-first: a malformed body
// is rejected without touching the database or Cloudflare's verification endpoint.
import { LIMITS, validatePost, makePostId, makePostToken, normalizeSort, encodeCursor, decodeCursor } from '../../../src/data/postRules.js'
import { slugifyTag } from '../../../src/data/tags.js'
import { json, fail, sameOrigin, clientIp, readJson } from '../../_lib/http.js'
import { verifyTurnstile } from '../../_lib/turnstile.js'
import { hashIp, checkPostRate, sweepOrphanUploads } from '../../_lib/limits.js'
import { hashToken } from '../../_lib/tokens.js'

// Every column the client may see. token_hash and ip_hash are deliberately absent and must
// stay that way: one would hand a visitor the power to delete other people's posts, the other
// a stable identifier for everyone who has ever posted.
export const PUBLIC_COLUMNS =
  'id, author, tag, tag_label AS tagLabel, body, created, edited, score, ups, downs, replies'

// Attaches the caller's own vote to each row, in one query over the ids on the page rather
// than one per post.
export async function attachMyVotes(db, ipHash, posts) {
  if (posts.length === 0) return posts
  const holes = posts.map((_, i) => `?${i + 2}`).join(',')
  const { results } = await db
    .prepare(`SELECT post_id, value FROM votes WHERE ip_hash = ?1 AND post_id IN (${holes})`)
    .bind(ipHash, ...posts.map((p) => p.id))
    .all()
  const mine = new Map((results ?? []).map((r) => [r.post_id, Number(r.value)]))
  for (const post of posts) post.myVote = mine.get(post.id) ?? 0
  return posts
}

export async function onRequestGet({ env, request }) {
  const url = new URL(request.url)
  const tag = slugifyTag(url.searchParams.get('tag') ?? '')
  const sort = normalizeSort(url.searchParams.get('sort') ?? '')
  const cursor = decodeCursor(sort, url.searchParams.get('cursor'))
  const limit = LIMITS.pageSize

  const where = ['hidden = 0']
  const binds = []
  if (tag) where.push(`tag = ?${binds.push(tag)}`)

  // Keyset pagination. `top` needs both halves or a run of equal scores would repeat or skip
  // rows across the page boundary; the tuple comparison is what makes the compound index work.
  if (cursor) {
    if (sort === 'top') {
      const s = binds.push(cursor.score)
      const i = binds.push(cursor.id)
      where.push(`(score < ?${s} OR (score = ?${s} AND id < ?${i}))`)
    } else {
      where.push(`id < ?${binds.push(cursor.id)}`)
    }
  }

  const order = sort === 'top' ? 'score DESC, id DESC' : 'id DESC'
  // One row over the page size, so "is there more" needs no second query.
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLUMNS} FROM posts WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ?${binds.push(limit + 1)}`,
  )
    .bind(...binds)
    .all()

  const rows = results ?? []
  const hasMore = rows.length > limit
  const posts = hasMore ? rows.slice(0, limit) : rows

  const ipHash = await hashIp(clientIp(request), env.IP_SALT)
  await attachMyVotes(env.DB, ipHash, posts)

  return json({ posts, sort, next: hasMore ? encodeCursor(sort, posts[posts.length - 1]) : null })
}

export async function onRequestPost({ env, request, waitUntil }) {
  // A kill switch that needs no deploy: setting this to "0" stops writes within seconds
  // while leaving everything readable.
  if (String(env.POSTING_ENABLED ?? '1') === '0') {
    return fail(503, 'posting-disabled', 'Posting is paused right now. Reading still works.')
  }

  if (!sameOrigin(request)) {
    return fail(403, 'bad-origin', 'That request did not come from this site.')
  }

  const body = await readJson(request, LIMITS.bodyMax * 4)
  if (body.tooLarge) return fail(413, 'too-large', 'That is more than this box accepts.')
  if (body.malformed) return fail(400, 'malformed', 'That request was not readable.')

  // The same validatePost the composer runs while typing. The client's copy is a courtesy;
  // this call is the control, and the row written is its normalised `value`.
  const { ok, errors, value } = validatePost(body.value)
  if (!ok) return fail(422, 'invalid', 'That post needs a change before it can go up.', { errors })

  const ipHash = await hashIp(clientIp(request), env.IP_SALT)

  // Rate limit before Turnstile: one indexed query against a table we already own, where
  // verification is a network round trip.
  const rate = await checkPostRate(env.DB, ipHash)
  if (!rate.ok) {
    return fail(429, 'rate-limited', rate.message, {}, { 'retry-after': String(rate.retryAfter) })
  }

  const human = await verifyTurnstile(body.value?.turnstileToken, clientIp(request), env.TURNSTILE_SECRET)
  if (!human.ok) {
    return fail(403, 'turnstile-failed', 'That check did not pass. Reload the page and try again.')
  }

  // Ownership without accounts: the browser gets the token, the table gets its hash. This is
  // the only moment the plaintext exists anywhere we control.
  const token = makePostToken()
  const id = makePostId()
  const created = Date.now()

  await env.DB.prepare(
    `INSERT INTO posts (id, author, tag, tag_label, body, created, edited, hidden, ip_hash, token_hash, score, ups, downs)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 0, 0, ?7, ?8, 0, 0, 0)`,
  )
    .bind(id, value.author, value.tag, value.tagLabel, value.body, created, ipHash, await hashToken(token))
    .run()

  if (waitUntil) waitUntil(sweepOrphanUploads(env.DB, env.IMG).catch(() => {}))

  return json(
    {
      post: {
        id, author: value.author, tag: value.tag, tagLabel: value.tagLabel, body: value.body,
        created, edited: 0, score: 0, ups: 0, downs: 0, myVote: 0,
      },
      // Returned exactly once. There is no endpoint that will ever hand it back.
      token,
    },
    201,
  )
}
