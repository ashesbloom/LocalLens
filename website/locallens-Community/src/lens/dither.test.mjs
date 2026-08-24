// Plain node:assert check, no framework. Run via `node src/lens/dither.test.mjs`. Covers
// only the pure maths (no canvas, no DOM) — the image-sampling half of the lens lives in
// DitherLens.jsx and isn't reachable from plain node.
import assert from 'node:assert/strict'
import { FLOOR, CELLS, passesBayer, dotRadius, driftOffset, colorTier } from './dither.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- FLOOR genuinely suppresses near-zero cells, at every Bayer offset ---
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    check(passesBayer(FLOOR - 0.001, x, y) === false, `ink just under FLOOR must never draw at (${x},${y})`)
  }
}

// --- a fully-inked cell always clears the Bayer threshold, at every offset in the tile ---
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    check(passesBayer(1, x, y) === true, `ink=1 must always pass the Bayer test at (${x},${y})`)
  }
}

// --- a zero-ink cell never clears it, at every offset ---
for (let y = 0; y < 8; y++) {
  for (let x = 0; x < 8; x++) {
    check(passesBayer(0, x, y) === false, `ink=0 must never pass the Bayer test at (${x},${y})`)
  }
}

// --- dot radius grows monotonically with ink ---
let prevRadius = -Infinity
for (let i = 0; i <= 10; i++) {
  const ink = i / 10
  const r = dotRadius(ink)
  check(r > prevRadius, `dotRadius(${ink}) = ${r} must exceed the previous ink step's radius`)
  prevRadius = r
}

// --- colour tiers land on the right side of their thresholds ---
check(colorTier(0.67) === 'phos', 'ink just above 0.66 must be phos')
check(colorTier(0.66) === 'mid', 'ink exactly at 0.66 must not yet be phos (strict >)')
check(colorTier(0.35) === 'mid', 'ink just above 0.34 must be mid')
check(colorTier(0.34) === 'dim', 'ink exactly at 0.34 must not yet be mid (strict >)')

// --- drift displacement is ~zero at the centre and grows outward ---
const halfExtent = CELLS / 2
const centre = driftOffset(0, 0, halfExtent)
const centreMag = Math.hypot(centre.ox, centre.oy)
check(centreMag < 1e-3, `displacement at the centre cell must be ~zero, got ${centreMag}`)

// Sampled along a single ray (dy = 0) at small radii, where the linear 7*rad term of the
// push formula dominates the sin() wobble — this is where "grows outward" is unambiguous.
// (The full push formula oscillates by design — see dither.py — so it is not globally
// monotonic in rad; that oscillation is the intended "breathing" wobble, not a bug.)
const radii = [0.02, 0.06, 0.1]
let prevMag = -Infinity
for (const rad of radii) {
  const dx = rad * halfExtent
  const { ox, oy } = driftOffset(dx, 0, halfExtent)
  const mag = Math.hypot(ox, oy)
  check(mag > prevMag, `drift magnitude at rad=${rad} (${mag}) must exceed the previous, smaller radius`)
  prevMag = mag
}

console.log(`ok — dither.test.mjs (${checks} checks)`)
