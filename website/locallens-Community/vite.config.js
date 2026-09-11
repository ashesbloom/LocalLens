import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyChangelog, SOURCE } from './scripts/copy-changelog.mjs'

// Copies the repo's CHANGELOG.md into public/ so the announcement page (Task 4) can
// fetch it at /CHANGELOG.md. Runs on buildStart, which fires for both `vite` (dev)
// and `vite build`, so the file is present in either mode.
function changelogPlugin() {
  return {
    name: 'copy-changelog',
    buildStart() {
      try {
        copyChangelog()
      } catch (err) {
        this.error(`[copy-changelog] ${err.message} (expected repo CHANGELOG.md at ${SOURCE})`)
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), changelogPlugin()],
  server: {
    // The community board's API lives in functions/ and is served by wrangler, not by vite.
    // Without this proxy, /api/posts falls into vite's SPA fallback and answers index.html
    // with a 200 on GET (which the client used to read as an empty board) and 404 on POST.
    // `npm run dev` starts both processes; see scripts/dev.mjs.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8788',
        changeOrigin: false,
      },
    },
  },
})
