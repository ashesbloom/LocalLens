// Runnable check: runs the real copy and asserts the result, so a broken pipeline
// fails `npm run check` instead of shipping an empty announcements page.
import assert from 'node:assert/strict'
import { statSync } from 'node:fs'
import { copyChangelog, DEST } from './copy-changelog.mjs'

copyChangelog()

assert.ok(statSync(DEST).isFile(), `expected a file at ${DEST}`)
assert.ok(statSync(DEST).size > 0, `${DEST} was copied but is empty`)

console.log(`ok — ${DEST} (${statSync(DEST).size} bytes)`)
