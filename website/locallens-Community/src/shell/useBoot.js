import { useEffect, useState } from 'react'
import { APP_VERSION } from '../data/version.js'

const FLAG = 'll-booted'
const STEP_MS = 225 // 4 lines * 225ms = 900ms total, per the brief
const LINES = ['LocalLens Community', `v${APP_VERSION}`, 'AGPL-3.0 · agent BUSL-1.1', 'ready']

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
}

function alreadyBooted() {
  try {
    return sessionStorage.getItem(FLAG) === '1'
  } catch {
    return false // e.g. storage blocked — fail open to "not booted" rather than throw
  }
}

// First-visit-per-session boot sequence: prints LINES one at a time, ~900ms total, then
// stays done for the rest of the browser session. Skipped entirely under reduced motion;
// any keypress or click skips whatever is left of it.
export function useBoot() {
  const [step, setStep] = useState(() => (reducedMotion() || alreadyBooted() ? LINES.length : 0))

  useEffect(() => {
    if (step >= LINES.length) {
      try {
        sessionStorage.setItem(FLAG, '1')
      } catch {
        // private-browsing or storage disabled — booting still completes, just isn't remembered
      }
      return
    }
    const timer = setTimeout(() => setStep((s) => s + 1), STEP_MS)
    const skip = () => setStep(LINES.length)
    window.addEventListener('keydown', skip)
    window.addEventListener('click', skip)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', skip)
      window.removeEventListener('click', skip)
    }
  }, [step])

  return { booting: step < LINES.length, lines: LINES.slice(0, step) }
}
