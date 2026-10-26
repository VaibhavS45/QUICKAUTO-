import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createFeatureProps } from '../../src/renderer/shell/FeatureHost.js'
import { RunDetailPage, ArtifactGlyph, formatArtifactBytes } from '../../src/renderer/features/automations/AutomationsView.js'
import type { ShellApi } from '../../src/renderer/contracts/feature.js'
import type { RunRecord } from '../../src/shared/contracts/schedule.js'
import type { RunArtifact } from '../../src/shared/contracts/artifacts.js'

const shell: ShellApi = {
  navigate: () => {},
  openCalendarWindow: () => {},
  openSettings: () => {},
  notify: () => {},
  updatesList: async () => ({ ok: true, logs: [], nextCursor: undefined }),
  updatesStream: async () => ({ ok: true }),
  onUpdatesChanged: () => () => {},
  getRunLog: async () => ({ ok: true, log: undefined })
}

const runs = [
  { id: 'run-1', routineId: 'a1', title: 'nightly sync', kind: 'routine', status: 'succeeded', startedAt: 1000, endedAt: 2000, summary: 'Synced 12 rows.' },
  { id: 'run-2', routineId: 'a1', title: 'nightly sync', kind: 'routine', status: 'failed', startedAt: 3000, endedAt: 4000, summary: 'Timed out.' }
] as unknown as RunRecord[]

const artifacts: RunArtifact[] = [
  { id: 'art-1', runId: 'run-1', name: 'report.pdf', mime: 'application/pdf', size: 420_000, createdAt: 10 },
  { id: 'art-2', runId: 'run-1', name: 'chart.png', mime: 'image/png', size: 128_000, createdAt: 11 }
]

const baseProps = {
  run: runs[0]!,
  artifacts,
  previews: {},
  artifactStatus: {},
  thread: null,
  onBack: () => {},
  onDownload: () => {},
  onOpenChat: () => {}
}

describe('run detail plumbing', () => {
  it('passes focusRunId through to the feature', () => {
    const props = createFeatureProps(shell, { focusRunId: 'run-1' })
    expect(props.focusRunId).toBe('run-1')
  })

  it('ignores non-string focusRunId', () => {
    expect(createFeatureProps(shell, { focusRunId: 7 }).focusRunId).toBe(undefined)
  })
})

describe('RunDetailPage', () => {
  it('renders a single centered column with one status chip and no runs rail', () => {
    const html = renderToStaticMarkup(createElement(RunDetailPage, baseProps))
    expect(html).toContain('rv-page')
    expect(html).toContain('rv-header')
    expect(html).toContain('rv-title')
    expect(html).toContain('Synced 12 rows.')
    expect(html).toContain('Took 1s')
    expect(html).toContain('Automation')
    expect((html.match(/rv-chip/g) ?? []).length).toBe(1)
    expect((html.match(/succeeded/gi) ?? []).length).toBe(1)
    expect(html).toContain('← Back')
    expect(html).not.toContain('automations-run-rail')
    expect(html).not.toContain('automations-detail-body')
    expect(html).not.toContain('automations-status')
    expect(html).not.toContain('Runs <small')
  })

  it('renders a result card per artifact with a download button', () => {
    const html = renderToStaticMarkup(createElement(RunDetailPage, baseProps))
    expect(html).toContain('report.pdf')
    expect(html).toContain('chart.png')
    expect(html).toContain('410.2 KB')
    expect(html).toContain('image/png')
    expect(html.match(/run-artifact-card/g)).toHaveLength(2)
    expect(html.match(/run-artifact-download/g)).toHaveLength(2)
  })

  it('renders no Results section when the run produced no files', () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, { ...baseProps, artifacts: [] })
    )
    expect(html).not.toContain('run-results')
    expect(html).not.toContain('did not produce any files')
  })

  it('shows the saved state after a completed download', () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, { ...baseProps, artifactStatus: { 'art-1': 'saved' } })
    )
    expect(html).toContain('Saved')
  })

  it('shows a download error on the card', () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, { ...baseProps, artifactStatus: { 'art-1': 'Downloads folder is read-only.' } })
    )
    expect(html).toContain('Downloads folder is read-only.')
  })

  it('uses the image thumbnail preview when one is loaded', () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, { ...baseProps, previews: { 'art-2': 'data:image/png;base64,AAA=' } })
    )
    expect(html).toContain('<img src="data:image/png;base64,AAA="')
  })

  it('links to the chat thread that produced the run', () => {
    const onOpenChat = vi.fn()
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, {
        ...baseProps,
        run: { ...runs[0], chatId: 'chat-9' } as RunRecord,
        thread: { id: 'chat-9', title: 'Weekly digest', createdAt: 0, updatedAt: 5, messages: [{ role: 'assistant', text: 'Here you go.', createdAt: 4 }] },
        onOpenChat
      })
    )
    expect(html).toContain('Weekly digest')
    expect(html).toContain('From chat · 1 message')
    expect(html).toContain('Open chat')
    onOpenChat('chat-9')
    expect(onOpenChat).toHaveBeenCalledWith('chat-9')
  })

  it('renders fenced code and markdown as structure, not raw text', () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, {
        ...baseProps,
        run: {
          ...runs[0],
          summary: '## Digest\nPlain **bold** line with `inline`.\n\n```js\nconsole.log(\'hello\')\n```'
        } as RunRecord
      })
    )
    expect(html).toContain('rv-md')
    expect(html).toContain('rv-inline-code')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('aria-label="Copy code"')
    expect(html).toContain('>js</span>')
    expect(html).toContain('Copy all')
    expect(html).toContain('rv-code')
    expect(html).toContain('console.log')
    expect(html).not.toContain('```')
    expect(html).not.toContain('**')
  })

  it('shows a calm empty state when the run recorded no output', () => {
    const html = renderToStaticMarkup(
      createElement(RunDetailPage, {
        ...baseProps,
        run: { ...runs[0], summary: undefined } as RunRecord,
        artifacts: []
      })
    )
    expect(html).toContain('rv-empty')
    expect(html).toContain('No output recorded yet. This run finished without returning any text.')
    expect(html).toContain('Copy all')
  })
})

describe('artifact helpers', () => {
  it('formats byte sizes', () => {
    expect(formatArtifactBytes(512)).toBe('512 B')
    expect(formatArtifactBytes(42_000)).toBe('41 KB')
    expect(formatArtifactBytes(2_300_000)).toBe('2.2 MB')
  })

  it('picks a glyph per mime kind', () => {
    expect(renderToStaticMarkup(createElement(ArtifactGlyph, { mime: 'application/pdf' }))).toContain('M9.4 15.2')
    expect(renderToStaticMarkup(createElement(ArtifactGlyph, { mime: 'image/png' }))).toContain('<circle')
    expect(renderToStaticMarkup(createElement(ArtifactGlyph, { mime: 'application/octet-stream' }))).toContain('M12 10.6')
  })
})
