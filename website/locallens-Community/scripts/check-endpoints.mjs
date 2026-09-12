// Endpoint checks for the community board. Plain node:assert, no framework, no network, no
// wrangler -- the handlers are ordinary ES modules, so they can be called directly with a
// stubbed D1 binding and a stubbed fetch.
//
// What this pins down is the ORDER and the OUTCOME of the guards in functions/api/. The board
// publishes immediately and anyone can vote, so a guard that runs after the write, or not at
// all, is a live vulnerability rather than a failing test.
//
// Lives in scripts/ rather than under functions/ on purpose: everything in functions/ is
// routed by Cloudflare Pages, and a test file is not an endpoint.
import assert from 'node:assert/strict'
import { onRequestGet, onRequestPost } from '../functions/api/posts/index.js'
import { onRequestDelete, onRequestPut, onRequestGet as onGetOne } from '../functions/api/posts/[id].js'
import { onRequestPost as onVote } from '../functions/api/posts/[id]/vote.js'
import { onRequestGet as onTags } from '../functions/api/tags.js'
import { onRequestGet as onAdminCheck } from '../functions/api/admin.js'
import { onRequestGet as onReplies, onRequestPost as onReply } from '../functions/api/posts/[id]/replies/index.js'
import { onRequestDelete as onDeleteReply } from '../functions/api/posts/[id]/replies/[replyId].js'
import { onRequestGet as onStats, onRequestPost as onVisit } from '../functions/api/stats.js'
import { hashToken, tokenMatches } from '../functions/_lib/tokens.js'
import { EDIT_WINDOW_MS } from '../src/data/postRules.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

const ORIGIN = 'https://board.test'
const BASE_ENV = { IP_SALT: 'salt', TURNSTILE_SECRET: 'secret', ADMIN_KEY: 'let-me-in-please' }

