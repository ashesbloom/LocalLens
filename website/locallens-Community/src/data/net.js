// Tiny subscribable value behind the status bar's `net:` indicator. A future data module
// (Task 7) calls setNetActivity('api.github.com') when a fetch starts and setNetActivity(null)
// when it ends; StatusBar subscribes via useSyncExternalStore. Nothing calls setNetActivity
// yet, so it always reads 'idle' — this wires the mechanism, not fake activity.
let current = 'idle'
const listeners = new Set()

export function setNetActivity(host) {
  current = host || 'idle'
  for (const fn of listeners) fn(current)
}

export function getNetActivity() {
  return current
}

export function subscribeNetActivity(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
