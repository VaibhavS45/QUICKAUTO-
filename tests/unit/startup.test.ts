import { describe, expect, it } from 'vitest'
import { wantsToggle, coldStartVisibility } from '../../src/shared/startup.js'

describe('wantsToggle', () => {
  it('matches --toggle', () => {
    expect(wantsToggle(['electron', 'app', '--toggle'])).toBe(true)
  })

  it('keeps the legacy "palette --toggle" form', () => {
    expect(wantsToggle(['palette --toggle'])).toBe(true)
  })

  it('is false for plain launches', () => {
    expect(wantsToggle(['electron', 'app'])).toBe(false)
    expect(wantsToggle([])).toBe(false)
  })
})

describe('coldStartVisibility', () => {
  it('shows the palette on a --toggle cold start (hotkey must never do nothing)', () => {
    expect(coldStartVisibility(['quickauto', '--toggle'])).toBe('show')
  })

  it('stays hidden (tray only) on autostart launches', () => {
    expect(coldStartVisibility(['quickauto'])).toBe('hidden')
    expect(coldStartVisibility([])).toBe('hidden')
  })
})