// --- a D1 stub ---------------------------------------------------------------------
// Enough of the interface to exercise the handlers, dispatching on the SQL so that several
// different reads in one request can answer differently. `written` records every run() and
// `batched` every batch(), so a test can assert what actually reached the table.
function makeDb(config = {}) {
  const written = []
  const batched = []

  const FIRST_ROUTES = [
    [/SUM\(CASE WHEN created.*FROM posts/s, () => config.postRate ?? { recent: 0, today: 0 }],
    [/SUM\(CASE WHEN created.*FROM replies/s, () => config.replyRate ?? { recent: 0, today: 0 }],
    [/COUNT\(\*\) AS n FROM votes/, () => ({ n: config.voteCount ?? 0 })],
    [/COUNT\(\*\) AS n FROM views/, () => {
      if (config.visitsThrow) throw new Error('no such table: views')
      return { n: config.visitCount ?? 0 }
    }],
    [/SELECT value FROM votes/, () => config.previousVote ?? null],
    [/SELECT score, ups, downs FROM posts/, () => config.tallies ?? { score: 1, ups: 1, downs: 0 }],
    [/SELECT id FROM posts/, () => config.targetPost ?? config.postRow ?? null],
    [/SELECT token_hash FROM replies/, () => config.replyRow ?? null],
    [/FROM posts WHERE id/, () => config.postRow ?? null],
  ]
  const ALL_ROUTES = [
    [/COUNT\(\*\) AS n FROM views WHERE day/, () => {
      if (config.visitSeriesThrow) throw new Error('no such table: views')
      return config.visitSeries ?? []
    }],
    [/FROM snapshots WHERE day/, () => {
      if (config.snapsThrow) throw new Error('no such table: snapshots')
      return config.snaps ?? []
    }],
    [/FROM votes WHERE ip_hash/, () => config.myVotes ?? []],
    [/FROM uploads/, () => []],
    [/GROUP BY tag/, () => config.tagCounts ?? []],
    [/FROM replies/, () => config.replies ?? []],
    [/FROM posts/, () => config.rows ?? []],
  ]
  const pick = (routes, sql) => routes.find(([re]) => re.test(sql))?.[1]

  const db = {
    written,
    batched,
    prepare(sql) {
      const stmt = {
        sql,
        args: [],
        bind(...args) {
          stmt.args = args
          return stmt
        },
        async first() {
          return pick(FIRST_ROUTES, sql)?.() ?? null
        },
        async all() {
          return { results: pick(ALL_ROUTES, sql)?.() ?? [] }
        },
        async run() {
          written.push({ sql, args: stmt.args })
          return { meta: { changes: config.changes ?? 1 } }
        },
      }
      return stmt
    },
    async batch(statements) {
      batched.push(statements.map((s) => ({ sql: s.sql, args: s.args })))
      for (const s of statements) written.push({ sql: s.sql, args: s.args })
      return statements.map(() => ({ meta: { changes: 1 } }))
    },
  }
  return db
}

function req(method, path, { body, origin = ORIGIN, headers = {} } = {}) {
  const text = body === undefined ? undefined : JSON.stringify(body)
  const h = { 'CF-Connecting-IP': '203.0.113.9', ...headers }
  if (origin) h.Origin = origin
  if (text !== undefined) {
    h['content-type'] = 'application/json'
    h['content-length'] = String(new TextEncoder().encode(text).length)
  }
  return new Request(`${ORIGIN}${path}`, { method, headers: h, body: text })
}

// Two things now reach the network: Turnstile, and the GitHub call behind /api/stats. The
// stub dispatches on URL so one does not answer for the other -- a single catch-all stub
// would have handed Turnstile's {success:true} to the stats endpoint and quietly passed.
let turnstileCalls = 0
let turnstileVerdict = true
let githubCalls = 0
let githubInit = null
// null = answer normally; 'error' = throw; a number = answer with that status.
let githubFailure = null

globalThis.fetch = async (url, init) => {
  const href = String(url)

  if (href.includes('api.github.com')) {
    githubCalls++
    githubInit = init
    if (githubFailure === 'error') throw new TypeError('network down')
    if (typeof githubFailure === 'number') {
      return new Response('{}', { status: githubFailure, headers: { 'content-type': 'application/json' } })
    }
    return new Response(
      JSON.stringify({ stargazers_count: 153, forks_count: 12, open_issues_count: 7 }),
      { headers: { 'content-type': 'application/json' } },
    )
  }

  turnstileCalls++
  return new Response(JSON.stringify({ success: turnstileVerdict, 'error-codes': [] }), {
    headers: { 'content-type': 'application/json' },
  })
}

const goodPost = (over = {}) => ({ author: 'Mayank', tag: 'bug', body: 'It stalls at 40%.', turnstileToken: 'tok', ...over })

async function post(env, request) {
  turnstileCalls = 0
  const res = await onRequestPost({ env, request, waitUntil: () => {} })
  return { res, data: await res.json() }
}

// ============================ creating ============================================

// --- the kill switch beats everything ----------------------------------------------
{
  const db = makeDb()
  const { res, data } = await post({ ...BASE_ENV, DB: db, POSTING_ENABLED: '0' }, req('POST', '/api/posts', { body: goodPost() }))
  check(res.status === 503, 'POSTING_ENABLED=0 refuses the write')
  check(data.error === 'posting-disabled', 'and says why in a stable code')
  check(db.written.length === 0, 'nothing is written when posting is off')
  check(turnstileCalls === 0, 'and the bot check is not even reached')
}

// --- cross-site writes -------------------------------------------------------------
for (const origin of ['https://evil.test', null]) {
  const db = makeDb()
  const { res } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost(), origin }))
  check(res.status === 403, `origin ${origin ?? '(missing)'} is refused`)
  check(db.written.length === 0, 'and writes nothing')
  check(turnstileCalls === 0, 'before any network call')
}

// --- size, shape, validity ----------------------------------------------------------
{
  const db = makeDb()
  const { res } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost({ body: 'x'.repeat(40000) }) }))
  check(res.status === 413, 'a body past the transport ceiling is refused')
  check(turnstileCalls === 0, 'size is checked before the network call')
}
{
  const db = makeDb()
  const bad = new Request(`${ORIGIN}/api/posts`, { method: 'POST', headers: { Origin: ORIGIN, 'content-type': 'application/json' }, body: 'not json' })
  const res = await onRequestPost({ env: { ...BASE_ENV, DB: db }, request: bad, waitUntil: () => {} })
  check(res.status === 400, 'an unparseable body is refused')
}
{
  const db = makeDb()
  const { res, data } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost({ body: '' }) }))
  check(res.status === 422 && data.errors?.body, 'an empty post is refused and names the field')
  check(db.written.length === 0 && turnstileCalls === 0, 'validation runs before database and network')
}

