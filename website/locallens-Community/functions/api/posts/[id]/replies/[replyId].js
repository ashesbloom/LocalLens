// DELETE /api/posts/:id/replies/:replyId -- by the reply's own author, or by the admin.
import { fail, json, safeEqual } from '../../../../_lib/http.js'
import { tokenMatches } from '../../../../_lib/tokens.js'

const NOTHING = () => fail(404, 'not-found', 'No such reply.')

function isAdmin(request, env) {
  if (!env.ADMIN_KEY) return false
  return safeEqual(request.headers.get('x-admin-key') ?? '', env.ADMIN_KEY)
}

export async function onRequestDelete({ env, params, request }) {
  const row = await env.DB.prepare('SELECT token_hash FROM replies WHERE id = ?1 AND post_id = ?2 AND hidden = 0')
    .bind(params.replyId, params.id)
    .first()
  if (!row) return NOTHING()

  const owner = await tokenMatches(request.headers.get('x-post-token'), row.token_hash)
  if (!owner && !isAdmin(request, env)) return NOTHING()

  await env.DB.batch([
    env.DB.prepare('UPDATE replies SET hidden = 1 WHERE id = ?1').bind(params.replyId),
    env.DB.prepare('UPDATE posts SET replies = replies - 1 WHERE id = ?1').bind(params.id),
  ])
  return json({ hidden: params.replyId })
}
