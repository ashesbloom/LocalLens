// GET /api/admin -- is the x-admin-key header the board's admin key?
//
// Every other endpoint answers 404 for a wrong key so a stranger cannot tell a bad key from
// a missing post. This one is the deliberate exception, and it exists because the prompt was
// lying: it stored whatever was typed and announced "admin mode on" without ever asking
// whether the key was any good. A client cannot honestly make that claim on its own.
//
// Being an oracle is the price. It is only safe while ADMIN_KEY stays a long random value --
// `openssl rand -hex 32`, never a phrase someone chose. Swap in a memorable key and this
// endpoint needs rate limiting first.
import { json, fail, isAdmin } from '../_lib/http.js'

export async function onRequestGet({ env, request }) {
  if (!isAdmin(request, env)) return fail(404, 'not-found', 'No such thing.')
  return json({ admin: true })
}