// --- rate limits ----------------------------------------------------------------------
{
  const db = makeDb({ postRate: { recent: 3, today: 3 } })
  const { res, data } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost() }))
  check(res.status === 429, 'the short-window cap refuses a fourth post')
  check(res.headers.get('retry-after') === '600', 'and says when to come back')
  check(data.error === 'rate-limited', 'with a stable code')
  check(db.written.length === 0 && turnstileCalls === 0, 'the rate check runs before the network call')
}
{
  const db = makeDb({ postRate: { recent: 0, today: 20 } })
  const { res } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost() }))
  check(res.status === 429, 'the daily cap refuses the twenty-first post')
}

// --- the bot check -----------------------------------------------------------------------
{
  turnstileVerdict = false
  const db = makeDb()
  const { res } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost() }))
  check(res.status === 403 && db.written.length === 0, 'a token Cloudflare rejects writes nothing')
  turnstileVerdict = true
}
{
  const db = makeDb()
  const { res } = await post({ ...BASE_ENV, DB: db, TURNSTILE_SECRET: '' }, req('POST', '/api/posts', { body: goodPost() }))
  check(res.status === 403 && db.written.length === 0, 'an unconfigured secret fails closed, never open')
}
{
  const db = makeDb()
  const { res } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost({ turnstileToken: undefined }) }))
  check(res.status === 403, 'a missing token is refused')
}

// --- the happy path, and the ownership token ------------------------------------------
{
  const db = makeDb()
  const { res, data } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost() }))
  check(res.status === 201, 'a good post is created')
  check(db.written.length === 1 && /INSERT INTO posts/.test(db.written[0].sql), 'exactly one insert into posts')
  check(data.post.body === 'It stalls at 40%.', 'the post comes back')
  check(data.post.score === 0 && data.post.myVote === 0, 'and starts with no votes')

  // The whole point of the token: the browser gets the plaintext, the table gets the digest.
  check(/^[0-9a-f]{32}$/.test(data.token), 'a token is handed back exactly once')
  const digest = await hashToken(data.token)
  check(db.written[0].args.includes(digest), 'and only its hash is bound into the insert')
  check(!db.written[0].args.includes(data.token), 'the plaintext token is never stored')

  check(data.post.ip_hash === undefined, 'the response must never carry the ip hash')
  check(data.post.token_hash === undefined, 'nor the token hash')
  check(!JSON.stringify(data.post).includes('203.0.113'), 'nor the address itself')
}
{
  // Normalisation is the server's: a lying client cannot smuggle a raw tag past it.
  const db = makeDb()
  const { data } = await post({ ...BASE_ENV, DB: db }, req('POST', '/api/posts', { body: goodPost({ tag: 'Release Notes!!' }) }))
  check(data.post.tag === 'release-notes', 'a custom tag is slugged server-side')
  check(data.post.tagLabel === 'Release Notes!!', 'and keeps what was typed as its label')
}

// ============================ reading =============================================
{
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: `id${String(20 - i).padStart(2, '0')}`, author: 'a', tag: 'bug', tagLabel: null, body: 'x', created: 1, score: 5 - i }))
  const db = makeDb({ rows, myVotes: [{ post_id: 'id20', value: 1 }] })
  const res = await onRequestGet({ env: { ...BASE_ENV, DB: db }, request: req('GET', '/api/posts') })
  const data = await res.json()
  check(data.posts.length === 20, 'a page is one page, not everything')
  check(data.next === data.posts[19].id, 'the new cursor is the last id on the page')
  check(data.posts[0].myVote === 1, 'the caller sees their own vote')
  check(data.posts[1].myVote === 0, 'and a zero where they have not voted')
  check(!JSON.stringify(data).includes('ip_hash') && !JSON.stringify(data).includes('token_hash'), 'the feed leaks neither hash')
  check(res.headers.get('cache-control') === 'no-store', 'the feed is never cached')
}
{
  // The top sort carries both halves of its cursor, or a run of equal scores would repeat rows.
  const rows = Array.from({ length: 21 }, (_, i) => ({ id: `id${20 - i}`, score: 7, author: 'a', tag: 'bug', body: 'x', created: 1 }))
  const db = makeDb({ rows })
  const res = await onRequestGet({ env: { ...BASE_ENV, DB: db }, request: req('GET', '/api/posts?sort=top') })
  const data = await res.json()
  check(data.sort === 'top', 'the sort comes back so the client cannot disagree')
  check(data.next === `7:${data.posts[19].id}`, 'the top cursor carries score and id')
}
{
  const db = makeDb({ rows: [] })
  const res = await onRequestGet({ env: { ...BASE_ENV, DB: db }, request: req('GET', '/api/posts?sort=sideways&cursor=garbage') })
  const data = await res.json()
  check(data.sort === 'new', 'an unknown sort falls back rather than erroring')
  check(data.next === null, 'a short page has no cursor')
}
{
  const db = makeDb({ postRow: { id: 'abc', author: 'a', tag: 'bug', body: 'x', created: 1, score: 3 } })
  const res = await onGetOne({ env: { ...BASE_ENV, DB: db }, params: { id: 'abc' }, request: req('GET', '/api/posts/abc') })
  check(res.status === 200, 'a single post has its own page')
  check((await res.json()).post.myVote === 0, 'and carries the caller vote')
}
check(
  (await onGetOne({ env: { ...BASE_ENV, DB: makeDb({ postRow: null }) }, params: { id: 'nope' }, request: req('GET', '/api/posts/nope') })).status === 404,
  'a missing post is a 404',
)
{
  const db = makeDb({ tagCounts: [{ tag: 'bug', tagLabel: null, count: 4 }, { tag: 'custom', tagLabel: 'Custom', count: 1 }] })
  const data = await (await onTags({ env: { DB: db } })).json()
  check(data.tags.length === 2 && data.total === 5, 'tag counts add up')
  check(data.tags[1].tagLabel === 'Custom', 'and custom tags come back with their label')
}

