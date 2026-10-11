// The two products this community serves. One record each, because exactly three things
// the release pages show differ per product -- where the changelog is, where the releases
// are, and how you update -- and nothing else does.
//
// Pure data, no JSX, so this file and its test run under plain `node` like their
// neighbours. (version.js is a plain data module too, so importing it keeps that.)
import { APP_VERSION } from './version.js'

export const PRODUCTS = {
  locallens: {
    id: 'locallens',
    name: 'LocalLens',
    // Copied into public/ at build time by scripts/copy-changelog.mjs, so it is served
    // from this origin.
    changelogUrl: '/CHANGELOG.md',
    // Deliberately the key this site has always used: changing it would throw away every
    // existing visitor's cached parse for no gain.
    cacheKey: 'll-changelog-v1',
    // What the status bar shows while the request is in flight.
    netLabel: 'CHANGELOG.md',
    releasesUrl: 'https://github.com/ashesbloom/LocalLens/releases',
    repoUrl: 'https://github.com/ashesbloom/LocalLens',
    // The version this site was built from, for Announce's drift note.
    buildVersion: APP_VERSION,
    updateVia: 'the app, or Homebrew',
  },
  agent: {
    id: 'agent',
    name: 'LL Agent',
    // LL Agent ships from its own repository, so its changelog is read straight from
    // GitHub rather than copied in at build time. raw.githubusercontent.com answers with
    // `access-control-allow-origin: *` and `cache-control: max-age=300` (measured, not
    // assumed), so the browser can fetch it directly -- no cross-repo CI token, no PAT.
    //
    // Not copied at build time on purpose: a build-time copy is stale the moment the
    // agent releases without this site rebuilding, which is precisely the bug
    // scripts/sync-release.mjs exists to prevent. Read at runtime, it cannot drift.
    changelogUrl: 'https://raw.githubusercontent.com/ashesbloom/locallens_mcp_agent/main/CHANGELOG.md',
    cacheKey: 'll-agent-changelog-v1',
    // The host, matching what posts.js and blog.js show: for a cross-origin read, where
    // the request actually went is the useful thing to put on screen.
    netLabel: 'raw.githubusercontent.com',
    releasesUrl: 'https://github.com/ashesbloom/locallens_mcp_agent/releases',
    repoUrl: 'https://github.com/ashesbloom/locallens_mcp_agent',
    // No build constant to compare against: APP_VERSION is this site's LocalLens version,
    // so comparing the agent's changelog to it would report drift on every single load.
    // null means "this site has no second opinion about the agent's version" and the
    // drift note is skipped rather than fabricated.
    buildVersion: null,
    updateVia: 'the LL menu, or Homebrew',
    // The agent's own product page. Shown on /agent and reachable as the `site` command.
    // The custom domain, not the locallensmcp.vercel.app deployment host that serves the
    // same app: the vercel.app name is an implementation detail that changes if the host
    // ever does, and locallens.in redirects to the www form anyway.
    siteUrl: 'https://www.locallens.in',
    pricingUrl: 'https://www.locallens.in/pricing',
  },
}

export const LOCALLENS = PRODUCTS.locallens
export const AGENT = PRODUCTS.agent

export const PRODUCT_LIST = Object.values(PRODUCTS)
