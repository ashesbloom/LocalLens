// Rate limiting, counted in D1 against a salted hash of the caller's address. No second
// store: the posts table already has every row we would put in one, and one indexed COUNT is
// cheaper than the KV round trip it would replace.
import { LIMITS } from '../../src/data/postRules.js'

const TEN_MIN = 10 * 60 * 1000
const ONE_DAY = 24 * 60 * 60 * 1000

// Salted so the table never holds anything that maps back to an address on its own. Rotating
// IP_SALT resets every counter, which is the intended way to clear a bad afternoon.
export async function hashIp(ip, salt) {
  const bytes = new TextEncoder().encode(`${salt ?? ''}:${ip ?? ''}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// One query answers both windows: SUM over a CASE for the short one, COUNT for the day.
// Two round trips to say the same thing would double the cost of every post.
export async function checkPostRate(db, ipHash, now = Date.now()) {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN created > ?2 THEN 1 ELSE 0 END) AS recent,
         COUNT(*) AS today
       FROM posts
       WHERE ip_hash = ?1 AND created > ?3`,
    )
    .bind(ipHash, now - TEN_MIN, now - ONE_DAY)
    .first()

  const recent = Number(row?.recent ?? 0)
  const today = Number(row?.today ?? 0)

  if (recent >= LIMITS.postsPer10Min) {
    return { ok: false, retryAfter: 600, message: 'That is a few posts in a row. Try again in a few minutes.' }
  }
  if (today >= LIMITS.postsPerDay) {
    return { ok: false, retryAfter: 3600, message: 'That is the limit for one day. Try again tomorrow.' }
  }
  return { ok: true }
}

// Voting is cheap enough that the real control is the votes table's primary key -- one row
// per address per post, so a hundred clicks are one row. This exists to stop someone cycling
// through posts writing rows all day, not to stop them voting.
export async function checkVoteRate(db, ipHash, now = Date.now()) {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM votes WHERE ip_hash = ?1 AND created > ?2')
    .bind(ipHash, now - TEN_MIN)
    .first()
  if (Number(row?.n ?? 0) >= LIMITS.votesPer10Min) {
    return { ok: false, retryAfter: 600, message: 'That is a lot of voting. Try again in a few minutes.' }
  }
  return { ok: true }
}

// Same shape as checkPostRate, over the replies table instead. Tighter windows than a post
// gets, because a reply is cheaper to write and easier to spam.
export async function checkReplyRate(db, ipHash, now = Date.now()) {
  const row = await db
    .prepare(
      `SELECT
         SUM(CASE WHEN created > ?2 THEN 1 ELSE 0 END) AS recent,
         COUNT(*) AS today
       FROM replies
       WHERE ip_hash = ?1 AND created > ?3`,
    )
    .bind(ipHash, now - TEN_MIN, now - ONE_DAY)
    .first()

  const recent = Number(row?.recent ?? 0)
  const today = Number(row?.today ?? 0)

  if (recent >= LIMITS.repliesPer10Min) {
    return { ok: false, retryAfter: 600, message: 'That is a few replies in a row. Try again in a few minutes.' }
  }
  if (today >= LIMITS.repliesPerDay) {
    return { ok: false, retryAfter: 3600, message: 'That is the limit for one day. Try again tomorrow.' }
  }
  return { ok: true }
}

// Uploads that no post ever referenced are deleted after a day. Pages Functions have no cron,
// so the sweep rides along on the next write -- one indexed query, and it keeps the bucket
// from filling with files a composer opened and abandoned.
export async function sweepOrphanUploads(db, bucket, now = Date.now()) {
  const cutoff = now - LIMITS.uploadOrphanMs
  const { results } = await db
    .prepare('SELECT key FROM uploads WHERE claimed = 0 AND created < ?1 LIMIT 50')
    .bind(cutoff)
    .all()
  if (!results?.length) return 0
  const keys = results.map((r) => r.key)
  if (bucket) await Promise.all(keys.map((k) => bucket.delete(k)))
  await db
    .prepare(`DELETE FROM uploads WHERE key IN (${keys.map(() => '?').join(',')})`)
    .bind(...keys)
    .run()
  return keys.length
}