// ============================ deleting ============================================
const TOKEN = 'a'.repeat(32)
const TOKEN_HASH = await hashToken(TOKEN)

check(await tokenMatches(TOKEN, TOKEN_HASH), 'a token matches its own hash')
check(!(await tokenMatches('b'.repeat(32), TOKEN_HASH)), 'a different token does not')
check(!(await tokenMatches(TOKEN, null)), 'nothing matches a missing hash')
check(!(await tokenMatches('', TOKEN_HASH)), 'nor does an empty token')

{
  const del = (headers, postRow = { token_hash: TOKEN_HASH }) => {
    const db = makeDb({ postRow })
    return onRequestDelete({ env: { ...BASE_ENV, DB: db }, params: { id: 'abc' }, request: req('DELETE', '/api/posts/abc', { headers }) }).then((res) => ({ res, db }))
  }

  check((await del({})).res.status === 404, 'delete with no proof looks like nothing is there')
  check((await del({ 'x-post-token': 'b'.repeat(32) })).res.status === 404, "another post's token does not work")
  check((await del({ 'x-admin-key': 'wrong-key-entirely' })).res.status === 404, 'a wrong admin key looks the same as none')

  const owner = await del({ 'x-post-token': TOKEN })
  check(owner.res.status === 200, 'the author can take their own post down')
  check(/UPDATE posts SET hidden = 1/.test(owner.db.written[0].sql), 'and it hides rather than deletes')

  const admin = await del({ 'x-admin-key': 'let-me-in-please' })
  check(admin.res.status === 200, 'the admin can take anything down')

  const closed = await onRequestDelete({ env: { DB: makeDb({ postRow: { token_hash: TOKEN_HASH } }), ADMIN_KEY: '' }, params: { id: 'abc' }, request: req('DELETE', '/api/posts/abc', { headers: { 'x-admin-key': '' } }) })
  check(closed.status === 404, 'an unset ADMIN_KEY closes the door rather than opening it')

  const gone = await del({ 'x-post-token': TOKEN }, null)
  check(gone.res.status === 404, 'deleting something already down is a 404')
}

// ============================ editing =============================================
{
  const now = Date.now()
  const put = (headers, created, body = { body: 'a corrected version' }) => {
    const db = makeDb({ postRow: { token_hash: TOKEN_HASH, created, tag: 'bug', tag_label: null, id: 'abc', author: 'a', body: 'x', score: 0 } })
    return onRequestPut({ env: { ...BASE_ENV, DB: db }, params: { id: 'abc' }, request: req('PUT', '/api/posts/abc', { body, headers }) }).then((res) => ({ res, db }))
  }

  const fresh = await put({ 'x-post-token': TOKEN }, now - MINUTES(14))
  check(fresh.res.status === 200, 'a post can be edited fourteen minutes in')
  check(/UPDATE posts SET body = \?2, edited = 1/.test(fresh.db.written[0].sql), 'and is marked as edited')

  const stale = await put({ 'x-post-token': TOKEN }, now - MINUTES(16))
  check(stale.res.status === 409, 'but not sixteen minutes in')
  check((await stale.res.json()).error === 'edit-window-closed', 'with a code the UI can act on')
  check(stale.db.written.length === 0, 'and nothing is written')

  check((await put({}, now)).res.status === 404, 'editing without the token is refused')
  // The admin key deletes; it does not rewrite someone else's words under their name.
  check((await put({ 'x-admin-key': 'let-me-in-please' }, now)).res.status === 404, 'the admin key does not grant editing')

  const empty = await put({ 'x-post-token': TOKEN }, now, { body: '' })
  check(empty.res.status === 422, 'an edit cannot empty the post')
  check(empty.db.written.length === 0, 'and writes nothing')
}
function MINUTES(n) {
  return n * 60 * 1000
}
check(EDIT_WINDOW_MS === MINUTES(15), 'the edit window is fifteen minutes')

