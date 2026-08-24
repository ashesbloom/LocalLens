// Plain node:assert check, no framework. Run via `node src/lens/dither.test.mjs`. Covers
// only the pure maths (no canvas, no DOM) — the image-sampling half of the lens lives in
// DitherLens.jsx and isn't reachable from plain node.
import assert from 'node:assert/strict'
import { FLOOR, CELLS, combineInk, passesBayer, dotRadius, driftOffset, colorTier } from './dither.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- combineInk: pin known values, not the formula that produced them ---
// (values below were computed once with combineInk itself and hand-verified against
// design/dither.py's ink_field(): 0.80*sharp + 0.70*halo, **0.85, +0.22 bloom, edge fade.)

// sharp=0, halo=0, r=0: base ink is 0, so this isolates the iris-bloom coefficient (0.22)
// and confirms the edge fade at dead centre (r=0) doesn't attenuate it.
check(combineInk(0, 0, 0) === 0.22, 'combineInk(0,0,0) must be exactly the bloom coefficient, 0.22')

// sharp=1, halo=1, r=0: 0.80+0.70 = 1.5, clamped by min(1,...) before the exponent, then
// +0.22 bloom pushes it over 1 again — pins the final clamp to 1.
check(combineInk(1, 1, 0) === 1, 'combineInk(1,1,0) must saturate to exactly 1')

// sharp=1, halo=1, r=1.5: well outside the frame (edge fade uses r/1.02), so the fade
// factor is exactly 0 and multiplies everything else away — pins the edge-fade term.
check(combineInk(1, 1, 1.5) === 0, 'combineInk at r=1.5 (outside the frame) must be exactly 0')

// sharp weighted at 0.80 vs halo at 0.70 — same magnitude input, sharp must win. Values
// chosen (0.6) to stay below the ink=1 clamp on both sides, so this isolates the
// coefficients rather than two saturated results.
check(
  combineInk(0.6, 0, 0) > combineInk(0, 0.6, 0),
  'sharp must be weighted more heavily than halo (0.80 vs 0.70)',
)

// The **0.85 exponent: for 0 < x < 1, x**0.85 > x (pulls values up toward 1). Without the
// exponent, combineInk(0.5,0,0) would be exactly 0.4 + 0.22 = 0.62. Asserting a bound
// clearly above 0.62 fails if the exponent is dropped or changed to 1; the upper bound
// keeps it from silently regressing to something much larger.
{
  const v = combineInk(0.5, 0, 0)
  check(v > 0.63, `combineInk(0.5,0,0) = ${v} must exceed the no-exponent value of 0.62 — the **0.85 exponent must be applied`)
  check(v < 0.74, `combineInk(0.5,0,0) = ${v} is implausibly high for the **0.85 exponent`)
}

// The iris bloom decays with radius (exp(-(r*4)^2)) — must be much smaller away from centre.
check(combineInk(0, 0, 0.5) < combineInk(0, 0, 0), 'the iris bloom must decay with radius, not stay flat')

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
