import { describe, expect, it } from 'vitest'
import { activeMention, defaultHotkey, parseMentionedTools, toPaletteSubmit } from '../../src/shared/types.js'

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

  it('ignores email addresses and inline @handles', () => {
    expect(parseMentionedTools('me@example.com')).toEqual([])
    expect(parseMentionedTools('mail me@gmail.com today')).toEqual([])
    expect(parseMentionedTools('contact user@notion.io for details')).toEqual([])
    // A mention wrapped in punctuation but separated by space still counts.
    expect(parseMentionedTools('(see @gmail) for the thread')).toEqual(['gmail'])
    // A real mention after whitespace still counts, even next to an email.
    expect(parseMentionedTools('me@gmail.com and @gmail the thread')).toEqual(['gmail'])
    expect(toPaletteSubmit('write to me@example.com').tools).toEqual([])
  })
})

describe('activeMention', () => {
  it('opens autocomplete for a real @mention', () => {
    expect(activeMention('@gm', 3)).toEqual({ start: 0, typed: 'gm' })
    expect(activeMention('hi @cal', 7)).toEqual({ start: 3, typed: 'cal' })
    expect(activeMention('@', 1)).toEqual({ start: 0, typed: '' })
  })

  it('never opens for email addresses', () => {
    expect(activeMention('me@example.com', 14)).toBeNull()
    expect(activeMention('mail me@gmail.com', 17)).toBeNull()
    expect(activeMention('a@b', 3)).toBeNull()
  })

  it('is null without a trailing @fragment', () => {
    expect(activeMention('just text', 9)).toBeNull()
    expect(activeMention('@gmail done', 11)).toBeNull()
    expect(activeMention('@gmail done @', 13)).toEqual({ start: 12, typed: '' })
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
