// GET /api/inbox?since=<ms> -- what the LocalLens desktop app shows in its bell
//
// Two lists since `since`: new posts by anyone else, and -- when the caller sends the app key
// in `x-app-key` -- new replies on posts that key made, minus replies it wrote itself. The
// key is hashed exactly as it was when the post was written, so this table never holds it.
//
// `now` comes back so the app can use the server's clock for its next `since`; a laptop clock
// that runs a minute fast would otherwise skip every reply written in that minute.
import { json, appCors } from '../_lib/http.js'
import { hashAppKey } from '../_lib/tokens.js'

const WEEK = 7 * 24 * 60 * 60 * 1000
const EXCERPT = 140

export function clampSince(raw, now) {
  const since = Number(raw)
  if (!Number.isFinite(since)) return now - WEEK
  return Math.min(Math.max(since, now - WEEK), now)
}

export async function onRequestOptions({ request }) {
  return new Response(null, { status: 204, headers: appCors(request) })
}

export async function onRequestGet({ env, request }) {
  const now = Date.now()
  const since = clampSince(new URL(request.url).searchParams.get('since'), now)
  const key = await hashAppKey(request.headers.get('x-app-key') ?? '')

  // With no key there is no "own" post to leave out; '' matches no stored hash.
  const posts = env.DB.prepare(
    `SELECT id, author, tag, created, substr(body, 1, ${EXCERPT}) AS excerpt FROM posts
     WHERE hidden = 0 AND created > ?1 AND (app_key_hash IS NULL OR app_key_hash != ?2)
     ORDER BY id DESC LIMIT 20`,
  )
    .bind(since, key ?? '')
    .all()

  const replies = key
    ? env.DB.prepare(
        `SELECT r.id, r.post_id AS postId, r.author, r.created, substr(r.body, 1, ${EXCERPT}) AS excerpt
         FROM replies r JOIN posts p ON p.id = r.post_id
         WHERE p.app_key_hash = ?1 AND p.hidden = 0 AND r.hidden = 0 AND r.created > ?2
           AND (r.app_key_hash IS NULL OR r.app_key_hash != ?1)
         ORDER BY r.created DESC LIMIT 50`,
      )
        .bind(key, since)
        .all()
    : null

  const [p, r] = await Promise.all([posts, replies])
  return json({ now, posts: p.results ?? [], replies: r?.results ?? [] }, 200, appCors(request))
}
