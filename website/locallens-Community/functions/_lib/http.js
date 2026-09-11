// Response shapes and request guards shared by every endpoint. Kept in one file so that
// "what does an error look like" is answered once -- the client parses one shape.

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // The feed is written to constantly and read immediately after posting. A cached list
      // that does not include the post someone just made reads as data loss.
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...headers,
    },
  })
}

// `error` is a stable machine code; `message` is what a person reads. Keeping them separate
// means the UI can react to the code without matching on English.
export function fail(status, error, message, extra = {}, headers = {}) {
  return json({ error, message, ...extra }, status, headers)
}

// Every write must come from a page on this site. A cross-site form post carries an Origin
// that will not match, and a missing Origin means the request did not come from a browser
// doing what we support.
export function sameOrigin(request) {
  const origin = request.headers.get('Origin')
  if (!origin) return false
  try {
    return new URL(origin).host === new URL(request.url).host
  } catch {
    return false
  }
}

// Cloudflare sets this on every request and it cannot be spoofed by the client, unlike
// X-Forwarded-For. Only ever used to build a salted hash for counting.
export function clientIp(request) {
  return request.headers.get('CF-Connecting-IP') || ''
}

// Compares without an early return on the first differing byte. Length is still observable,
// which is fine for a key we generate.
export function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Reads a JSON body with a hard ceiling, checked from Content-Length BEFORE the body is
// pulled into memory. Without this, a request claiming to be a post can make the worker
// allocate as much as the client cares to send.
export async function readJson(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > maxBytes) return { tooLarge: true }
  try {
    const text = await request.text()
    if (text.length > maxBytes) return { tooLarge: true }
    return { value: JSON.parse(text) }
  } catch {
    return { malformed: true }
  }
}
