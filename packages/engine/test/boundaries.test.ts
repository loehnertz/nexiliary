import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const src = join(import.meta.dirname, '..', 'src')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return sourceFiles(full)
    return full.endsWith('.ts') ? [full] : []
  })
}

/**
 * The zero-dependency rule is what lets the deferred desktop companion reuse this
 * package verbatim, and it is the kind of thing that erodes by one convenient import.
 * If adding a deferred feature ever requires touching `engine`, a boundary was drawn
 * wrong; these tests are the tripwire.
 */
describe('engine boundaries', () => {
  const files = sourceFiles(src)

  it('has no runtime dependencies at all', () => {
    const pkg = JSON.parse(readFileSync(join(src, '..', 'package.json'), 'utf8')) as Record<string, unknown>
    expect(pkg.dependencies).toBeUndefined()
    expect(pkg.peerDependencies).toBeUndefined()
  })

  it('imports nothing outside itself, including from packages/maps', () => {
    for (const file of files) {
      for (const match of readFileSync(file, 'utf8').matchAll(/from\s+'([^']+)'/g)) {
        const specifier = match[1]!
        expect(specifier.startsWith('.'), `${file} imports ${specifier}`).toBe(true)
      }
    }
  })

  it('never reads a clock', () => {
    // Time enters as a parameter and never as `Date.now()`. This is what lets the test
    // suite be table-driven and the offline tool reuse the projection.
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} reads a clock`).not.toMatch(/Date\.now|performance\.now|new Date\(/)
    }
  })

  it('does no I/O and knows nothing about the UI', () => {
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      expect(source, `${file} touches the browser`).not.toMatch(
        /\b(window|document|localStorage|fetch|navigator)\b\s*[.[(]/,
      )
    }
  })
})
