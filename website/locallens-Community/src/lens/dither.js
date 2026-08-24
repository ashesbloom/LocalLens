// Pure maths for the dithered lens — ported from design/dither.py. No DOM, no canvas: every
// export here takes numbers and returns numbers (or a plain string tag), so dither.test.mjs
// can run it under plain `node`. Image sampling (which needs a real <canvas>) lives in
// DitherLens.jsx, which imports the constants and functions below.

export const CELLS = 132
export const FLOOR = 0.07 // cells below this stay dark — without it the near-white ground
// leaks a regular grid of stray dots (a real bug in the first draft; see the brief).

// The radius/push formulas below were authored against dither.py's fixed CELL = 5px grid.
// The site's canvas is responsive, so DitherLens.jsx scales every value this module returns
// by (actualCellPx / REF_CELL) rather than re-deriving the constants for each render size.
export const REF_CELL = 5

export const BAYER = [
  [0, 32, 8, 40, 2, 34, 10, 42],
  [48, 16, 56, 24, 50, 18, 58, 26],
  [12, 44, 4, 36, 14, 46, 6, 38],
  [60, 28, 52, 20, 62, 30, 54, 22],
  [3, 35, 11, 43, 1, 33, 9, 41],
  [51, 19, 59, 27, 49, 17, 57, 25],
  [15, 47, 7, 39, 13, 45, 5, 37],
  [63, 31, 55, 23, 61, 29, 53, 21],
]

// Combines a sharp ink sample and a blurred ("halo") sample into one 0..1 ink value, adds
// the iris bloom at the centre, then fades the frame edge. `r` is the normalised distance
// from centre (0 at the middle, ~1 at the frame edge).
export function combineInk(sharp, halo, r) {
  let ink = Math.min(1, 0.8 * sharp + 0.7 * halo) ** 0.85
  ink += 0.22 * Math.exp(-((r * 4.0) ** 2)) // iris bloom
  ink *= Math.max(0, 1 - (r / 1.02) ** 6) // fade the frame edges
  return Math.max(0, Math.min(1, ink))
}

// Bayer 8x8 ordered-dither test, gated by FLOOR. A cell draws only when its ink clears both
// the floor and its own threshold cell in the repeating 8x8 matrix.
export function passesBayer(ink, x, y) {
  if (ink < FLOOR) return false
  const threshold = (BAYER[y % 8][x % 8] / 64) * 0.55
  return ink > threshold
}

// Halftone dot radius (reference px, see REF_CELL above) — grows with ink, never a flat
// 1-bit dot.
export function dotRadius(ink) {
  return 0.6 + ink * 1.7
}

// Which token colour a cell's ink maps to. DitherLens.jsx resolves these tags to the actual
// --phos / --phos-mid / --phos-dim custom-property values — never hard-coded hexes here.
export function colorTier(ink) {
  if (ink > 0.66) return 'phos'
  if (ink > 0.34) return 'mid'
  return 'dim'
}

// The "at rest" push: cells are shoved outward from the iris along a radial sine, giving
// the unfocused grain its drift. `dx`/`dy` are grid-cell offsets from the centre cell;
// `halfExtent` is CELLS / 2. Returns the offset in reference px (see REF_CELL) plus the
// normalised radius, since callers (both the renderer and the test) need `rad` too.
export function driftOffset(dx, dy, halfExtent) {
  // `|| 1e-6` mirrors dither.py's `... or 1e-6`: avoids a degenerate atan2(0, 0) at the
  // exact centre cell while still landing effectively at zero displacement there.
  const rad = Math.hypot(dx, dy) / halfExtent || 1e-6
  const angle = Math.atan2(dy, dx)
  const push = 7.0 * rad + 3.0 * Math.sin(angle * 3 + rad * 8)
  return { ox: Math.cos(angle) * push, oy: Math.sin(angle) * push, rad }
}
