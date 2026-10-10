import { EventEmitter } from 'node:events'
import { describe, expect, it } from 'vitest'
import { installStdioGuard } from '../../src/main/agent/stdio-guard.js'

function epipe(): Error {
  return Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })
}

describe('installStdioGuard', () => {
  it('swallows EPIPE stream errors', () => {
    const s = new EventEmitter()
    installStdioGuard([s])
    expect(() => s.emit('error', epipe())).not.toThrow()
  })

  it('rethrows non-EPIPE stream errors', () => {
    const s = new EventEmitter()
    installStdioGuard([s])
    expect(() => s.emit('error', new Error('boom'))).toThrow('boom')
  })

  it('uninstall removes the listener', () => {
    const s = new EventEmitter()
    const uninstall = installStdioGuard([s])
    uninstall()
    expect(s.listenerCount('error')).toBe(0)
  })
})
