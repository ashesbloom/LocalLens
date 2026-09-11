// GET /api/tags -- every tag in use, with how many visible posts carry it.
//
// This is also what makes custom tags reachable. The filter row was built from the six
// built-ins, so a tag someone invented could be posted under but never filtered to.
import { json } from '../_lib/http.js'

export async function onRequestGet({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT tag, MAX(tag_label) AS tagLabel, COUNT(*) AS count
     FROM posts WHERE hidden = 0
     GROUP BY tag
     ORDER BY count DESC, tag ASC`,
  ).all()
  return json({ tags: results ?? [], total: (results ?? []).reduce((n, r) => n + Number(r.count), 0) })
}
