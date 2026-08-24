import { useLayoutEffect, useRef } from 'react'
import gsap from 'gsap'
import lensSrc from './lens-source.png'
import { CELLS, REF_CELL, combineInk, passesBayer, dotRadius, colorTier, driftOffset } from './dither.js'

// How far the focus wave spreads outward from the iris (in normalised radius units) before
// every cell has caught up — see `localT` below. Not specified by the brief, a judgment call.
const STAGGER_SPREAD = 0.55
// Period of the idle "breathing" wobble, in seconds (gsap.ticker time is seconds, not ms).
const BREATHE_PERIOD = 7
const BREATHE_AMOUNT = 0.12

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
  const timelineRef = useRef(null)
  const drawRef = useRef(null)

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

    function draw(now) {
      const ctx = ctxRef.current
      const cells = cellsRef.current
      const colors = colorsRef.current
      const size = sizeRef.current
      if (!ctx || !cells || !colors || !size) return
      const { px, cellPx, scale } = size
      ctx.fillStyle = colors.voidHex
      ctx.fillRect(0, 0, px, px)

      const { progress, irisBloom } = animState.current
      const breathe = reducedMotionRef.current ? 1 : 1 + BREATHE_AMOUNT * Math.sin((now * 2 * Math.PI) / BREATHE_PERIOD)

      for (const cell of cells) {
        const { x, y, ink, tier, rad, ox, oy } = cell
        const localT = clamp(progress * (1 + STAGGER_SPREAD) - rad * STAGGER_SPREAD, 0, 1)

        const focusX = x * cellPx + cellPx / 2
        const focusY = y * cellPx + cellPx / 2
        const driftX = focusX + ox * scale * breathe
        const driftY = focusY + oy * scale * breathe
        const cx = lerp(driftX, focusX, localT)
        const cy = lerp(driftY, focusY, localT)

        const bloomBoost = irisBloom * Math.exp(-((rad * 6) ** 2)) * 0.5
        const baseR = (dotRadius(ink) + bloomBoost) * scale
        const r = lerp(baseR * 0.82, baseR, localT)

        const driftColor = rad > 0.3 ? colors.dim : colors[tier]
        ctx.fillStyle = lerpColor(driftColor, colors[tier], localT)

        ctx.beginPath()
        ctx.arc(cx, cy, Math.max(0.4, r), 0, Math.PI * 2)
        ctx.fill()
      }
    }
    drawRef.current = draw

    function drawOnce() {
      measure()
      draw(gsap.ticker.time)
    }

    function updateRunning() {
      const should = readyRef.current && !reducedMotionRef.current && intersectingRef.current && pageVisibleRef.current
      if (should && !runningRef.current) {
        runningRef.current = true
        gsap.ticker.add(draw)
      } else if (!should && runningRef.current) {
        runningRef.current = false
        gsap.ticker.remove(draw)
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
      if (!runningRef.current) draw(gsap.ticker.time) // keep it correct while paused
    })
    ro.observe(canvas)

    return () => {
      cancelled = true
      mm.revert()
      io.disconnect()
      ro.disconnect()
      document.removeEventListener('visibilitychange', onVisibilityChange)
      gsap.ticker.remove(draw)
      timelineRef.current?.kill()
    }
  }, [])

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

  return (
    <canvas
      ref={canvasRef}
      className="lens-canvas"
      role="img"
      aria-label="The LocalLens mark, rendered as green phosphor grain. Press Enter or click to bring it into focus."
      tabIndex={0}
      onClick={triggerFocus}
      onKeyDown={onKeyDown}
    />
  )
}
