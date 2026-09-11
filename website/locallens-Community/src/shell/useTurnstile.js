import { useEffect, useRef } from 'react'
import { loadTurnstile } from '../data/turnstile.js'

// Mounts one Turnstile widget into `containerRef.current` for as long as the caller stays
// mounted, in the quiet 'interaction-only' appearance that shows nothing unless Cloudflare
// actually wants the visitor to do something. Returns a ref carrying the current token and a
// `reset()` to call after a submit spends it -- a Turnstile token is single-use, and without
// a reset the widget would silently refuse every request after the first.
//
// One call per widget: the composer and every open reply form each get their own container,
// their own token, and their own independent lifecycle.
export function useTurnstileWidget(sitekey, containerRef, { onError } = {}) {
  const tokenRef = useRef('')
  const widgetIdRef = useRef(null)

  useEffect(() => {
    if (!sitekey || !containerRef.current) return
    let id
    let cancelled = false
    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return
        id = turnstile.render(containerRef.current, {
          sitekey,
          theme: 'dark',
          appearance: 'interaction-only',
          size: 'flexible',
          callback: (token) => {
            tokenRef.current = token
          },
          'expired-callback': () => {
            tokenRef.current = ''
          },
        })
        widgetIdRef.current = id
      })
      .catch(() => onError?.())
    return () => {
      cancelled = true
      if (id && window.turnstile) window.turnstile.remove(id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- containerRef is a ref, stable by contract
  }, [sitekey])

  function reset() {
    tokenRef.current = ''
    if (widgetIdRef.current != null && window.turnstile) window.turnstile.reset(widgetIdRef.current)
  }

  return { tokenRef, reset }
}
