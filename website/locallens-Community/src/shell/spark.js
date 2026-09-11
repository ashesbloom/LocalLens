// Sparkline geometry, and the deterministic dither field that stands in for one when there
// is no history yet. Pure functions over plain numbers — no JSX, no React, no browser API —
// so this file runs under plain `node` for spark.test.mjs, the same constraint commands.js
// and keys.js keep.

// A tile needs at least two real readings before a line means anything. One point is a dot
// with no trend, and zero points is nothing at all; both fall back to the dither band, which
// is the whole reason this returns an empty list rather than a degenerate path.
export const MIN_POINTS = 2

// Splits `values` into the runs of consecutive real readings, carrying each value's index on
// the shared day axis so a run that starts on day 9 is drawn at day 9 rather than at the
// left edge.
//
// null means "we did not look that day" and is what breaks a run. This is the honest half of
// the whole feature: joining across a gap would draw a straight line through days nobody
// recorded, which reads exactly like a measured flat trend.
export function runs(values) {
  const out = []
  let current = null
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v === null || v === undefined || !Number.isFinite(v)) {
      current = null
      continue
    }
    if (!current) {
      current = []
      out.push(current)
    }
    current.push({ i, v })
  }
  return out
}

// Turns a series into polyline point runs inside a `width` x `height` box.
//
// The scale spans the whole series, not each run, so two runs either side of a gap stay
// comparable — rescaling per run would make a quiet stretch and a busy one look identical.
// x is positioned on the day axis (index / (length - 1)), so a gap leaves a real horizontal
// hole rather than closing up.
export function sparkPoints(values, width, height, pad = 2) {
  const list = Array.isArray(values) ? values : []
  const real = list.filter((v) => v !== null && v !== undefined && Number.isFinite(v))
  if (real.length < MIN_POINTS || list.length < MIN_POINTS) return []

  const min = Math.min(...real)
  const max = Math.max(...real)
  const span = max - min

  const top = pad
  const usable = Math.max(0, height - pad * 2)
  const lastIndex = list.length - 1

  return runs(list).map((run) =>
    run.map(({ i, v }) => ({
      x: (i / lastIndex) * width,
      // A flat series has no range to normalise against. Pinning it to the middle says
      // "steady" honestly; dividing by zero would say NaN, and putting it at the bottom
      // would say "zero", which is a different claim.
      y: span === 0 ? top + usable / 2 : top + usable - ((v - min) / span) * usable,
    })),
  )
}

// `points` attribute text for one run. Rounded to 0.01 so the markup does not carry
// seventeen digits of float noise per point.
export function polylinePoints(run) {
  return run.map((p) => `${round(p.x)},${round(p.y)}`).join(' ')
}

function round(n) {
  return Math.round(n * 100) / 100
}

// The very last real reading, which is where the sparkline puts its dot. Null when there is
// nothing to mark.
export function lastPoint(runList) {
  const last = runList[runList.length - 1]
  return last && last.length > 0 ? last[last.length - 1] : null
}

// ── the dither band ────────────────────────────────────────────────────────────────
// What a tile shows instead of a line while it has no history. The same halftone language
// as the home page lens, flattened into a strip: radius swells and fades along the band so
// it reads as a field rather than as a ruler of evenly-sized dots.
//
// Deliberately a closed-form function of the index and nothing else — no randomness, no
// time. React re-renders this on every stats refresh, and a field seeded from Math.random
// would reshuffle itself each time, which reads as a glitch rather than as texture.
export function ditherDots(count, width, height) {
  const dots = []
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1)
    // Two out-of-phase waves, so the swell never settles into a visible repeat across the
    // handful of cycles a 28px band has room for.
    const wave = 0.5 + 0.5 * Math.sin(t * Math.PI * 3.1 - 1.2)
    const detail = 0.5 + 0.5 * Math.sin(t * Math.PI * 7.7 + 0.6)
    const ink = Math.min(1, 0.34 + wave * 0.52 + detail * 0.22)
    dots.push({
      cx: round(width * t),
      cy: round(height / 2 + (detail - 0.5) * height * 0.34),
      r: round(Math.max(0.5, ink * 2.1)),
      // Dimmer dots are also more transparent, which is what keeps the band reading as
      // halftone rather than as a row of hard pucks.
      o: round(Math.min(1, 0.22 + ink * 0.62)),
    })
  }
  return dots
}
