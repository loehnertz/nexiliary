import { describe, expect, it } from 'vitest'
import { KEEPALIVE_VIDEO } from '../src/services/wake-lock.js'

/**
 * The fallback exists for exactly the case where Wake Lock is unavailable, which
 * includes any plain-HTTP address — a phone on the LAN pointed at a dev server. It
 * failed silently once: a plausible-looking base64 string decoded to something with no
 * `moov` box, `play()` rejected, the rejection was swallowed, and the screen slept
 * mid-match with nothing to say why.
 *
 * A test cannot play video, but it can assert the bytes are a real MP4 rather than a
 * string that looks like one.
 */
describe('the wake lock fallback video', () => {
  const bytes = Uint8Array.from(atob(KEEPALIVE_VIDEO.split(',')[1]!), (c) => c.charCodeAt(0))

  function boxes(): { type: string; size: number }[] {
    const out: { type: string; size: number }[] = []
    const view = new DataView(bytes.buffer)
    let offset = 0
    while (offset + 8 <= bytes.length) {
      const size = view.getUint32(offset)
      const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
      out.push({ type, size })
      if (size < 8) break
      offset += size
    }
    return out
  }

  it('is a structurally complete MP4', () => {
    const walked = boxes()
    expect(walked[0]?.type).toBe('ftyp')
    // Every box must fit inside the file: the broken version declared an `mdat` of 701
    // bytes inside a 213 byte file and nothing noticed.
    expect(walked.reduce((sum, b) => sum + b.size, 0)).toBe(bytes.length)
  })

  it('carries a moov box, without which no browser can play it', () => {
    expect(boxes().map((b) => b.type)).toContain('moov')
  })

  it('is small enough to inline without hurting a cold load on a phone', () => {
    expect(bytes.length).toBeLessThan(8 * 1024)
  })
})
