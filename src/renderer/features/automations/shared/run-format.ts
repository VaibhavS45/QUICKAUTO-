/** Pure helpers for the Updates feed + run detail page (no React, no Electron). */

export type MdBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; lang: string; code: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'paragraph'; text: string }

const FENCE = /^\s*```\s*([\w+#.-]*)\s*$/
const HEADING = /^(#{1,3})\s+(.*)$/
const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/

/** Small, safe markdown subset: fenced code, headings, lists, paragraphs. */
export function parseBlocks(source: string): MdBlock[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: MdBlock[] = []
  let para: string[] = []
  const flush = (): void => {
    if (para.length) blocks.push({ kind: 'paragraph', text: para.join('\n') })
    para = []
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? ''
    const fence = FENCE.exec(line)
    if (fence) {
      flush()
      const code: string[] = []
      i++
      while (i < lines.length && !FENCE.test(lines[i] ?? '')) code.push(lines[i++] ?? '')
      blocks.push({ kind: 'code', lang: fence[1] ?? '', code: code.join('\n').replace(/\s+$/, '') })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', level: (heading[1]?.length ?? 1) as 1 | 2 | 3, text: heading[2] ?? '' })
      continue
    }
    const bullet = BULLET.exec(line)
    const numbered = bullet ? null : NUMBERED.exec(line)
    const item = bullet ?? numbered
    if (item) {
      flush()
      const ordered = numbered !== null
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item[1] ?? '')
      else blocks.push({ kind: 'list', ordered, items: [item[1] ?? ''] })
      continue
    }
    if (line.trim() === '') flush()
    else para.push(line)
  }
  flush()
  return blocks
}

export type InlinePart = { kind: 'text' | 'code' | 'bold'; text: string }

/** `code` and **bold** only; everything else stays plain text (no HTML ever). */
export function parseInline(text: string): InlinePart[] {
  return text
    .split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/)
    .filter(Boolean)
    .map((part): InlinePart =>
      part.startsWith('`') && part.endsWith('`') && part.length > 2
        ? { kind: 'code', text: part.slice(1, -1) }
        : part.startsWith('**') && part.endsWith('**') && part.length > 4
          ? { kind: 'bold', text: part.slice(2, -2) }
          : { kind: 'text', text: part })
}

/** Plain one-paragraph preview for feed cards: no backticks, hashes or bullets. */
export function previewText(source: string, max = 220): string {
  const flat = parseBlocks(source)
    .map((b) => {
      if (b.kind === 'code') return b.code
      if (b.kind === 'list') return b.items.join(' · ')
      return b.text
    })
    .join(' ')
    .replace(/`|\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat
}

export function formatDuration(startedAt: number, endedAt?: number): string {
  if (endedAt === undefined || endedAt < startedAt) return ''
  if (endedAt - startedAt < 1000) return '<1s'
  const s = Math.round((endedAt - startedAt) / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m ${s % 60}s` : `${Math.floor(m / 60)}h ${m % 60}m`
}

export type RunTone = 'ok' | 'bad' | 'live' | 'idle'

export function statusTone(status: string): RunTone {
  if (status === 'succeeded') return 'ok'
  if (status === 'failed') return 'bad'
  if (status === 'running' || status === 'waiting-approval') return 'live'
  return 'idle'
}

export function statusLabel(status: string): string {
  const text = status.replaceAll('_', ' ').replaceAll('-', ' ')
  return text.charAt(0).toUpperCase() + text.slice(1)
}
