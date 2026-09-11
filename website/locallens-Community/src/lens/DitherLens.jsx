import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import lensSrc from './lens-source.png'
import { CELLS, REF_CELL, FOCUS_CELLS, combineInk, passesBayer, dotRadius, colorTier, driftOffset, focusFalloff } from './dither.js'

// How far the focus wave spreads outward from the iris (in normalised radius units) before
// every cell has caught up — see `localT` below. Not specified by the brief, a judgment call.
// Only the keyboard path uses this now; the pointer lens is local and has no wave to stagger.
const STAGGER_SPREAD = 0.55
// How quickly the lens fades in under the cursor and back out when it leaves. Out is slower
// than in: arriving should feel immediate, leaving should feel like the grain settling.
const HOVER_IN = 0.28
const HOVER_OUT = 0.55
// How hard the lens chases the cursor, per frame. Below 1 it trails slightly, which reads as
// glass with weight rather than as a spotlight welded to the pointer.
const TRACK = 0.3
// Period of the idle "breathing" wobble, in seconds (gsap.ticker time is seconds, not ms).
const BREATHE_PERIOD = 7
const BREATHE_AMOUNT = 0.12
// A slow breathing drift doesn't need display-rate redraws — capping it is what gets p95
// frame time under the 30fps budget on a throttled mid-range phone (task-3-report.md,
// Finding 1 fix #2). The focus tween and the ~6s decay back to drift are excluded from this
// cap: that's fast, visible motion where full rate matters. Value tuned against measurement
// — see the report for what was tried and why this one.
const IDLE_FRAME_INTERVAL = 1 / 24 // seconds — gsap.ticker time is seconds, not ms

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
const lerp = (a, b, t) => a + (b - a) * t

