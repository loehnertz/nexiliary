import { useEffect, useState } from 'react'

/**
 * Recomputed from the wall clock on every tick rather than incremented, so a throttled
 * or skipped tick self-corrects instead of falling permanently behind.
 */
export function useWallClock(intervalMillis = 250, running = true): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!running) return
    setNow(Date.now())
    const id = window.setInterval(() => setNow(Date.now()), intervalMillis)
    return () => window.clearInterval(id)
  }, [intervalMillis, running])
  return now
}
