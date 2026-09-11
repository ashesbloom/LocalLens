// Hashing for the per-post ownership token. The plaintext is returned to the browser once,
// at creation, and only the digest below is stored -- so the posts table grants no power over
// the posts in it, and a leaked backup cannot be used to delete or rewrite anyone's post.
//
// Plain SHA-256 rather than a password hash on purpose: this is a 128-bit random value we
// generated, not something a person chose, so there is no dictionary to run against it and
// nothing for a slow KDF to buy.

export async function hashToken(token) {
  const text = String(token ?? '')
  if (!text) return null
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// True when `token` is the one this post was created with. Comparing digests rather than
// plaintext, and length-first so a mismatch is not distinguishable by timing in any way that
// matters for a value nobody is going to guess anyway.
export async function tokenMatches(token, storedHash) {
  if (!storedHash) return false
  const given = await hashToken(token)
  if (!given || given.length !== storedHash.length) return false
  let diff = 0
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ storedHash.charCodeAt(i)
  return diff === 0
}
