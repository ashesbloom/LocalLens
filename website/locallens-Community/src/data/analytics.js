// Analytics seam — no vendor wired in. Ships as a no-op until VITE_ANALYTICS_URL points
// at a self-hosted collector, and never lets a network failure break the calling page.

function resolveEndpoint() {
  // import.meta.env is Vite's real source (statically replaced at build time).
  // process.env is only consulted so this module stays testable from plain `node`,
  // which never populates import.meta.env — same variable, same meaning, just read
  // through whichever runtime actually provides it. No-op in the browser bundle.
  if (import.meta.env?.VITE_ANALYTICS_URL) return import.meta.env.VITE_ANALYTICS_URL
  if (typeof process !== 'undefined' && process.env?.VITE_ANALYTICS_URL) {
    return process.env.VITE_ANALYTICS_URL
  }
  return undefined
}

function send(event, props, path) {
  const url = resolveEndpoint()
  if (!url) {
    if (import.meta.env?.DEV) console.debug('[analytics]', event, props, path)
    return
  }
  try {
    fetch(url, {
      method: 'POST',
      keepalive: true,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ event, props, path, ts: Date.now() }),
    }).catch(() => {})
  } catch {
    // fetch threw synchronously (e.g. malformed URL) — swallow, never break the caller.
  }
}

export function track(event, props = {}) {
  send(event, props, typeof window !== 'undefined' ? window.location.pathname : undefined)
}

export function pageview(path) {
  send('pageview', {}, path)
}
