import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('frozen calendar boundary', () => {
  it('keeps calendar renderer and window implementation identical to main', () => {
    const paths = execFileSync('git', [
      'ls-tree',
      '-r',
      '--name-only',
      'main',
      '--',
      'src/renderer/calendar',
      'src/main/calendar-window.ts'
    ], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
    for (const path of paths) {
      const current = readFileSync(path)
      const baseline = execFileSync('git', ['show', `main:${path}`])
      expect(current.equals(baseline), `${path} changed from main`).toBe(true)
    }
  })
})
