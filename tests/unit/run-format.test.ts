import { describe, expect, it } from 'vitest'
import {
  formatDuration, parseBlocks, parseInline, previewText, statusLabel, statusTone
} from '../../src/renderer/features/automations/run-format.js'

const SAMPLE = [
  'Here is the code for printing Hello World:', '',
  '**Python** (`hello.py`):', '```python', 'print("Hello World")', '```', 'Run with: `python3 hello.py`', '',
  '- one', '- two', '1. first'
].join('\n')

describe('parseBlocks', () => {
  it('splits prose, fenced code, and lists', () => {
    const blocks = parseBlocks(SAMPLE)
    expect(blocks.map((b) => b.kind)).toEqual(['paragraph', 'paragraph', 'code', 'paragraph', 'list', 'list'])
    expect(blocks[2]).toEqual({ kind: 'code', lang: 'python', code: 'print("Hello World")' })
    expect(blocks[4]).toEqual({ kind: 'list', ordered: false, items: ['one', 'two'] })
    expect(blocks[5]).toEqual({ kind: 'list', ordered: true, items: ['first'] })
  })
  it('handles headings and an unclosed fence', () => {
    expect(parseBlocks('## Title')[0]).toEqual({ kind: 'heading', level: 2, text: 'Title' })
    expect(parseBlocks('```js\nlet a = 1')[0]).toEqual({ kind: 'code', lang: 'js', code: 'let a = 1' })
  })
  it('returns nothing for empty input', () => {
    expect(parseBlocks('')).toEqual([])
  })
})

describe('parseInline', () => {
  it('finds code and bold, leaves HTML as plain text', () => {
    expect(parseInline('a **b** `c` <b>d</b>')).toEqual([
      { kind: 'text', text: 'a ' }, { kind: 'bold', text: 'b' }, { kind: 'text', text: ' ' },
      { kind: 'code', text: 'c' }, { kind: 'text', text: ' <b>d</b>' }
    ])
  })
})

describe('previewText', () => {
  it('strips markdown noise into one readable line', () => {
    const preview = previewText(SAMPLE)
    expect(preview).not.toContain('`')
    expect(preview).not.toContain('**')
    expect(preview).toContain('print("Hello World")')
  })
  it('truncates with an ellipsis', () => {
    expect(previewText('word '.repeat(100), 50).endsWith('…')).toBe(true)
  })
})

describe('run metadata', () => {
  it('formats durations', () => {
    expect(formatDuration(0, 500)).toBe('<1s')
    expect(formatDuration(0, 12_000)).toBe('12s')
    expect(formatDuration(0, 64_000)).toBe('1m 4s')
    expect(formatDuration(0)).toBe('')
  })
  it('maps statuses', () => {
    expect(statusTone('succeeded')).toBe('ok')
    expect(statusTone('failed')).toBe('bad')
    expect(statusLabel('waiting-approval')).toBe('Waiting approval')
  })
})
