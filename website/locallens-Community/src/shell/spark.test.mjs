// Plain node:assert check for the sparkline geometry. Run via `node src/shell/spark.test.mjs`.
//
// What matters here is the gap: a series with a missing day must draw as two runs, because a
// single run joined across it would render a straight line through days nobody recorded and
// read as a measured flat trend.
import assert from 'node:assert/strict'
import { MIN_POINTS, runs, sparkPoints, polylinePoints, lastPoint, ditherDots } from './spark.js'

let checks = 0
function check(cond, msg) {
  assert.ok(cond, msg)
  checks++
}

// --- runs: what breaks a line ------------------------------------------------------
check(runs([1, 2, 3]).length === 1, 'an unbroken series is one run')
check(runs([1, null, 3]).length === 2, 'a null splits the series in two')
check(runs([null, null]).length === 0, 'all-null is no runs at all')
check(runs([]).length === 0, 'an empty series is no runs')
check(runs([1, null, 3])[1][0].i === 2, 'a run after a gap remembers its real day index')
// 0 is a reading, not a gap -- a day with no visitors genuinely had zero.
check(runs([0, 0, 0]).length === 1, 'zero is a value, never a break')
// NaN/undefined would otherwise reach the SVG as "NaN,NaN" and silently kill the polyline.
check(runs([1, NaN, 3]).length === 2, 'NaN breaks a run rather than poisoning the path')
check(runs([1, undefined, 3]).length === 2, 'so does undefined')

// --- too little history falls back to the band --------------------------------------
check(MIN_POINTS === 2, 'two readings is the floor for a line')
check(sparkPoints([], 100, 28).length === 0, 'no data draws no line')
check(sparkPoints([5], 100, 28).length === 0, 'one reading is a dot with no trend, not a line')
check(sparkPoints([5, null], 100, 28).length === 0, 'one real reading beside a gap is still not a line')
check(sparkPoints(null, 100, 28).length === 0, 'a missing series is handled, not thrown on')
check(sparkPoints([1, 2], 100, 28).length === 1, 'two readings are enough')

// --- geometry ------------------------------------------------------------------------
{
  const [run] = sparkPoints([0, 10], 100, 28, 2)
  check(run[0].x === 0 && run[1].x === 100, 'x spans the full width')
  check(run[0].y > run[1].y, 'a rising series goes UP the screen, not down')
  check(Math.abs(run[1].y - 2) < 0.001, 'the maximum sits at the top pad')
  check(Math.abs(run[0].y - 26) < 0.001, 'and the minimum at the bottom pad')
}
{
  // The scale must span the whole series, not each run, or a quiet stretch and a busy one
  // would look identical either side of a gap.
  const [a, b] = sparkPoints([0, 1, null, 9, 10], 100, 28, 2)
  check(a[1].y > b[0].y, 'both runs share one scale across the gap')
  check(b[0].x === 75, 'the run after the gap starts at its own day, leaving a real hole')
}
{
  const [run] = sparkPoints([7, 7, 7], 100, 28, 2)
  check(run.every((p) => Math.abs(p.y - 14) < 0.001), 'a flat series pins to the middle, never NaN')
  check(run.every((p) => Number.isFinite(p.y)), 'and every point is a real number')
}

// --- serialisation ---------------------------------------------------------------------
{
  const [run] = sparkPoints([0, 10], 100, 28, 2)
  const text = polylinePoints(run)
  check(/^[\d., ]+$/.test(text), 'points serialise to digits, commas and spaces only')
  check(!text.includes('NaN'), 'and never carry NaN into the markup')
  check(text.split(' ').length === 2, 'one pair per point')
}
// The dot marks the last REAL reading, so a trailing gap must pull it back rather than
// leaving it floating at the right edge over a day nobody recorded.
check(lastPoint(sparkPoints([1, 2, 9], 100, 28)).x === 100, 'the dot sits on the latest reading, at the right edge')
check(lastPoint(sparkPoints([1, 2, null], 100, 28)).x === 50, 'a trailing gap pulls the dot back to the last real day')
check(lastPoint([]) === null, 'with nothing to mark, there is no dot')

// --- the dither band ---------------------------------------------------------------------
{
  const a = ditherDots(24, 120, 28)
  const b = ditherDots(24, 120, 28)
  check(a.length === 24, 'the band has the dots it was asked for')
  check(JSON.stringify(a) === JSON.stringify(b), 'the field is deterministic — it must not reshuffle on re-render')
  check(a.every((d) => d.r > 0), 'every dot has a positive radius')
  check(a.every((d) => d.o > 0 && d.o <= 1), 'and an opacity inside range')
  check(a.every((d) => d.cx >= 0 && d.cx <= 120), 'no dot escapes the band horizontally')
  check(a.every((d) => d.cy >= 0 && d.cy <= 28), 'nor vertically')
  check(new Set(a.map((d) => d.r)).size > 3, 'radii actually vary — a row of equal dots is a ruler, not halftone')
  check(ditherDots(1, 120, 28).length === 1, 'a one-dot band does not divide by zero')
  check(ditherDots(0, 120, 28).length === 0, 'and an empty one is empty')
}

console.log(`ok — spark.test.mjs (${checks} checks)`)
