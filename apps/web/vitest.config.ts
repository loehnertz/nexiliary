import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // The web tests cover the reducer, the clock derivation and persistence, which are
    // the parts of `web` that carry logic. `jsdom` is here for `localStorage` alone.
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
  },
})
