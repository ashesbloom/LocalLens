// Shared by vite.config.js (buildStart hook) and check-changelog-copy.mjs so the
// dev/build pipeline and its check can never drift apart.
import { fileURLToPath } from 'node:url'
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

export const SOURCE = fileURLToPath(new URL('../../../CHANGELOG.md', import.meta.url))
export const DEST = fileURLToPath(new URL('../public/CHANGELOG.md', import.meta.url))

export function copyChangelog() {
  if (!existsSync(SOURCE)) {
    throw new Error(`CHANGELOG copy failed: source not found at ${SOURCE}`)
  }
  mkdirSync(path.dirname(DEST), { recursive: true })
  copyFileSync(SOURCE, DEST)
  return DEST
}
