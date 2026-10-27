import { describe, expect, it } from 'vitest'
import {
  attachmentPromptText,
  baseName,
  driveIdOf,
  driveRef,
  fileExtension,
  localRef,
  mergeAttachments,
  needsComposioTools,
  type AttachedFile
} from '../../src/renderer/lib/attachments.js'

describe('baseName', () => {
  it('takes the last path segment on POSIX and Windows', () => {
    expect(baseName('/home/u/report final.txt')).toBe('report final.txt')
    expect(baseName('C:\\Users\\vaibhav\\notes.md')).toBe('notes.md')
  })

  describe('fileExtension', () => {
    it('returns a compact uppercase file type label', () => {
      expect(fileExtension('report.pdf')).toBe('PDF')
      expect(fileExtension('/tmp/README')).toBe('FILE')
      expect(fileExtension('archive.tar.gz')).toBe('GZ')
    })
  })
})

describe('refs', () => {
  it('locals keep their path, drive files use the drive: prefix', () => {
    expect(localRef('/tmp/a.txt')).toBe('/tmp/a.txt')
    expect(driveRef('abc123')).toBe('drive:abc123')
    expect(driveIdOf('drive:abc123')).toBe('abc123')
    expect(driveIdOf('/tmp/a.txt')).toBeNull()
    expect(driveIdOf('drive:../escape')).toBeNull()
  })
})

describe('mergeAttachments', () => {
  it('ignores exact duplicates so the same file cannot be attached twice', () => {
    const prev: AttachedFile[] = [
      { ref: '/tmp/a.txt', name: 'a.txt', kind: 'local' },
      { ref: 'drive:xyz', name: 'Doc', kind: 'drive', driveId: 'xyz' }
    ]
    const merged = mergeAttachments(prev, [
      { ref: '/tmp/a.txt', name: 'a.txt', kind: 'local' },
      { ref: 'drive:xyz', name: 'Doc', kind: 'drive', driveId: 'xyz' }
    ])
    expect(merged).toHaveLength(2)
  })

  it('treats references case-insensitively as the same file', () => {
    const merged = mergeAttachments(
      [{ ref: '/Tmp/A.TXT', name: 'a.txt', kind: 'local' }],
      [{ ref: '/tmp/a.txt', name: 'a.txt', kind: 'local' }]
    )
    expect(merged).toHaveLength(1)
  })

  it('keeps distinct files', () => {
    const merged = mergeAttachments(
      [{ ref: '/tmp/a.txt', name: 'a.txt', kind: 'local' }],
      [
        { ref: '/tmp/b.txt', name: 'b.txt', kind: 'local' },
        { ref: 'drive:q1', name: 'Spec', kind: 'drive', driveId: 'q1' }
      ]
    )
    expect(merged.map((f) => f.ref)).toEqual(['/tmp/a.txt', '/tmp/b.txt', 'drive:q1'])
  })
})

describe('attachmentPromptText', () => {
  it('formats local files as @path references', () => {
    expect(attachmentPromptText([{ ref: '/tmp/a.txt', name: 'a.txt', kind: 'local' }])).toBe('@/tmp/a.txt')
  })

  it('formats drive files with a readable name + fileId for the read tool', () => {
    expect(
      attachmentPromptText([{ ref: 'drive:f1', name: 'Q3 Sheet', kind: 'drive', driveId: 'f1' }])
    ).toBe('Google Drive file "Q3 Sheet" (fileId: f1)')
  })

  it('reaches the agent with both kinds and ignores empty lists', () => {
    expect(attachmentPromptText([])).toBe('')
    expect(
      attachmentPromptText([
        { ref: '/tmp/a.txt', name: 'a.txt', kind: 'local' },
        { ref: 'drive:f1', name: 'Doc', kind: 'drive', driveId: 'f1' }
      ])
    ).toBe('@/tmp/a.txt Google Drive file "Doc" (fileId: f1)')
  })
})

describe('needsComposioTools', () => {
  it('is true only when a drive file is attached', () => {
    expect(needsComposioTools([{ ref: '/tmp/a.txt', name: 'a', kind: 'local' }])).toBe(false)
    expect(needsComposioTools([{ ref: 'drive:f', name: 'a', kind: 'drive', driveId: 'f' }])).toBe(true)
  })
})
