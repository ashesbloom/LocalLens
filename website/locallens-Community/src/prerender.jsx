// Build-time entry: `vite build --ssr src/prerender.jsx` bundles this for node, and
// scripts/prerender.mjs calls render() once per page to write static HTML. Never shipped to
// the browser.
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router'
import App from './App.jsx'
import { primeChangelog } from './data/changelog.js'

export { PAGES, SITE_URL } from './shell/commands.js'
export { APP_VERSION } from './data/version.js'
export { FAQ } from './content/faq.js'

export function render(url, { changelog } = {}) {
  if (changelog) primeChangelog(changelog)
  return renderToString(
    <StaticRouter location={url}>
      <App />
    </StaticRouter>,
  )
}
