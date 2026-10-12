// Runs after both builds (see package.json "build"). Writes every page in PAGES to its own
// static HTML file, so a crawler or an AI agent that never runs JavaScript still reads the
// page. Without this, every URL answered with the same empty <div id="root">.
//
// Cloudflare Pages serves dist/how.html at /how. dist/404.html switches off its SPA fallback,
// so an unknown URL is a real 404 instead of a 200 for an empty shell; the two client-only
// route families get the shell back through _redirects.
import { readFileSync, writeFileSync } from 'node:fs'

const dist = new URL('../dist/', import.meta.url)
const { render, PAGES, SITE_URL, APP_VERSION, FAQ } = await import(new URL('../dist-ssr/prerender.js', import.meta.url))

const template = readFileSync(new URL('index.html', dist), 'utf8')
const changelog = readFileSync(new URL('CHANGELOG.md', dist), 'utf8')

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
// JSON inside <script> must not be able to close the tag.
const ld = (obj) => `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`

const APP_LD = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'LocalLens',
  description: PAGES.find((p) => p.path === '/').description,
  applicationCategory: 'MultimediaApplication',
  operatingSystem: 'macOS, Windows',
  softwareVersion: APP_VERSION,
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
  license: 'https://www.gnu.org/licenses/agpl-3.0.html',
  downloadUrl: 'https://github.com/ashesbloom/LocalLens/releases/latest',
  url: SITE_URL,
  sameAs: ['https://github.com/ashesbloom/LocalLens'],
}

const FAQ_LD = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ.map(({ q, a }) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
}

const JSON_LD = { '/': [APP_LD], '/download': [APP_LD], '/faq': [FAQ_LD] }

function headFor(page) {
  const url = SITE_URL + (page.path === '/' ? '/' : page.path)
  return [
    `<title>${esc(page.title)}</title>`,
    `<meta name="description" content="${esc(page.description)}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="LocalLens Community" />`,
    `<meta property="og:title" content="${esc(page.title)}" />`,
    `<meta property="og:description" content="${esc(page.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta name="twitter:card" content="summary" />`,
    ...(JSON_LD[page.path] ?? []).map(ld),
  ].join('\n    ')
}

function textOf(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// The client-only routes (a board post, a blog article, a 404) load this empty shell.
writeFileSync(new URL('shell.html', dist), template)
writeFileSync(new URL('404.html', dist), template)
writeFileSync(new URL('_redirects', dist), ['/post/*  /shell  200', '/blog/*  /shell  200', ''].join('\n'))

const failures = []
for (const page of PAGES) {
  const body = render(page.path, { changelog })
  const text = textOf(body)
  // The check this script exists for: a page that renders to (almost) nothing is the bug
  // we are fixing, so it fails the build rather than shipping quietly.
  if (text.length < 200) failures.push(`${page.path}: only ${text.length} characters of text`)
  if (!/<h1[\s>]/.test(body)) failures.push(`${page.path}: no <h1>`)

  const html = template
    .replace(/<title>[\s\S]*?<\/title>\s*<meta name="description"[^>]*>/, headFor(page))
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`)
  if (html === template) failures.push(`${page.path}: template markers not found`)
  const file = page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`
  writeFileSync(new URL(file, dist), html)
  console.log(`prerender  ${page.path.padEnd(10)} → dist/${file}  (${text.length} chars)`)
}

const today = new Date().toISOString().slice(0, 10)
writeFileSync(
  new URL('sitemap.xml', dist),
  `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${PAGES.map((p) => `  <url><loc>${SITE_URL}${p.path === '/' ? '/' : p.path}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`,
)

// llms.txt (llmstxt.org): the plain-text map an AI agent reads before anything else. Built
// from the same PAGES list, so a new page shows up here without anyone remembering to add it.
const pageUrl = (p) => SITE_URL + (p.path === '/' ? '/' : p.path)
writeFileSync(
  new URL('llms.txt', dist),
  `# LocalLens

> LocalLens is a free, open-source (AGPL-3.0) desktop photo organizer for macOS (Apple Silicon) and Windows. It sorts photos into folders by date, location and recognised faces entirely on the user's own computer: nothing is uploaded, and the app sends no telemetry. This site is its community hub: how it works, install steps, privacy proof, FAQ, comparisons, release notes and a public board.

Current version: ${APP_VERSION}. Source: https://github.com/ashesbloom/LocalLens

## Pages

${PAGES.map((p) => `- [${p.title}](${pageUrl(p)}): ${p.description}`).join('\n')}

## Data

- [Changelog](${SITE_URL}/CHANGELOG.md): every release, newest first, in Markdown
- [Live stats](${SITE_URL}/api/stats): GitHub stars, forks, open issues, installer downloads and site visits as JSON

## Related

- [LL Agent](https://locallensmcp.vercel.app): the MCP server that lets Claude Desktop and other MCP clients run LocalLens (source-available, BUSL-1.1)
- [Latest release](https://github.com/ashesbloom/LocalLens/releases/latest)
`,
)

if (failures.length) {
  console.error(`prerender failed:\n  ${failures.join('\n  ')}`)
  process.exit(1)
}
