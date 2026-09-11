// Plain node:assert check. Run via `node src/data/posts.test.mjs`.
// Pins down how the client reacts to what the network hands back -- in particular that a
// response which is not JSON is an error, never an empty board.
import assert from 'node:assert/strict'

globalThis.location = { origin: 'https://board.test', host: 'board.test' }
const { fetchPosts, createPost } = await import('./posts.js')

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

function respond({ status = 200, body = '{}', type = 'application/json' } = {}) {
  globalThis.fetch = async () => new Response(body, { status, headers: { 'content-type': type } })
}

async function boom(fn) {
  try {
    await fn()
    return null
  } catch (err) {
    return err
  }
}

// --- an HTML response is a broken API, not an empty board -------------------------
// This is the one that bit: vite's dev server answers any unknown GET with index.html and
// a 200. Swallowing the parse failure rendered "Nothing posted yet" on a site whose API was
// not running at all, which is the worst kind of wrong -- it looks like it worked.
respond({ body: '<!doctype html><html><body>app</body></html>', type: 'text/html' })
{
  const err = await boom(() => fetchPosts())
  check(err !== null, 'an HTML body must not be read as an empty feed')
  check(err.code === 'not-json', 'and it is reported as a non-JSON response')
  check(/api/i.test(err.message), 'the message says the API is the problem')
}

respond({ body: 'null', type: 'text/plain' })
check((await boom(() => fetchPosts()))?.code === 'not-json', 'any non-JSON content type is refused')

// --- a real empty board is still an empty board ------------------------------------
respond({ body: JSON.stringify({ posts: [], next: null }) })
{
  const page = await fetchPosts()
  check(Array.isArray(page.posts) && page.posts.length === 0, 'a genuine empty feed is not an error')
  check(page.next === null, 'and carries no cursor')
}

// --- errors keep the server's own words ---------------------------------------------
respond({ status: 429, body: JSON.stringify({ error: 'rate-limited', message: 'Slow down.' }) })
{
  const err = await boom(() => fetchPosts())
  check(err.code === 'rate-limited', 'the machine code survives')
  check(err.message === 'Slow down.', 'and so does the human message')
  check(err.status === 429, 'along with the status')
}

// A JSON error body still parses, so a 404 from a real API reads as a real API error.
respond({ status: 404, body: JSON.stringify({ error: 'not-found', message: 'No such thing.' }) })
check((await boom(() => fetchPosts()))?.code === 'not-found', 'a JSON 404 is a normal API error')

// A 404 that is HTML is the API being absent, and must say so rather than parroting 404.
respond({ status: 404, body: '<!doctype html>', type: 'text/html' })
{
  const err = await boom(() => fetchPosts())
  check(err.code === 'not-json', 'an HTML 404 means the API is not there')
  check(/api/i.test(err.message), 'and the message points at that, not at the status code')
}

// --- validation happens before the network -------------------------------------------
let called = 0
globalThis.fetch = async () => {
  called++
  return new Response('{}', { headers: { 'content-type': 'application/json' } })
}
{
  const err = await boom(() => createPost({ body: '' }))
  check(err?.code === 'invalid', 'an empty post is refused locally')
  check(err.fieldErrors?.body, 'and names the field')
  check(called === 0, 'without touching the network')
}

console.log(`ok - posts.test.mjs (${checks} checks)`)