function hexToRgb(hex) {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function lerpColor(a, b, t) {
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`
}

function rgbString([r, g, b]) {
  return `rgb(${r},${g},${b})`
}

// Cells never change ink/tier/rad after the field is built, but the RGB they resolve to
// depends on the (also fixed-once-read) CSS tokens — so this precomputes, once, everything
// draw()'s idle fast path needs: the fixed "at rest" radius (`r0`) and colour (`driftStr`,
// plus the arrays `driftArr`/`tierArr` the transition path still needs to lerp between).
// Sorting by that fixed colour groups same-coloured cells contiguously, so the idle path
// below can batch a whole run into one Path2D + one fill() call instead of one fill() per
// cell — see the perf fix in task-3-report.md (Finding 1: idle drift was ~26fps under 6x
// CPU throttle at 390px because this exact per-cell fillStyle/lerp ran unconditionally,
// every frame, even though at rest nothing about it was actually changing frame to frame).
function prepareCellColors(cells, colors) {
  for (const cell of cells) {
    cell.r0 = dotRadius(cell.ink)
    cell.tierArr = colors[cell.tier]
    cell.driftArr = cell.rad > 0.3 ? colors.dim : cell.tierArr
    cell.driftStr = rgbString(cell.driftArr)
  }
  cells.sort((a, b) => (a.driftStr < b.driftStr ? -1 : a.driftStr > b.driftStr ? 1 : 0))
}

// Reads the actual token values rather than re-hardcoding hexes that could drift from
// tokens.css.
function readColors() {
  const style = getComputedStyle(document.documentElement)
  const get = (name) => style.getPropertyValue(name).trim()
  return {
    phos: hexToRgb(get('--phos')),
    mid: hexToRgb(get('--phos-mid')),
    dim: hexToRgb(get('--phos-dim')),
    voidHex: get('--void'),
  }
}

// Builds the ink field once per mount, then keeps only the cells that ever draw (most of a
// 132x132 grid is background and never clears the Bayer threshold — precomputing this list
// once means the per-frame render loop below only walks the cells that actually paint,
// instead of tweening or re-testing all ~17k of them every frame).
function buildActiveCells(img) {
  const iw = img.naturalWidth
  const ih = img.naturalHeight

  // 1. Composite the source (dark strokes on transparency) onto white.
  const flat = document.createElement('canvas')
  flat.width = iw
  flat.height = ih
  const flatCtx = flat.getContext('2d')
  flatCtx.fillStyle = '#fff'
  flatCtx.fillRect(0, 0, iw, ih)
  flatCtx.drawImage(img, 0, 0)
  const { data } = flatCtx.getImageData(0, 0, iw, ih)

  // 2. Find the artwork's bounding box (any non-white pixel).
  let minX = iw
  let minY = ih
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < ih; y++) {
    for (let x = 0; x < iw; x++) {
      const i = (y * iw + x) * 4
      const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (luma < 254.5) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < minX) {
    minX = 0
    minY = 0
    maxX = iw - 1
    maxY = ih - 1
  }
  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const m = Math.round(Math.max(bw, bh) * 0.06)
  // dither.py resizes its padded rect to a square sized off the *cropped* width, squashing
  // height to match — replicated here rather than using max(bw, bh), so a non-square bbox
  // behaves identically to the reference.
  const finalSize = bw + 2 * m

  const rectW = bw + 2 * m
  const rectH = bh + 2 * m
  const rect = document.createElement('canvas')
  rect.width = rectW
  rect.height = rectH
  const rectCtx = rect.getContext('2d')
  rectCtx.fillStyle = '#fff'
  rectCtx.fillRect(0, 0, rectW, rectH)
  rectCtx.drawImage(flat, minX, minY, bw, bh, m, m, bw, bh)

  const square = document.createElement('canvas')
  square.width = finalSize
  square.height = finalSize
  const squareCtx = square.getContext('2d')
  squareCtx.imageSmoothingQuality = 'high'
  squareCtx.drawImage(rect, 0, 0, rectW, rectH, 0, 0, finalSize, finalSize)

  // 3. Sharp sample: direct downscale to CELLS x CELLS.
  const sharpCanvas = document.createElement('canvas')
  sharpCanvas.width = CELLS
  sharpCanvas.height = CELLS
  const sharpCtx = sharpCanvas.getContext('2d')
  sharpCtx.imageSmoothingQuality = 'high'
  sharpCtx.drawImage(square, 0, 0, finalSize, finalSize, 0, 0, CELLS, CELLS)
  const sharpData = sharpCtx.getImageData(0, 0, CELLS, CELLS).data

  // 4. Halo sample: blur (radius == std-dev, same semantics as PIL's GaussianBlur) then
  // downscale. Line art has only two tones — this halo is what creates the halftone
  // gradation between them.
  const blurRadius = (finalSize / CELLS) * 2.4
  const blurred = document.createElement('canvas')
  blurred.width = finalSize
  blurred.height = finalSize
  const blurredCtx = blurred.getContext('2d')
  blurredCtx.filter = `blur(${blurRadius}px)`
  blurredCtx.drawImage(square, 0, 0)
  const haloCanvas = document.createElement('canvas')
  haloCanvas.width = CELLS
  haloCanvas.height = CELLS
  const haloCtx = haloCanvas.getContext('2d')
  haloCtx.imageSmoothingQuality = 'high'
  haloCtx.drawImage(blurred, 0, 0, finalSize, finalSize, 0, 0, CELLS, CELLS)
  const haloData = haloCtx.getImageData(0, 0, CELLS, CELLS).data

  // 5. Combine into the ink field, keep only cells that will ever draw.
  const c = (CELLS - 1) / 2
  const halfExtent = CELLS / 2
  const active = []
  for (let y = 0; y < CELLS; y++) {
    for (let x = 0; x < CELLS; x++) {
      const idx = (y * CELLS + x) * 4
      const sharpLuma = 0.299 * sharpData[idx] + 0.587 * sharpData[idx + 1] + 0.114 * sharpData[idx + 2]
      const haloLuma = 0.299 * haloData[idx] + 0.587 * haloData[idx + 1] + 0.114 * haloData[idx + 2]
      const sharpVal = 1 - sharpLuma / 255
      const haloVal = 1 - haloLuma / 255
      const r = Math.hypot(x - c, y - c) / halfExtent
      const ink = combineInk(sharpVal, haloVal, r)
      if (!passesBayer(ink, x, y)) continue
      const { ox, oy, rad } = driftOffset(x - c, y - c, halfExtent)
      active.push({ x, y, ink, tier: colorTier(ink), rad, ox, oy })
    }
  }
  return active
}

// The LocalLens mark as green phosphor halftone grain: at rest, cells drift off-position on
// a slow radial sine; a click or Enter/Space pulls them into focus, staggered outward from
// the iris, and the drift creeps back in over the following seconds.
export default function DitherLens() {
  const canvasRef = useRef(null)
  const ctxRef = useRef(null)
  const cellsRef = useRef(null)
  const colorsRef = useRef(null)
  const sizeRef = useRef(null)
  const readyRef = useRef(false)
  const reducedMotionRef = useRef(false)
  const intersectingRef = useRef(true)
  const pageVisibleRef = useRef(true)
  const runningRef = useRef(false)
  const animState = useRef({ progress: 0, irisBloom: 0 })
  // The pointer lens. `gx`/`gy` are the drawn position in grid cells and `tx`/`ty` the raw
  // cursor, so draw() can ease one toward the other; `presence` is tweened 0..1 so the lens
  // fades rather than popping. A ref, never state — this changes on every pointermove and a
  // re-render per mouse pixel would be absurd.
  const hoverRef = useRef({ gx: CELLS / 2, gy: CELLS / 2, tx: CELLS / 2, ty: CELLS / 2, presence: 0, seen: false })
  const timelineRef = useRef(null)
  const hoverTweenRef = useRef(null)
  const lastIdleDrawRef = useRef(-Infinity)

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    ctxRef.current = canvas.getContext('2d')

    function measure() {
      const rect = canvas.getBoundingClientRect()
      const cssSize = Math.max(1, Math.round(rect.width))
      const dpr = Math.min(2, window.devicePixelRatio || 1) // a 3x phone rendering 132x132
      // cells every frame is wasted work — cap it.
      const px = Math.round(cssSize * dpr)
      if (canvas.width !== px || canvas.height !== px) {
        canvas.width = px
        canvas.height = px
      }
      sizeRef.current = { px, cellPx: px / CELLS, scale: px / CELLS / REF_CELL }
    }

    function draw(now, force = false) {
      const ctx = ctxRef.current
      const cells = cellsRef.current
      const colors = colorsRef.current
      const size = sizeRef.current
      if (!ctx || !cells || !colors || !size) return

      const { progress, irisBloom } = animState.current
      const hover = hoverRef.current

      // Ease the drawn lens position toward the raw cursor. Done here rather than in the
      // pointermove handler so it is frame-paced: a mouse can emit far more events per second
      // than there are frames, and easing per event would make the trail speed depend on the
      // pointing device.
      hover.gx += (hover.tx - hover.gx) * TRACK
      hover.gy += (hover.ty - hover.gy) * TRACK

      const hovering = hover.presence > 0
      const idle = progress <= 0 && irisBloom <= 0 && !hovering

      // Idle drift is a slow breathing wobble — it doesn't need a redraw every display
      // frame. Skip the tick entirely (not even touching the canvas) unless the cap
      // interval has elapsed or the caller forced a one-off repaint (initial paint, or a
      // resize while the ticker loop is paused). Not throttled while focusing in or
      // decaying back to drift — that fast motion is where full rate is actually visible.
      if (idle && !force && now - lastIdleDrawRef.current < IDLE_FRAME_INTERVAL) return
      if (idle) lastIdleDrawRef.current = now

      const { px, cellPx, scale } = size
      ctx.fillStyle = colors.voidHex
      ctx.fillRect(0, 0, px, px)

      const breathe = reducedMotionRef.current ? 1 : 1 + BREATHE_AMOUNT * Math.sin((now * 2 * Math.PI) / BREATHE_PERIOD)

      // Idle fast path: at rest (progress <= 0) every cell's localT is exactly 0, so
      // position/radius/colour all collapse to their precomputed "drift" values — nothing
      // about them changes frame to frame. Skips the per-cell lerp entirely and batches
      // each colour run (cells are pre-sorted by driftStr) into one Path2D + one fill()
      // call instead of one fill() per cell. This is the loop the perf review profiled.
      if (idle) {
        let curColor = null
        let path = null
        for (const cell of cells) {
          if (cell.driftStr !== curColor) {
            if (path) ctx.fill(path)
            curColor = cell.driftStr
            ctx.fillStyle = curColor
            path = new Path2D()
          }
          const { x, y, r0, ox, oy } = cell
          const cx = x * cellPx + cellPx / 2 + ox * scale * breathe
          const cy = y * cellPx + cellPx / 2 + oy * scale * breathe
          const r = Math.max(0.4, r0 * scale * 0.82)
          path.moveTo(cx + r, cy)
          path.arc(cx, cy, r, 0, Math.PI * 2)
        }
        if (path) ctx.fill(path)
        return
      }

      // Hover path: the lens is local, so most of the field is still exactly at drift and
      // must not pay for a per-cell lerp. Cells outside the lens keep the batched Path2D
      // treatment above; only the few hundred the lens actually touches take the slow path.
      // This is what keeps a continuous hover about as cheap as sitting idle — without the
      // split, moving the mouse would drag all ~4,300 cells onto the per-cell path on every
      // frame, which is the exact cost the earlier perf work removed.
      //
      // `progress <= 0` guards it: once the keyboard focus wave is running, every cell is
      // moving and the full path below is the correct one.
      if (hovering && progress <= 0) {
        const { gx, gy, presence } = hover
        let curColor = null
        let path = null
        for (const cell of cells) {
          // focusFalloff returns EXACTLY 0 past its radius, which is what makes this test
          // reliable rather than a threshold guess.
          if (focusFalloff(cell.x - gx, cell.y - gy) > 0) continue
          if (cell.driftStr !== curColor) {
            if (path) ctx.fill(path)
            curColor = cell.driftStr
            ctx.fillStyle = curColor
            path = new Path2D()
          }
          const { x, y, r0, ox, oy } = cell
          const cx = x * cellPx + cellPx / 2 + ox * scale * breathe
          const cy = y * cellPx + cellPx / 2 + oy * scale * breathe
          const r = Math.max(0.4, r0 * scale * 0.82)
          path.moveTo(cx + r, cy)
          path.arc(cx, cy, r, 0, Math.PI * 2)
        }
        if (path) ctx.fill(path)

        for (const cell of cells) {
          const localT = focusFalloff(cell.x - gx, cell.y - gy) * presence
          if (localT <= 0) continue
          const { x, y, ox, oy, r0, tierArr, driftArr } = cell
          const focusX = x * cellPx + cellPx / 2
          const focusY = y * cellPx + cellPx / 2
          const cx = lerp(focusX + ox * scale * breathe, focusX, localT)
          const cy = lerp(focusY + oy * scale * breathe, focusY, localT)
          const baseR = r0 * scale
          ctx.fillStyle = lerpColor(driftArr, tierArr, localT)
          ctx.beginPath()
          ctx.arc(cx, cy, Math.max(0.4, lerp(baseR * 0.82, baseR, localT)), 0, Math.PI * 2)
          ctx.fill()
        }
        return
      }

      // Transition path (the keyboard focus wave, or the drift creeping back over ~6s):
      // colour, position and radius all genuinely blend per cell here, so this keeps the full
      // per-cell lerp.
      for (const cell of cells) {
        const { x, y, rad, ox, oy, r0, tierArr, driftArr } = cell
        const localT = clamp(progress * (1 + STAGGER_SPREAD) - rad * STAGGER_SPREAD, 0, 1)

        const focusX = x * cellPx + cellPx / 2
        const focusY = y * cellPx + cellPx / 2
        const driftX = focusX + ox * scale * breathe
        const driftY = focusY + oy * scale * breathe
        const cx = lerp(driftX, focusX, localT)
        const cy = lerp(driftY, focusY, localT)

        const bloomBoost = irisBloom * Math.exp(-((rad * 6) ** 2)) * 0.5
        const baseR = (r0 + bloomBoost) * scale
        const r = lerp(baseR * 0.82, baseR, localT)

        ctx.fillStyle = lerpColor(driftArr, tierArr, localT)

        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(0.4, r), 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // gsap.ticker invokes its listeners as (time, deltaTime, frame) — registering `draw`
    // directly would land `deltaTime` in `draw`'s `force` parameter (always a truthy
    // number), permanently defeating the idle throttle above. This one-arg wrapper is what
    // actually goes on the ticker; direct calls elsewhere pass `force` explicitly.
    function onTick(time) {
      draw(time)
    }

    function drawOnce() {
      measure()
      draw(gsap.ticker.time, true) // force: bypass the idle cap for a deliberate one-off paint
    }

    function updateRunning() {
      const should = readyRef.current && !reducedMotionRef.current && intersectingRef.current && pageVisibleRef.current
      if (should && !runningRef.current) {
        runningRef.current = true
        gsap.ticker.add(onTick)
      } else if (!should && runningRef.current) {
        runningRef.current = false
        gsap.ticker.remove(onTick)
      }
    }

    // --- reduced motion: render permanently in focus, no drift, no rAF loop at all ---
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: reduce)', () => {
      reducedMotionRef.current = true
      animState.current.progress = 1
      animState.current.irisBloom = 0
      updateRunning()
      if (readyRef.current) drawOnce()
    })
    mm.add('(prefers-reduced-motion: no-preference)', () => {
      reducedMotionRef.current = false
      updateRunning()
    })

    // --- load the source art and build the (static) ink field once ---
    let cancelled = false
    const img = new Image()
    img.decoding = 'async'
    img.onload = () => {
      if (cancelled) return
      cellsRef.current = buildActiveCells(img)
      colorsRef.current = readColors()
      prepareCellColors(cellsRef.current, colorsRef.current)
      readyRef.current = true
      drawOnce()
      updateRunning()
    }
    img.src = lensSrc

    // --- pause off-screen and when the tab is hidden ---
    const io = new IntersectionObserver(
      ([entry]) => {
        intersectingRef.current = entry.isIntersecting
        updateRunning()
      },
      { threshold: 0.01 },
    )
    io.observe(canvas)

    function onVisibilityChange() {
      pageVisibleRef.current = document.visibilityState === 'visible'
      updateRunning()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    const ro = new ResizeObserver(() => {
      if (!readyRef.current) return
      measure()
      if (!runningRef.current) draw(gsap.ticker.time, true) // keep it correct while paused
    })
    ro.observe(canvas)

    return () => {
      cancelled = true
      mm.revert()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      gsap.ticker.remove(onTick)
      timelineRef.current?.kill()
    }
  }, [])

  // The whole-mark focus wave. No longer reachable by pointer — the lens below replaced that
  // — but kept as the keyboard equivalent: hover is not available without a pointer, and
  // removing this outright would leave keyboard users with no way to see the mark at all.
  function triggerFocus() {
    if (reducedMotionRef.current || !readyRef.current) return
    const state = animState.current
    timelineRef.current?.kill()
    const tl = gsap.timeline()
    tl.to(state, { progress: 1, duration: 0.9, ease: 'power3.out' }, 0)
    tl.to(state, { irisBloom: 1, duration: 0.18, ease: 'power1.out' }, 0)
    tl.to(state, { irisBloom: 0, duration: 0.5, ease: 'power1.in' }, 0.18)
    tl.to(state, { progress: 0, duration: 6, ease: 'sine.inOut' }, '+=0.4')
    timelineRef.current = tl
  }

  function onKeyDown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return
    e.preventDefault()
    triggerFocus()
  }

  // Cursor position in grid cells. Reading the rect per move is what keeps this correct
  // through a resize or a page scroll without listening for either.
  function trackPointer(e) {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    const hover = hoverRef.current
    hover.tx = ((e.clientX - rect.left) / rect.width) * CELLS
    hover.ty = ((e.clientY - rect.top) / rect.height) * CELLS
    // First contact: put the drawn position exactly under the cursor rather than letting it
    // slide in from wherever the lens was last left, which would read as a stray comet.
    if (!hover.seen) {
      hover.gx = hover.tx
      hover.gy = hover.ty
      hover.seen = true
    }
  }

  function setPresence(to) {
    if (reducedMotionRef.current || !readyRef.current) return
    hoverTweenRef.current?.kill()
    hoverTweenRef.current = gsap.to(hoverRef.current, {
      presence: to,
      duration: to > 0 ? HOVER_IN : HOVER_OUT,
      ease: to > 0 ? 'power2.out' : 'power2.inOut',
      // Once the lens is fully gone the field is back at drift, and `seen` resets so the
      // next approach lands under the cursor instead of trailing in from the last exit.
      onComplete: () => {
        if (to === 0) hoverRef.current.seen = false
      },
    })
  }

  function onPointerEnter(e) {
    trackPointer(e)
    setPresence(1)
  }

  function onPointerMove(e) {
    const hover = hoverRef.current
    trackPointer(e)
    // A pointer can arrive without an enter event (the cursor already sitting over the canvas
    // when the page loads, for one), so move engages the lens too rather than only updating
    // a position nobody is showing.
    if (hover.presence <= 0) setPresence(1)
  }

  function onPointerLeave() {
    setPresence(0)
  }

  return (
    <canvas
      ref={canvasRef}
      className="lens-canvas"
      role="img"
      aria-label="The LocalLens mark, rendered as green phosphor grain. Move the pointer over it to focus what is under the cursor, or press Enter to bring the whole mark into focus."
      tabIndex={0}
      onPointerEnter={onPointerEnter}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      // A touch that turns into a page scroll fires cancel, not leave. Without this the lens
      // would stay lit under a finger that is no longer there.
      onPointerCancel={onPointerLeave}
      onKeyDown={onKeyDown}
    />
  )
}
