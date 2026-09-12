// GET    /api/posts/:id  -- one post, for its own page
// PUT    /api/posts/:id  -- edit it, by its author, inside the edit window
// DELETE /api/posts/:id  -- take it down, by its author or by the admin
//
// "By its author" means holding the token handed out when the post was created. There are no
// accounts, so that token is the only identity there is.
import { LIMITS, validatePost, canStillEdit } from '../../../src/data/postRules.js'
import { json, fail, isAdmin, sameOrigin, clientIp, readJson } from '../../_lib/http.js'
import { hashIp } from '../../_lib/limits.js'
import { tokenMatches } from '../../_lib/tokens.js'
import { PUBLIC_COLUMNS, attachMyVotes } from './index.js'

// 404 everywhere rather than 401 or 403: an endpoint that answers differently for a wrong key
// than for a missing post tells a stranger which posts are worth guessing at.
const NOTHING = () => fail(404, 'not-found', 'No such post.')

export async function onRequestGet({ env, params, request }) {
  const post = await env.DB.prepare(`SELECT ${PUBLIC_COLUMNS} FROM posts WHERE id = ?1 AND hidden = 0`)
    .bind(params.id)
    .first()
  if (!post) return NOTHING()
  const ipHash = await hashIp(clientIp(request), env.IP_SALT)
  await attachMyVotes(env.DB, ipHash, [post])
  return json({ post })
}

export async function onRequestDelete({ env, params, request }) {
  const row = await env.DB.prepare('SELECT token_hash FROM posts WHERE id = ?1 AND hidden = 0')
    .bind(params.id)
    .first()
  if (!row) return NOTHING()

  const owner = await tokenMatches(request.headers.get('x-post-token'), row.token_hash)
  if (!owner && !isAdmin(request, env)) return NOTHING()

  // Hidden, not deleted: a post removed by mistake can come back, and the row keeps counting
  // against its author's rate limit so deleting is not a way to post more.
  await env.DB.prepare('UPDATE posts SET hidden = 1 WHERE id = ?1').bind(params.id).run()
  return json({ hidden: params.id })
}

export async function onRequestPut({ env, params, request }) {
  if (!sameOrigin(request)) return fail(403, 'bad-origin', 'That request did not come from this site.')

  const row = await env.DB.prepare('SELECT token_hash, created, tag, tag_label FROM posts WHERE id = ?1 AND hidden = 0')
    .bind(params.id)
    .first()
  if (!row) return NOTHING()

  // Editing is the author's alone. The admin key deletes; it does not rewrite what someone
  // said while leaving their name on it.
  if (!(await tokenMatches(request.headers.get('x-post-token'), row.token_hash))) return NOTHING()

  if (!canStillEdit(Number(row.created))) {
    return fail(409, 'edit-window-closed', 'Posts can only be edited for a few minutes after going up.')
  }

  const body = await readJson(request, LIMITS.bodyMax * 4)
  if (body.tooLarge) return fail(413, 'too-large', 'That is more than this box accepts.')
  if (body.malformed) return fail(400, 'malformed', 'That request was not readable.')

  // Only the body is editable. Letting the tag change after people have filtered by it, or the
  // name change after people have read it, is a different feature with different consequences.
  const { ok, errors, value } = validatePost({ body: body.value?.body, tag: row.tag, tagLabel: row.tag_label })
  if (!ok) return fail(422, 'invalid', 'That post needs a change before it can go up.', { errors })

  await env.DB.prepare('UPDATE posts SET body = ?2, edited = 1 WHERE id = ?1').bind(params.id, value.body).run()

  const post = await env.DB.prepare(`SELECT ${PUBLIC_COLUMNS} FROM posts WHERE id = ?1`).bind(params.id).first()
  const ipHash = await hashIp(clientIp(request), env.IP_SALT)
  await attachMyVotes(env.DB, ipHash, [post])
  return json({ post })
}
