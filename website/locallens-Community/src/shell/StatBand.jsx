import { ditherDots, lastPoint, polylinePoints, sparkPoints } from './spark.js'

// The 28px strip at the foot of every stats tile. Two shapes, one footprint:
//
//   a sparkline, when at least two real readings exist
//   a dither band, when they do not
//
// Same box and the same left-to-right reveal either way, so a tile with no history yet reads
// as "nothing recorded here yet" rather than as a different kind of tile. Three of the four
// metrics start on the band and upgrade themselves to a line once the snapshots table has
// collected a couple of days; nothing here needs changing when they do.
const W = 240
const H = 28
const DOTS = 34

// The reveal is CSS, not GSAP. This output is transient -- it appears when someone types
// `stats` and goes on the next command -- so a running ticker would be machinery for
// decoration. keys.css carries the keyframes, and both shapes share one duration so the line
// and the field read as the same gesture.
const SWEEP_MS = 620

export default function StatBand({ values, label }) {
  const runs = sparkPoints(values, W, H, 3)

  if (runs.length === 0) {
    const dots = ditherDots(DOTS, W, H)
    return (
      <svg className="stat-band" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {dots.map((d, i) => (
          <circle
            key={i}
            className="stat-dot"
            cx={d.cx}
            cy={d.cy}
            r={d.r}
            fill="var(--phos-dim)"
            fillOpacity={d.o}
            // Staggered left to right across the same window the line takes to draw.
            style={{ animationDelay: `${Math.round((i / DOTS) * SWEEP_MS)}ms` }}
          />
        ))}
      </svg>
    )
  }

  const tip = lastPoint(runs)
  return (
    <svg
      className="stat-band"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="img"
      aria-label={`${label} over the last 30 days`}
    >
      {runs.map((run, i) => (
        // One polyline per unbroken run. A gap is a genuine hole: joining across it would
        // draw a straight line through days nobody recorded and read as a measured trend.
        <polyline
          key={i}
          className="stat-line"
          points={polylinePoints(run)}
          fill="none"
          stroke="var(--phos)"
          strokeWidth="1.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="100"
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {tip ? <circle className="stat-tip" cx={tip.x} cy={tip.y} r="2.1" fill="var(--phos-soft)" /> : null}
    </svg>
  )
}
