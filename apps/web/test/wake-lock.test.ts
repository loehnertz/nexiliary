import { afterEach, describe, expect, it } from 'vitest'
import { releaseWakeLock, requestWakeLock, wakeLockStatus } from '../src/services/wake-lock.js'

interface MockSentinel {
  release(): Promise<void>
  addEventListener(type: 'release', listener: () => void): void
}

function installDeferredWakeLockApi(): (sentinel: MockSentinel) => void {
  let resolveRequest: (sentinel: MockSentinel) => void
  const pending = new Promise<MockSentinel>((resolve) => {
    resolveRequest = resolve
  })
  ;(navigator as unknown as { wakeLock?: unknown }).wakeLock = { request: (_: 'screen') => pending }
  return (sentinel) => resolveRequest(sentinel)
}

function mockSentinel(onRelease: () => void): MockSentinel {
  return {
    release: () => {
      onRelease()
      return Promise.resolve()
    },
    addEventListener: () => undefined,
  }
}

afterEach(() => {
  releaseWakeLock()
  delete (navigator as unknown as { wakeLock?: unknown }).wakeLock
})

describe('wake lock acquire/release race', () => {
  it('releases a lock that resolves after the match already ended, instead of adopting it', async () => {
    // A `requestWakeLock()` racing a `releaseWakeLock()` before the browser responds must
    // not leave the screen held forever: the pending request has to notice `wanted` went
    // false and hand the sentinel straight back.
    const resolveRequest = installDeferredWakeLockApi()
    requestWakeLock()
    releaseWakeLock()
    expect(wakeLockStatus()).toBe('off')

    let released = false
    resolveRequest(mockSentinel(() => (released = true)))
    // Let the pending microtasks (the awaited request, then the status update) settle.
    await Promise.resolve()
    await Promise.resolve()

    expect(released).toBe(true)
    expect(wakeLockStatus()).toBe('off')
  })
})
