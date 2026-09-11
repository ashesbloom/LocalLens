// GET  /api/posts/:id/replies -- every visible reply to one post, oldest first
// POST /api/posts/:id/replies -- add one
//
// Flat, not threaded: a reply belongs to a post, never to another reply. Guarded the same way
// a top-level post is -- Turnstile, a rate limit, same-origin -- because it is an equally
// public write path, just a smaller one.
import { LIMITS, validateReply, makePostId, makePostToken } from '../../../../../src/data/postRules.js'
import { json, fail, sameOrigin, clientIp, readJson } from '../../../../_lib/http.js'
import { verifyTurnstile } from '../../../../_lib/turnstile.js'
import { hashIp, checkReplyRate } from '../../../../_lib/limits.js'
import { hashToken } from '../../../../_lib/tokens.js'

// token_hash and ip_hash stay off the wire for the same reason they do on a post: one would
// hand out delete power over someone else's reply, the other a stable per-visitor id.
const PUBLIC_COLUMNS = 'id, author, body, created'

export async function onRequestGet({ env, params }) {
  const { results } = await env.DB.prepare(
    `SELECT ${PUBLIC_COLUMNS} FROM replies WHERE post_id = ?1 AND hidden = 0 ORDER BY id ASC LIMIT 200`,
  )
    .bind(params.id)
    .all()
  return json({ replies: results ?? [] })
}

export async function onRequestPost({ env, params, request }) {
  if (String(env.POSTING_ENABLED ?? '1') === '0') {
    return fail(503, 'posting-disabled', 'Posting is paused right now. Reading still works.')
  }
  if (!sameOrigin(request)) return fail(403, 'bad-origin', 'That request did not come from this site.')

  const body = await readJson(request, LIMITS.replyBodyMax * 4)
  if (body.tooLarge) return fail(413, 'too-large', 'That is more than a reply accepts.')
  if (body.malformed) return fail(400, 'malformed', 'That request was not readable.')

  const { ok, errors, value } = validateReply(body.value)
  if (!ok) return fail(422, 'invalid', 'That reply needs a change before it can go up.', { errors })

  // A reply to a post that is hidden or does not exist is a reply to nothing.
  const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?1 AND hidden = 0').bind(params.id).first()
  if (!post) return fail(404, 'not-found', 'No such post.')

  const ipHash = await hashIp(clientIp(request), env.IP_SALT)

  const rate = await checkReplyRate(env.DB, ipHash)
  if (!rate.ok) return fail(429, 'rate-limited', rate.message, {}, { 'retry-after': String(rate.retryAfter) })

  const human = await verifyTurnstile(body.value?.turnstileToken, clientIp(request), env.TURNSTILE_SECRET)
  if (!human.ok) return fail(403, 'turnstile-failed', 'That check did not pass. Reload the page and try again.')

  const token = makePostToken()
  const id = makePostId()
  const created = Date.now()

  // The reply and the post's own tally move in one batch, the same reasoning as a vote: the
  // count on the post can never drift from the rows in the replies table by a second write
  // that landed and a first one that did not.
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO replies (id, post_id, author, body, created, hidden, ip_hash, token_hash) VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7)',
    ).bind(id, params.id, value.author, value.body, created, ipHash, await hashToken(token)),
    env.DB.prepare('UPDATE posts SET replies = replies + 1 WHERE id = ?1').bind(params.id),
  ])

  return json({ reply: { id, author: value.author, body: value.body, created }, token }, 201)
}
