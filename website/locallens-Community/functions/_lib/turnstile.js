// Server-side half of the Cloudflare Turnstile check. The widget in the browser produces a
// token; only this verification decides whether it meant anything.
const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstile(token, ip, secret) {
  // A missing secret is a deployment mistake, and the safe reading of it is "nobody may
  // post" rather than "everybody may". Failing open here would silently remove the only bot
  // check on a board that publishes immediately.
  if (!secret) return { ok: false, why: 'not-configured' }
  if (!token || typeof token !== 'string') return { ok: false, why: 'missing-token' }

  const form = new FormData()
  form.append('secret', secret)
  form.append('response', token)
  if (ip) form.append('remoteip', ip)

  try {
    const res = await fetch(VERIFY, { method: 'POST', body: form })
    const data = await res.json()
    return { ok: data.success === true, why: (data['error-codes'] ?? []).join(',') }
  } catch {
    // Cloudflare being unreachable is also not a reason to let a write through.
    return { ok: false, why: 'verify-unreachable' }
  }
}
