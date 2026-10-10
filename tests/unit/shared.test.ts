import { describe, expect, it } from 'vitest'
import { activeMention, parseMentionedTools, TOOL_IDS, TOOL_META } from '../../src/shared/types.js'

describe('tool catalog', () => {
  it('does not expose the removed calendar view as a selectable tool', () => {
    expect(TOOL_IDS).not.toContain('calendar')
    expect(Object.keys(TOOL_META)).not.toContain('calendar')
  })
})

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
