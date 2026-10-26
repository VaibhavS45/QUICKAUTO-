import { describe, expect, it } from 'vitest'
import { extractArtifacts, sanitizeName, extensionFor } from '../../src/main/shell/artifact-detect.js'

describe('extractArtifacts', () => {
  it('finds a Composio download envelope with a filename and text content', () => {
    const artifacts = extractArtifacts('drive_export_file', {
      successful: true,
      error: null,
      data: {
        file_name: 'Quarterly report.pdf',
        downloaded_file_content: 'Q1 leakage: 12%. Q2: 5% fixes shipped.'
      }
    })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ name: 'Quarterly report.pdf', text: 'Q1 leakage: 12%. Q2: 5% fixes shipped.' })
  })

  it('reads base64 payloads paired with a mime type', () => {
    const base64 = Buffer.from('hello world').toString('base64')
    const artifacts = extractArtifacts('export_tool', {
      data: { file_name: 'sheet', mime_type: 'text/csv', base64 }
    })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ mime: 'text/csv', base64 })
  })

  it('accepts the short-lived s3url of a PDF export as an artifact', () => {
    const artifacts = extractArtifacts('drive_export_file', {
      data: { file_name: 'doc.pdf', downloaded_file_content: { s3url: 'https://s3.example.com/abc?sig=1', mimeType: 'application/pdf' } }
    })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ url: 'https://s3.example.com/abc?sig=1', mime: 'application/pdf' })
  })

  it('reads a data: URL string content', () => {
    const png = `data:image/png;base64,${Buffer.from('x'.repeat(40)).toString('base64')}`
    const artifacts = extractArtifacts('screenshot_tool', { data: { file_name: 'shot.png', file: png } })
    expect(artifacts).toHaveLength(1)
    expect(artifacts[0]).toMatchObject({ mime: 'image/png' })
  })

  it('ignores results without anything file-like', () => {
    expect(extractArtifacts('gmail_list', { data: { messages: ['a', 'b'] } })).toHaveLength(0)
    expect(extractArtifacts('echo', 'plain agent summary text')).toHaveLength(0)
    expect(extractArtifacts('open', { path: '/tmp/x', status: 'ok' })).toHaveLength(0)
  })

  it('does not treat bare web page links as file artifacts', () => {
    expect(extractArtifacts('browse', { data: { url: 'https://news.example.com/story' } })).toHaveLength(0)
  })

  it('caps the number of artifacts per result', () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      file_name: `f${i}.txt`,
      downloaded_file_content: `content ${i}`
    }))
    expect(extractArtifacts('multi', { data: { results: items } })).toHaveLength(5)
  })

  it('falls back to a tool-based name and extension', () => {
    const artifacts = extractArtifacts('pdf_export', { data: { base64: Buffer.from('abc').toString('base64').repeat(100) } })
    expect(artifacts[0]?.name).toBe('pdf_export-file-1.bin')
  })

  it('sanitises names, stripping paths and control characters', () => {
    expect(sanitizeName('/downloads/../../evil .. name?.pdf')).toBe('evil .. name.pdf')
    expect(sanitizeName('')).toBe('file')
  })

  it('maps mimes to extensions', () => {
    expect(extensionFor('application/pdf')).toBe('pdf')
    expect(extensionFor('application/x-unknown')).toBe('bin')
  })
})
