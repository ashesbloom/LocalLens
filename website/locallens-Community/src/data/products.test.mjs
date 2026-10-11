// Plain node:assert check, no framework. Run via `node src/data/products.test.mjs`.
//
// Guards the failures that would be silent rather than loud: a missing field renders as
// a blank panel, a shared cache key serves one product's releases under the other's name,
// and an http URL is blocked as mixed content on an https site. None of those throw.
import assert from 'node:assert/strict'
import { PRODUCTS, LOCALLENS, AGENT, PRODUCT_LIST } from './products.js'
import { APP_VERSION } from './version.js'

// --- every field the release pages read must be present on both products ---
// `buildVersion` is excluded here and checked separately: null is a meaningful value for
// it, and a blanket truthiness check would reject the agent's deliberate null.
const REQUIRED = ['id', 'name', 'changelogUrl', 'cacheKey', 'netLabel', 'releasesUrl', 'repoUrl', 'updateVia']
for (const product of PRODUCT_LIST) {
  for (const field of REQUIRED) {
    assert.ok(product[field], `${product.id}.${field} must be set`)
  }
  assert.equal(product.id, Object.keys(PRODUCTS).find((k) => PRODUCTS[k] === product), `${product.id}.id must match its key`)
}

// --- the cache keys must differ --------------------------------------------------
// changelog.js keys its localStorage cache on this. One shared key means the two
// changelogs evict each other, and a visitor who opens /announce then /agent is shown
// LocalLens' releases under LL Agent's heading -- wrong, and it looks like real data.
const cacheKeys = PRODUCT_LIST.map((p) => p.cacheKey)
assert.equal(new Set(cacheKeys).size, cacheKeys.length, 'every product needs its own cache key')

const changelogUrls = PRODUCT_LIST.map((p) => p.changelogUrl)
assert.equal(new Set(changelogUrls).size, changelogUrls.length, 'every product needs its own changelog URL')

// --- LocalLens: served from this origin, built in at build time ------------------
assert.equal(LOCALLENS.changelogUrl, '/CHANGELOG.md', 'LocalLens reads the copy in public/')
assert.equal(LOCALLENS.cacheKey, 'll-changelog-v1', 'the shipped cache key must not change under existing visitors')
assert.equal(LOCALLENS.buildVersion, APP_VERSION, "LocalLens' build version is this site's own")

// --- LL Agent: cross-origin, so the scheme matters ------------------------------
// The site is served over https. An http changelog URL would be blocked as mixed
// content and the page would render as "could not read the changelog" with no clue why.
assert.ok(AGENT.changelogUrl.startsWith('https://'), "the agent's changelog must be https")
assert.ok(AGENT.siteUrl.startsWith('https://'), "the agent's product site must be https")
assert.ok(AGENT.pricingUrl.startsWith(AGENT.siteUrl), 'the pricing page must live on the product site')
// The deployment host serves the same app, but the branded domain is the one to link.
assert.ok(!AGENT.siteUrl.includes('vercel.app'), 'link the custom domain, not the deployment host')
assert.ok(
  AGENT.changelogUrl.endsWith('/CHANGELOG.md'),
  "the agent's changelog URL must point at a CHANGELOG.md, not a directory or an API",
)
// Explicitly null, not merely absent: null says "this site has no second opinion about
// the agent's version", where undefined is indistinguishable from forgetting to set it.
assert.equal(AGENT.buildVersion, null, "the agent's buildVersion must be an explicit null")
assert.ok('buildVersion' in AGENT, 'buildVersion must be declared on the agent, not omitted')

// --- the list and the map cannot drift apart ------------------------------------
assert.equal(PRODUCT_LIST.length, Object.keys(PRODUCTS).length, 'PRODUCT_LIST must cover PRODUCTS')
assert.ok(PRODUCT_LIST.includes(LOCALLENS), 'PRODUCT_LIST must contain LocalLens')
assert.ok(PRODUCT_LIST.includes(AGENT), 'PRODUCT_LIST must contain LL Agent')

console.log('ok — products.test.mjs (24 checks)')
