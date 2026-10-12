// Run with: node src/components/spotlightPath.test.mjs
// Guards the two failures that matter: a hole that does not actually cut
// through (the overlay goes opaque and the app looks frozen), and a radius
// larger than the box, which folds the arcs into a bow tie.
import { strict as assert } from 'node:assert';
import { spotlightPath, clampRadius, capsuleRadius, placeTooltip, tooltipOrigin } from './spotlightPath.js';

const viewport = { width: 1280, height: 800 };
const rect = { x: 100, y: 60, width: 200, height: 44 };

const path = spotlightPath(rect, viewport, 8);

// Two subpaths, or evenodd has nothing to subtract and the screen stays dark.
assert.equal((path.match(/Z/g) || []).length, 2, 'path is not two closed subpaths');

// The outer subpath has to span the whole viewport, otherwise the dim layer
// stops short and the uncovered strip looks like a rendering bug.
assert.ok(path.includes('H 1280'), 'outer rect does not span viewport width');
assert.ok(path.includes('V 800'), 'outer rect does not span viewport height');

// The hole is placed where the caller asked.
assert.ok(path.includes(`M ${100 + 8} 60`), 'hole does not start at the target');

// Radius clamping.
assert.equal(clampRadius(8, 200, 44), 8, 'a valid radius was altered');
assert.equal(clampRadius(20, 12, 12), 6, 'an oversized radius was not clamped');
assert.equal(clampRadius(8, 0, 0), 0, 'a zero-size target did not clamp to 0');
assert.equal(clampRadius(-4, 200, 44), 0, 'a negative radius was not floored');

// A tiny target still produces a well-formed path rather than crossed arcs.
const tiny = spotlightPath({ x: 5, y: 5, width: 10, height: 10 }, viewport, 20);
assert.ok(!tiny.includes('NaN'), 'tiny target produced NaN coordinates');
assert.equal((tiny.match(/Z/g) || []).length, 2, 'tiny target lost a subpath');

// The capsule radius never exceeds the cap the tutorial relies on.
assert.equal(capsuleRadius(44), 20, 'capsule radius ignored the 20px cap');
assert.equal(capsuleRadius(24), 12, 'capsule radius did not follow height');

// No coordinate may come out undefined; that renders as an invisible overlay.
assert.ok(!path.includes('undefined'), 'path contains undefined coordinates');

// Card placement: below when there is room, above for a target near the
// bottom, and always on screen even when the target fills the viewport.
const tip = { width: 340, height: 180 };
assert.equal(placeTooltip(rect, tip, viewport), 'bottom', 'room below was ignored');
assert.equal(placeTooltip({ x: 100, y: 700, width: 200, height: 44 }, tip, viewport), 'top', 'card hung off the bottom');
assert.equal(placeTooltip({ x: 0, y: 0, width: 1280, height: 800 }, tip, viewport), 'bottom', 'no fallback for a full-screen target');
// A side in use is kept while it fits, so the card does not jump mid-scroll.
assert.equal(placeTooltip(rect, tip, viewport, 'right'), 'right', 'a fitting side was abandoned');
assert.equal(placeTooltip({ x: 100, y: 700, width: 200, height: 44 }, tip, viewport, 'bottom'), 'top', 'kept a side with no room');
const full = tooltipOrigin('bottom', { x: 0, y: 0, width: 1280, height: 800 }, tip, viewport);
assert.ok(full.top <= 800 - 180 - 16 && full.top >= 16, 'card left the screen vertically');
const edge = tooltipOrigin('bottom', { x: 1250, y: 60, width: 20, height: 20 }, tip, viewport);
assert.equal(edge.left, 1280 - 340 - 16, 'card left the screen horizontally');

console.log('spotlightPath: ok');
