import { describe, expect, it } from 'vitest'
import { defaultHotkey, parseMentionedTools, toPaletteSubmit } from '../../src/shared/types.js'

describe('parseMentionedTools', () => {
  it('finds single and chained tools', () => {
    expect(parseMentionedTools('@gmail check inbox')).toEqual(['gmail'])
    expect(parseMentionedTools('@websearch news and @notion save it')).toEqual([
      'websearch',
      'notion'
    ])
  })

  it('resolves aliases @email and @sheet', () => {
    expect(parseMentionedTools('@email hello')).toEqual(['gmail'])
    expect(parseMentionedTools('@sheet update Q3')).toEqual(['sheets'])
  })

  it('dedupes and ignores unknown mentions', () => {
    expect(parseMentionedTools('@gmail @gmail @frobnicate hi')).toEqual(['gmail'])
  })

  it('returns empty when no tools mentioned', () => {
    expect(parseMentionedTools('just some text')).toEqual([])
  })
})

describe('toPaletteSubmit', () => {
  it('keeps text and extracted tools together', () => {
    const s = toPaletteSubmit('@calendar buy milk Friday')
    expect(s.tools).toEqual(['calendar'])
    expect(s.text).toContain('buy milk')
  })
})

describe('defaultHotkey', () => {
  it('avoids Spotlight conflict on macOS', () => {
    expect(defaultHotkey('darwin')).toBe('Alt+Space')
  })

  it('uses Ctrl+Space elsewhere', () => {
    expect(defaultHotkey('linux')).toBe('Ctrl+Space')
    expect(defaultHotkey('win32')).toBe('Ctrl+Space')
  })
})