// ============================ voting ==============================================
{
  const vote = (value, config = {}) => {
    const db = makeDb({ postRow: { id: 'abc' }, ...config })
    return onVote({ env: { ...BASE_ENV, DB: db }, params: { id: 'abc' }, request: req('POST', '/api/posts/abc/vote', { body: { value } }) }).then((res) => ({ res, db }))
  }

  for (const bad of [2, -2, 0.5, 'up', null, undefined]) {
    check((await vote(bad)).res.status === 422, `a vote of ${JSON.stringify(bad)} is refused`)
  }
  check((await onVote({ env: { ...BASE_ENV, DB: makeDb({ postRow: { id: 'abc' } }) }, params: { id: 'abc' }, request: req('POST', '/api/posts/abc/vote', { body: { value: 1 }, origin: 'https://evil.test' }) })).status === 403, 'a cross-site vote is refused')
  check((await vote(1, { postRow: null })).res.status === 404, 'voting on a missing post is a 404')

  const first = await vote(1)
  check(first.res.status === 200, 'a first vote is accepted')
  check(first.db.batched.length === 1, 'the vote row and the tally move in one batch')
  check(first.db.batched[0].length === 2, 'which is exactly those two statements')
  check(/ON CONFLICT\(post_id, ip_hash\)/.test(first.db.batched[0][0].sql), 'the vote row is an upsert, so a second vote cannot add a row')
  check(first.db.batched[0][1].args.slice(1).join(',') === '1,0,1', 'up by one: ups +1, downs +0, score +1')

  // Flipping an existing up to a down has to move the score by two, not by one.
  const flipped = await vote(-1, { previousVote: { value: 1 } })
  check(flipped.db.batched[0][1].args.slice(1).join(',') === '-1,1,-2', 'flipping up to down moves the score by two')

  // Voting the same way twice writes the row but must not move the tally again.
  const same = await vote(1, { previousVote: { value: 1 } })
  check(same.db.batched[0].length === 1, 'an unchanged vote does not touch the tally')

  const withdrawn = await vote(0, { previousVote: { value: 1 } })
  check(/DELETE FROM votes/.test(withdrawn.db.batched[0][0].sql), 'withdrawing removes the row')
  check(withdrawn.db.batched[0][1].args.slice(1).join(',') === '-1,0,-1', 'and takes the tally back down')

  const limited = await vote(1, { voteCount: 60 })
  check(limited.res.status === 429, 'the vote rate limit fires')
  check(limited.db.batched.length === 0, 'and nothing is written')

  const result = await (await vote(1)).res.json()
  check(result.myVote === 1 && typeof result.score === 'number', 'the server returns the new tallies rather than letting the client guess')
}

// ============================ replying ============================================
{
  const db = makeDb({ replies: [{ id: 'r1', author: 'a', body: 'x', created: 1 }] })
  const res = await onReplies({ env: { DB: db }, params: { id: 'abc' } })
  const data = await res.json()
  check(data.replies.length === 1, 'replies list for a post')
  check(!JSON.stringify(data).includes('ip_hash') && !JSON.stringify(data).includes('token_hash'), 'and leaks neither hash')
}

const reply = (over = {}) => ({ body: 'nice catch', turnstileToken: 'tok', ...over })
async function postReply(env, request) {
  turnstileCalls = 0
  const res = await onReply({ env, params: { id: 'abc' }, request })
  return { res, data: await res.json() }
}

