// Plain node:assert check, no framework. Run via `node src/data/analytics.test.mjs`.
import assert from 'node:assert/strict'
import { track, pageview } from './analytics.js'

delete process.env.VITE_ANALYTICS_URL

// --- unset endpoint: no network call, nothing throws ---
let calls = 0
globalThis.fetch = () => { calls++; return Promise.resolve() }
assert.doesNotThrow(() => track('click', { id: 'cta' }))
assert.doesNotThrow(() => pageview('/labs'))
assert.equal(calls, 0, 'fetch must not be called when VITE_ANALYTICS_URL is unset')

// --- configured endpoint: exactly one POST, right shape ---
process.env.VITE_ANALYTICS_URL = 'https://collector.example.test/collect'
let captured = null
globalThis.fetch = (url, init) => { captured = { url, init }; return Promise.resolve({ ok: true }) }
track('click', { id: 'cta' })
assert.equal(captured.url, 'https://collector.example.test/collect')
assert.equal(captured.init.method, 'POST')
assert.equal(captured.init.keepalive, true)
assert.equal(captured.init.headers['content-type'], 'application/json')
const body = JSON.parse(captured.init.body)
assert.equal(body.event, 'click')
assert.deepEqual(body.props, { id: 'cta' })
assert.equal(typeof body.ts, 'number')

// --- configured endpoint but fetch rejects: must not reject into the caller ---
globalThis.fetch = () => Promise.reject(new Error('network down'))
let unhandled = false
process.once('unhandledRejection', () => { unhandled = true })
assert.doesNotThrow(() => pageview('/broken'))
await new Promise((resolve) => setImmediate(resolve))
assert.equal(unhandled, false, 'a rejected fetch must not surface as an unhandled rejection')

delete process.env.VITE_ANALYTICS_URL
console.log('ok — analytics.test.mjs (4 checks)')
