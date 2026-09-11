// The one loader for Cloudflare's Turnstile script, shared by everything on the board that
// needs a widget -- the composer, and every open reply form. Loaded once per page no matter
// how many callers ask for it; each caller still gets its own rendered widget and its own
// token by calling turnstile.render() on its own container.
const TURNSTILE_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

let ready = null

export function loadTurnstile() {
  if (ready) return ready
  ready = new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile)
    const el = document.createElement('script')
    el.src = TURNSTILE_SRC
    el.async = true
    el.onload = () => resolve(window.turnstile)
    el.onerror = () => reject(new Error('turnstile did not load'))
    document.head.appendChild(el)
  })
  return ready
}