{
  const db = makeDb({ targetPost: { id: 'abc' } })
  const { res } = await postReply({ ...BASE_ENV, DB: db, POSTING_ENABLED: '0' }, req('POST', '/api/posts/abc/replies', { body: reply() }))
  check(res.status === 503, 'the kill switch stops replies too')
  check(db.written.length === 0, 'and nothing is written')
}
{
  const db = makeDb({ targetPost: { id: 'abc' } })
  const { res } = await postReply({ ...BASE_ENV, DB: db }, req('POST', '/api/posts/abc/replies', { body: reply(), origin: 'https://evil.test' }))
  check(res.status === 403, 'cross-site replies are refused')
}
{
  const db = makeDb({ targetPost: { id: 'abc' } })
  const { res, data } = await postReply({ ...BASE_ENV, DB: db }, req('POST', '/api/posts/abc/replies', { body: reply({ body: '' }) }))
  check(res.status === 422 && data.errors?.body, 'an empty reply is refused and names the field')
  check(db.written.length === 0 && turnstileCalls === 0, 'before database or network')
}
{
  const db = makeDb({ targetPost: null })
  const { res } = await postReply({ ...BASE_ENV, DB: db }, req('POST', '/api/posts/abc/replies', { body: reply() }))
  check(res.status === 404, 'replying to a missing or hidden post is refused')
  check(turnstileCalls === 0, 'before the network call')
}
{
  const db = makeDb({ targetPost: { id: 'abc' }, replyRate: { recent: 5, today: 5 } })
  const { res } = await postReply({ ...BASE_ENV, DB: db }, req('POST', '/api/posts/abc/replies', { body: reply() }))
  check(res.status === 429, "a reply's own rate limit fires independently of the post limit")
  check(turnstileCalls === 0, 'before the network call')
}
{
  turnstileVerdict = false
  const db = makeDb({ targetPost: { id: 'abc' } })
  const { res } = await postReply({ ...BASE_ENV, DB: db }, req('POST', '/api/posts/abc/replies', { body: reply() }))
  check(res.status === 403 && db.written.length === 0, 'a reply also needs to pass the bot check')
  turnstileVerdict = true
}
{
  const db = makeDb({ targetPost: { id: 'abc' } })
  const { res, data } = await postReply({ ...BASE_ENV, DB: db }, req('POST', '/api/posts/abc/replies', { body: reply() }))
  check(res.status === 201, 'a good reply is created')
  check(db.batched.length === 1 && db.batched[0].length === 2, 'the reply and the tally move in one batch')
  check(/INSERT INTO replies/.test(db.batched[0][0].sql), 'the first statement inserts the reply')
  check(/UPDATE posts SET replies = replies \+ 1/.test(db.batched[0][1].sql), 'the second bumps the post tally')
  check(/^[0-9a-f]{32}$/.test(data.token), 'a reply also gets an ownership token, once')
  check(!JSON.stringify(data.reply).includes('token_hash') && data.reply.ip_hash === undefined, 'never returned or leaked')
}

// --- deleting a reply ----------------------------------------------------------------------
{
  const RTOKEN = 'b'.repeat(32)
  const RHASH = await hashToken(RTOKEN)
  const del = (headers, replyRow = { token_hash: RHASH }) => {
    const db = makeDb({ replyRow })
    return onDeleteReply({ env: { ...BASE_ENV, DB: db }, params: { id: 'abc', replyId: 'r1' }, request: req('DELETE', '/api/posts/abc/replies/r1', { headers }) }).then((res) => ({ res, db }))
  }

  check((await del({})).res.status === 404, 'deleting a reply with no proof looks like nothing is there')
  check((await del({ 'x-post-token': 'c'.repeat(32) })).res.status === 404, "a different reply's token does not work")

  const owner = await del({ 'x-post-token': RTOKEN })
  check(owner.res.status === 200, "the reply's own author can remove it")
  check(owner.db.batched[0].length === 2, 'hiding the reply and decrementing the post tally are one batch')
  check(/UPDATE replies SET hidden = 1/.test(owner.db.batched[0][0].sql), 'the reply is hidden, not deleted')
  check(/UPDATE posts SET replies = replies - 1/.test(owner.db.batched[0][1].sql), 'and the post tally drops by one')

  const admin = await del({ 'x-admin-key': 'let-me-in-please' })
  check(admin.res.status === 200, 'the admin can remove any reply')

  const gone = await del({ 'x-post-token': RTOKEN }, null)
  check(gone.res.status === 404, 'removing an already-gone reply is a 404')
}

