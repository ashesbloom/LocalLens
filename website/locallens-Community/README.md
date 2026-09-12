# LocalLens Community

The community site for LocalLens — releases, docs, and Labs experiments. Vite + React,
plain CSS, no third-party requests.

## Development

```
npm install
npm run db:init   # once — creates the local D1 database from schema.sql
npm run dev       # http://localhost:5173
npm run build     # outputs to dist/
npm run preview   # serve the production build locally
npm run check     # every test suite; no network, no wrangler
```

`npm run dev` starts two processes behind one Ctrl-C: vite for the app, and wrangler for the
board's API in `functions/`. Vite proxies `/api` to wrangler, so there is still one URL to
open. Running plain `vite` instead leaves every `/api` route answering the SPA shell, which
makes the board look empty rather than broken. Use `npm run db:reset` to start the local
board over.

Local development needs no Cloudflare account. `.dev.vars` holds Turnstile's public
always-passes test pair, and wrangler creates the D1 copy under `.wrangler/` on first use.

## Deploy

Cloudflare Pages, connected to this Git repository. Production builds from `main`.

| Setting | Value |
|---|---|
| Root directory | `website/locallens-Community` |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Production branch | `main` |

`wrangler.toml` is the source of truth for bindings once it exists, so the D1 binding is
configured there and not in the dashboard. The Node version comes from `.node-version`.

### First-time setup

```
npx wrangler login
npx wrangler d1 create locallens-community      # put the id in wrangler.toml
npx wrangler d1 execute locallens-community --remote --file=schema.sql
```

Then set the four runtime secrets. `IP_SALT` and `ADMIN_KEY` should be fresh random values
(`openssl rand -hex 32`), not the local ones from `.dev.vars`:

```
npx wrangler pages secret put TURNSTILE_SECRET
npx wrangler pages secret put IP_SALT
npx wrangler pages secret put ADMIN_KEY
npx wrangler pages secret put POSTING_ENABLED   # "1"
```

**A secret only reaches a deployment built after it was set.** Measured, not assumed: with
the site live, setting `POSTING_ENABLED` to `0` and posting anyway returned the Turnstile
error rather than the 503 that guard sits in front of, so the running deployment never saw
the new value. Set secrets first, then deploy. Change one later and you must redeploy --
from the dashboard's retry button, or by pushing to `community-site`.

`POSTING_ENABLED` is the kill switch: set it to `0`, redeploy, and the board goes read-only
while everything stays readable. It is a secret rather than a `wrangler.toml` variable
because a variable there would additionally need a commit and a push, where a secret needs
only the redeploy.

## Environment variables

Browser-side variables are `VITE_` prefixed and compiled into the bundle, so none of them
may ever hold a secret. Copy `.env.example` to `.env` for local work.

- `VITE_TURNSTILE_SITEKEY` — Cloudflare Turnstile site key, used by the board's composer.
  `.env` holds the test key for local work; `.env.production` holds the real one and is
  committed, because a site key is public by design. The server half, `TURNSTILE_SECRET`, is
  a Pages secret and there is no fail-open path: with no secret set, every post is refused.
- `VITE_ANALYTICS_URL` — self-hosted analytics collector endpoint. Unset means no analytics
  network calls are made at all.
- `VITE_BLOG_API` — Blogs! content API base. Unset falls back to the live public instance.
