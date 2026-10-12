import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { takeAppKeyFromHash } from './data/mine.js'
import { BOOT_FLAG } from './shell/useBoot.js'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/home.css'
import './styles/announce.css'
import './styles/blog.css'
import './styles/article.css'
import './styles/doc.css'
import './styles/post.css'
import './styles/contact.css'
import './styles/keys.css'

// Before the router reads the URL: keep the LocalLens app key if the app sent one, and put the
// address back without it (see takeAppKeyFromHash).
const cleanHash = takeAppKeyFromHash(window.location.hash)
if (cleanHash !== window.location.hash) {
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search + cleanHash)
}

const root = document.getElementById('root')

// A prerendered page (scripts/prerender.mjs) is already on screen. Playing the boot sequence
// over it would show the page, then the boot lines, then the page again — so count it as booted.
if (root.hasChildNodes()) {
  try {
    sessionStorage.setItem(BOOT_FLAG, '1')
  } catch {
    // storage blocked — the boot plays once more, which is harmless
  }
}

// ponytail: createRoot repaints over the prerendered DOM instead of hydrating it, so a markup
// difference between build and browser can never throw. Switch to hydrateRoot if the repaint shows.
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