// ============================ stats ===============================================
// The GitHub half runs server-side so the site costs one call per cache window rather than
// one per visitor. These pin the two things that makes load-bearing: that a GitHub outage
// cannot take the endpoint down with it, and that the visit counter cannot be inflated.
{
  const db = makeDb({ visitCount: 4210 })
  githubCalls = 0
  githubFailure = null
  const res = await onStats({ env: { ...BASE_ENV, DB: db } })
  const data = await res.json()
  check(res.status === 200, 'stats answers')
  check(data.stars === 153 && data.forks === 12 && data.openIssues === 7, 'the GitHub numbers come through')
  check(data.visits === 4210, 'and the visit count comes from the database')
  check(githubCalls === 1, 'exactly one GitHub call per request, not one per field')
  check(/max-age=/.test(res.headers.get('cache-control') ?? ''), 'the answer is cacheable — that is what keeps the site inside the rate limit')

  // GitHub answers 403 to a request with no User-Agent. Getting this wrong would show dashes
  // in production while every test passed against a stub that did not care.
  const ua = new Headers(githubInit?.headers).get('user-agent')
  check(typeof ua === 'string' && ua.length > 0, 'the GitHub call sends a User-Agent, which their API requires')
  check(githubInit?.cf?.cacheTtl > 0, 'and asks the edge to cache it')
}

// --- GitHub failing must not take the endpoint with it ------------------------------
for (const failure of ['error', 500, 403]) {
  const db = makeDb({ visitCount: 11 })
  githubFailure = failure
  const res = await onStats({ env: { ...BASE_ENV, DB: db } })
  const data = await res.json()
  check(res.status === 200, `GitHub ${failure} still answers 200`)
  check(data.stars === null && data.forks === null && data.openIssues === null, `GitHub ${failure} yields nulls, never a guess`)
  check(data.visits === 11, `GitHub ${failure} does not hide the visit count as well`)
}
githubFailure = null

// --- a database without the table yet -----------------------------------------------
{
  const db = makeDb({ visitsThrow: true })
  const data = await (await onStats({ env: { ...BASE_ENV, DB: db } })).json()
  check(data.visits === null, 'a missing views table reads as unknown rather than as zero')
  check(data.stars === 153, 'and does not suppress the GitHub numbers')
}

// --- recording a visit ---------------------------------------------------------------
{
  const db = makeDb()
  const res = await onVisit({ env: { ...BASE_ENV, DB: db }, request: req('POST', '/api/stats', { origin: 'https://evil.test' }) })
  check(res.status === 403, 'a cross-site visit is refused')
  check(db.written.length === 0, 'and writes nothing')
}
{
  const db = makeDb()
  const res = await onVisit({ env: { ...BASE_ENV, DB: db }, request: req('POST', '/api/stats') })
  check(res.status === 200, 'a same-site visit is recorded')
  check(db.written.length === 1, 'in exactly one statement')
  check(/INSERT OR IGNORE INTO views/.test(db.written[0].sql), 'as an INSERT OR IGNORE — the primary key is the rate limit')
  check(/^\d{4}-\d{2}-\d{2}$/.test(db.written[0].args[0]), 'keyed by a UTC day string')
  check(/^[0-9a-f]{64}$/.test(db.written[0].args[1]), 'and by a salted hash')
  check(!db.written[0].args.join(',').includes('203.0.113'), 'the raw address is never stored')
}
{
  // The hash must depend on the salt, or rotating IP_SALT would not reset anything.
  const a = makeDb()
  const b = makeDb()
  await onVisit({ env: { ...BASE_ENV, DB: a }, request: req('POST', '/api/stats') })
  await onVisit({ env: { ...BASE_ENV, IP_SALT: 'different', DB: b }, request: req('POST', '/api/stats') })
  check(a.written[0].args[1] !== b.written[0].args[1], 'a different salt gives a different hash')
}

// ============================ stats history =======================================
// The tiles plot these, so a wrong fill is a drawn claim about days nobody recorded.
const DAY = 86400000
const dayStr = (t) => new Date(t).toISOString().slice(0, 10)

async function statsOf(config, extraEnv = {}) {
  const db = makeDb(config)
  const written = db.written
  const res = await onStats({ env: { ...BASE_ENV, DB: db, ...extraEnv }, waitUntil: (p) => p })
  return { res, data: await res.json(), written }
}

{
  const { data } = await statsOf({})
  check(data.series.days.length === 30, 'the window is thirty days')
  check(data.series.days[29] === dayStr(Date.now()), 'and it ends today')
  check(data.series.days[0] === dayStr(Date.now() - 29 * DAY), 'starting twenty-nine days back')
  const sorted = [...data.series.days].sort()
  check(JSON.stringify(sorted) === JSON.stringify(data.series.days), 'the axis runs oldest to newest')
  check(new Set(data.series.days).size === 30, 'with no repeated day')
}

