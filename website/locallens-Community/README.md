# LocalLens Community

The community site for LocalLens — releases, docs, and Labs experiments. Vite + React,
plain CSS, no third-party requests.

## Development

```
npm install
npm run dev       # http://localhost:5173
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
npm run check     # runs the changelog-copy and analytics checks
```

## Deploy

Cloudflare Pages. Root directory: `website/locallens-Community`. Build output: `dist`.

## Environment variables

Copy `.env.example` to `.env` and fill in what you need (both are optional — the site
works with neither set):

- `VITE_ANALYTICS_URL` — self-hosted analytics collector endpoint. Unset means no
  analytics network calls are made at all.
- `VITE_TURNSTILE_SITEKEY` — Cloudflare Turnstile site key for the contact form.
