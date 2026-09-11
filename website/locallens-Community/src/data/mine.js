// Everything the board keeps in this browser, in one place: which posts you made, and the
// admin key if you have entered one.
//
// Every call is wrapped. localStorage does not merely return null when it is unavailable --
// it throws on access in some embedded views and privacy modes, and a board that white-screens
// because storage is blocked is worse than one that forgets who you are. Failure here is
// always "you own nothing", never an exception reaching a component.
//
// The store is a parameter with a default so the whole file runs under plain `node` in the
// test, where there is no localStorage at all.

const TOKENS_KEY = 'locallens.board.tokens'
const ADMIN_KEY = 'locallens.board.admin'

// A browser only needs the tokens for posts recent enough to still be on screen. Capping the
// map stops it growing without bound for someone who posts a lot over a year.
const MAX_REMEMBERED = 200

function browserStore() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function read(store, key) {
  try {
    return store?.getItem(key) ?? null
  } catch {
    return null
  }
}

function write(store, key, value) {
  // Not `store?.setItem(...)`: with no store the optional chain does nothing and then reports
  // success, so a caller would believe it had saved the delete token when it had saved
  // nothing. Absent storage is a failed write, and has to say so.
  if (!store) return false
  try {
    store.setItem(key, value)
    return true
  } catch {
    // Quota exceeded, or storage disabled between the read and the write. Losing the token
    // means losing the delete button, which is a much smaller problem than throwing here.
    return false
  }
}

function readTokens(store) {
  const raw = read(store, TOKENS_KEY)
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function rememberPost(id, token, store = browserStore()) {
  if (!id || !token) return false
  const tokens = readTokens(store)
  tokens[id] = token
  // Ids sort by time, so the oldest keys are simply the smallest ones.
  const keys = Object.keys(tokens).sort()
  while (keys.length > MAX_REMEMBERED) delete tokens[keys.shift()]
  return write(store, TOKENS_KEY, JSON.stringify(tokens))
}

export function forgetPost(id, store = browserStore()) {
  const tokens = readTokens(store)
  if (!(id in tokens)) return false
  delete tokens[id]
  return write(store, TOKENS_KEY, JSON.stringify(tokens))
}

export function tokenFor(id, store = browserStore()) {
  const value = readTokens(store)[id]
  return typeof value === 'string' && value ? value : null
}

export function ownsPost(id, store = browserStore()) {
  return tokenFor(id, store) !== null
}

export function setAdminKey(key, store = browserStore()) {
  const text = String(key ?? '').trim()
  if (!text) return false
  return write(store, ADMIN_KEY, text)
}

export function adminKey(store = browserStore()) {
  const value = read(store, ADMIN_KEY)
  return value || null
}

export function clearAdminKey(store = browserStore()) {
  if (!store) return false
  try {
    store.removeItem(ADMIN_KEY)
    return true
  } catch {
    return false
  }
}

export function isAdmin(store = browserStore()) {
  return adminKey(store) !== null
}