// --- the two fills are NOT the same, and that is the point --------------------------
{
  const today = dayStr(Date.now())
  const yesterday = dayStr(Date.now() - DAY)
  const { data } = await statsOf({
    // Nothing for the day between: the site was up and nobody came.
    visitSeries: [{ day: dayStr(Date.now() - 2 * DAY), n: 4 }, { day: today, n: 7 }],
    snaps: [{ day: yesterday, stars: 150, forks: 9, open_issues: 2 }, { day: today, stars: 158, forks: 15, open_issues: 0 }],
  })
  const v = data.series.visits
  check(v.length === 30, 'visits fills the whole axis')
  check(v[27] === 4 && v[29] === 7, 'a recorded day carries its count')
  check(v[28] === 0, 'a day with no rows is ZERO visitors — it really did have none')
  check(v[0] === 0, 'and so is every day before the first row')

  const st = data.series.stars
  check(st[28] === 150 && st[29] === 158, 'a snapshot day carries its reading')
  check(st[0] === null, 'a day with no snapshot is NULL — we did not look, which is not a zero')
  check(st.filter((x) => x === 0).length === 0, 'a missing snapshot must never read as zero')
  check(data.series.forks[29] === 15 && data.series.openIssues[29] === 0, 'every column comes through')
  check(data.series.openIssues[28] === 2, 'including one that is zero today and was not before')
}

// --- no history at all -> the tile draws the band ------------------------------------
{
  const { data } = await statsOf({ snaps: [] })
  check(Array.isArray(data.series.stars) && data.series.stars.length === 0, 'no snapshots is an EMPTY series, not thirty nulls')
  check(data.series.visits.length === 30, 'visits still has its axis')
}
{
  const { data } = await statsOf({ snapsThrow: true, visitSeriesThrow: true })
  check(data.series.stars.length === 0 && data.series.visits.length === 0, 'a table that does not exist yet reads as no history')
  check(data.stars === 153, 'and does not suppress the current numbers')
}

// --- recording today's reading ---------------------------------------------------------
{
  githubFailure = null
  const { written } = await statsOf({})
  const snap = written.find((w) => /INSERT OR REPLACE INTO snapshots/.test(w.sql))
  check(snap, "a good reading is recorded, or there is never any history to plot")
  check(snap.args[0] === dayStr(Date.now()), 'keyed by today in UTC')
  check(snap.args.slice(1).join(',') === '153,12,7', 'storing exactly what GitHub returned')
  check(/OR REPLACE/.test(snap.sql), 'OR REPLACE — the latest reading of today wins, yesterday is never rewritten')
}
for (const failure of ['error', 500]) {
  githubFailure = failure
  const { written } = await statsOf({})
  check(!written.some((w) => /INTO snapshots/.test(w.sql)), `a GitHub ${failure} records NOTHING — a null stored as a reading would dip the line forever`)
}
githubFailure = null

// --- GET /api/admin ------------------------------------------------------------------
// The prompt used to store whatever was typed and call it admin mode. These pin down that
// only the real key gets a yes, and that the yes carries nothing else with it.
{
  const ask = (headers) => onAdminCheck({ env: BASE_ENV, request: req('GET', '/api/admin', { headers }) })

  const right = await ask({ 'x-admin-key': 'let-me-in-please' })
  check(right.status === 200, 'the real admin key is accepted')
  check((await right.json()).admin === true, 'and says so plainly')

  check((await ask({ 'x-admin-key': 'nearly-right' })).status === 404, 'a wrong key is refused')
  check((await ask({})).status === 404, 'so is no key at all')
  check((await ask({ 'x-admin-key': '' })).status === 404, 'so is an empty one')

  // The guard that matters most: an unset ADMIN_KEY must refuse everyone rather than let an
  // empty header match an empty variable.
  const unset = await onAdminCheck({ env: { ...BASE_ENV, ADMIN_KEY: '' }, request: req('GET', '/api/admin', { headers: { 'x-admin-key': '' } }) })
  check(unset.status === 404, 'an unset ADMIN_KEY closes the door rather than opening it')

  // A near-miss of the same length would pass a comparison that only checked length.
  const sameLength = 'let-me-in-pleasX'.slice(0, 'let-me-in-please'.length)
  check((await ask({ 'x-admin-key': sameLength })).status === 404, 'a same-length near miss is still refused')
}

console.log(`ok - check-endpoints.mjs (${checks} checks)`)
