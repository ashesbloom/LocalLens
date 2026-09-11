// POST /api/posts/:id/vote  -- body { value: 1 | -1 | 0 }
//
// 0 withdraws. The votes table's primary key is (post_id, ip_hash), so voting twice and
// changing your mind are the same statement -- an upsert -- and nobody can accumulate votes
// on one post from one address however many times they click.
import { json, fail, sameOrigin, clientIp, readJson } from '../../../_lib/http.js'
import { hashIp, checkVoteRate } from '../../../_lib/limits.js'

const ALLOWED = [1, -1, 0]

export async function onRequestPost({ env, params, request }) {
  if (!sameOrigin(request)) return fail(403, 'bad-origin', 'That request did not come from this site.')

  const body = await readJson(request, 512)
  if (body.tooLarge || body.malformed) return fail(400, 'malformed', 'That request was not readable.')

  // typeof before ALLOWED, not Number() before ALLOWED: Number(null) is 0, and 0 means
  // "withdraw my vote". A request that simply forgot the field would otherwise delete a vote
  // rather than being rejected as malformed.
  const value = body.value?.value
  if (typeof value !== 'number' || !ALLOWED.includes(value)) {
    return fail(422, 'invalid-vote', 'A vote is up, down, or withdrawn.')
  }

  const post = await env.DB.prepare('SELECT id FROM posts WHERE id = ?1 AND hidden = 0').bind(params.id).first()
  if (!post) return fail(404, 'not-found', 'No such post.')

  const ipHash = await hashIp(clientIp(request), env.IP_SALT)
  const rate = await checkVoteRate(env.DB, ipHash)
  if (!rate.ok) return fail(429, 'rate-limited', rate.message, {}, { 'retry-after': String(rate.retryAfter) })

  const previous = await env.DB.prepare('SELECT value FROM votes WHERE post_id = ?1 AND ip_hash = ?2')
    .bind(params.id, ipHash)
    .first()
  const before = Number(previous?.value ?? 0)

  const now = Date.now()
  const statements = [
    value === 0
      ? env.DB.prepare('DELETE FROM votes WHERE post_id = ?1 AND ip_hash = ?2').bind(params.id, ipHash)
      : env.DB.prepare(
          `INSERT INTO votes (post_id, ip_hash, value, created) VALUES (?1, ?2, ?3, ?4)
           ON CONFLICT(post_id, ip_hash) DO UPDATE SET value = ?3, created = ?4`,
        ).bind(params.id, ipHash, value, now),
  ]

  // The tallies move by the difference, never by a recount, and they ride in the same batch as
  // the vote row -- so the counter on the post cannot drift from the votes table by a second
  // write that failed on its own.
  if (before !== value) {
    statements.push(
      env.DB.prepare('UPDATE posts SET ups = ups + ?2, downs = downs + ?3, score = score + ?4 WHERE id = ?1').bind(
        params.id,
        (value === 1 ? 1 : 0) - (before === 1 ? 1 : 0),
        (value === -1 ? 1 : 0) - (before === -1 ? 1 : 0),
        value - before,
      ),
    )
  }

  await env.DB.batch(statements)

  const fresh = await env.DB.prepare('SELECT score, ups, downs FROM posts WHERE id = ?1').bind(params.id).first()
  return json({
    id: params.id,
    myVote: value,
    score: Number(fresh?.score ?? 0),
    ups: Number(fresh?.ups ?? 0),
    downs: Number(fresh?.downs ?? 0),
  })
}
