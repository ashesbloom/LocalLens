// Plain node:assert check. Run via `node src/data/mine.test.mjs`.
// The point of this file is the hostile-storage cases: localStorage throws outright in some
// privacy modes and embedded views, and none of that may reach a component.
import assert from 'node:assert/strict'
import { rememberPost, forgetPost, tokenFor, ownsPost, setAdminKey, adminKey, clearAdminKey, isAdmin, takeAppKeyFromHash, appKey } from './mine.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// A working store.
function fakeStore(seed = {}) {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    _map: map,
  }
}
// One that throws on every access, the way a blocked browser does.
const hostile = {
  getItem() { throw new Error('storage disabled') },
  setItem() { throw new Error('storage disabled') },
  removeItem() { throw new Error('storage disabled') },
}

// --- the ordinary path -------------------------------------------------------------
{
  const s = fakeStore()
  check(rememberPost('abc', 'tok1', s), 'a post is remembered')
  check(tokenFor('abc', s) === 'tok1', 'and its token comes back')
  check(ownsPost('abc', s), 'and it reads as owned')
  check(!ownsPost('other', s), 'a post never made is not owned')
  check(tokenFor('other', s) === null, 'and has no token')
  check(forgetPost('abc', s), 'forgetting works')
  check(!ownsPost('abc', s), 'and it is no longer owned')
  check(!forgetPost('abc', s), 'forgetting twice reports nothing changed')
}
{
  const s = fakeStore()
  check(!rememberPost('', 'tok', s), 'an empty id is not remembered')
  check(!rememberPost('abc', '', s), 'nor an empty token')
}

// --- the map does not grow for ever -------------------------------------------------
{
  const s = fakeStore()
  for (let i = 0; i < 260; i++) rememberPost(`id${String(i).padStart(4, '0')}`, `t${i}`, s)
  const kept = JSON.parse(s.getItem('locallens.board.tokens'))
  check(Object.keys(kept).length === 200, 'the token map is capped')
  check(kept['id0259'] !== undefined, 'the newest is kept')
  check(kept['id0000'] === undefined, 'the oldest is dropped')
}

// --- storage that throws --------------------------------------------------------------
check(rememberPost('abc', 'tok', hostile) === false, 'remembering fails quietly when storage throws')
check(tokenFor('abc', hostile) === null, 'reading a token fails quietly')
check(ownsPost('abc', hostile) === false, 'ownership reads as false')
check(forgetPost('abc', hostile) === false, 'forgetting fails quietly')
check(setAdminKey('k', hostile) === false, 'setting the admin key fails quietly')
check(adminKey(hostile) === null, 'reading the admin key fails quietly')
check(clearAdminKey(hostile) === false, 'clearing the admin key fails quietly')
check(isAdmin(hostile) === false, 'and nobody is admin')

// --- storage with junk in it -------------------------------------------------------------
check(tokenFor('abc', fakeStore({ 'locallens.board.tokens': 'not json' })) === null, 'unparseable storage reads as empty')
check(tokenFor('abc', fakeStore({ 'locallens.board.tokens': '[1,2,3]' })) === null, 'an array where an object belongs reads as empty')
check(tokenFor('abc', fakeStore({ 'locallens.board.tokens': 'null' })) === null, 'a null reads as empty')
check(tokenFor('abc', fakeStore({ 'locallens.board.tokens': '{"abc":42}' })) === null, 'a non-string token is refused')
{
  // Junk must not stop the next write from working.
  const s = fakeStore({ 'locallens.board.tokens': 'not json' })
  check(rememberPost('abc', 'tok', s) && tokenFor('abc', s) === 'tok', 'a corrupt map is replaced, not inherited')
}

// --- the admin key -----------------------------------------------------------------------
{
  const s = fakeStore()
  check(!isAdmin(s), 'nobody is admin to start with')
  check(setAdminKey('  secret  ', s), 'the key is accepted')
  check(adminKey(s) === 'secret', 'and stored trimmed')
  check(isAdmin(s), 'which turns admin mode on')
  check(!setAdminKey('   ', s), 'a blank key is refused')
  check(adminKey(s) === 'secret', 'and does not clobber the real one')
  clearAdminKey(s)
  check(!isAdmin(s) && adminKey(s) === null, 'clearing turns it off')
}

// --- no store at all (server render, or a browser without one) ------------------------------
check(tokenFor('abc', null) === null, 'a null store reads as empty')
check(rememberPost('abc', 'tok', null) === false, 'and writes fail quietly')
check(isAdmin(null) === false, 'and nobody is admin')

// --- the LocalLens app key ------------------------------------------------------------------
{
  const key = '0123456789abcdef0123456789abcdef'
  const s = fakeStore()
  check(appKey(s) === null, 'no app key to start with')
  check(takeAppKeyFromHash(`#app=${key}`, s) === '', 'the key is taken out of the hash')
  check(appKey(s) === key, 'and kept')
  check(takeAppKeyFromHash(`#app=${'f'.repeat(32)}&x=1`, s) === '#x=1', 'other fragment parts survive')
  check(appKey(s) === 'f'.repeat(32), 'and a newer key replaces the old one')
  check(takeAppKeyFromHash('#app=not-a-key', s) === '' && appKey(s) === 'f'.repeat(32), 'a malformed key is dropped, not stored')
  check(takeAppKeyFromHash('#section', s) === '#section', 'a hash without a key is left alone')
  check(takeAppKeyFromHash('', s) === '', 'as is no hash at all')
  check(appKey(fakeStore({ 'locallens.board.appKey': 'junk' })) === null, 'junk in storage is no key')
  check(takeAppKeyFromHash(`#app=${key}`, hostile) === '' && appKey(hostile) === null, 'blocked storage still cleans the URL')

  // By default the key is kept for this tab only (sessionStorage), never browser-wide: a
  // crafted #app= link must not stick to every later post. The newest key wins, so a
  // reinstalled app's key takes over.
  const tab = fakeStore()
  const site = fakeStore()
  globalThis.sessionStorage = tab
  globalThis.localStorage = site
  takeAppKeyFromHash(`#app=${key}`)
  check(appKey() === key && appKey(site) === null, 'the key is kept in the tab, not the browser')
  takeAppKeyFromHash(`#app=${'a'.repeat(32)}`)
  check(appKey() === 'a'.repeat(32), 'a newer app key takes over')
  delete globalThis.sessionStorage
  delete globalThis.localStorage
}

console.log(`ok - mine.test.mjs (${checks} checks)`)
