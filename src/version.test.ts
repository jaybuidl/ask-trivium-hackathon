import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VERSION } from './version.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

describe('VERSION', () => {
  /**
   * The check that makes a hand-copied constant safe to hand-copy. `npm version` edits
   * `package.json` and nothing else, so without this the next release ships a CLI that reports the
   * previous one — silently, since a wrong version breaks nothing at runtime.
   */
  it('agrees with package.json', () => {
    const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(VERSION).toBe(pkg.version)
  })
})
