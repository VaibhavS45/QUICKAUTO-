import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  appGetPath: vi.fn(() => '/app'),
  existsSync: vi.fn()
}))

vi.mock('electron', () => ({ app: { getAppPath: mocks.appGetPath } }))
vi.mock('node:fs', () => ({ existsSync: mocks.existsSync }))

import { preloadPath } from '../../src/main/preload-path.js'

describe('preloadPath', () => {
  afterEach(() => {
    vi.resetAllMocks()
  })

  it('prefers the adjacent CJS preload bundle', () => {
    mocks.existsSync.mockImplementation((path: string) => path.endsWith('/src/preload/index.cjs'))
    const found = preloadPath()
    expect(found).toMatch(/\/src\/preload\/index\.cjs$/)
    expect(mocks.existsSync).toHaveBeenCalledTimes(1)
  })

  it('falls back to the app root preload bundle', () => {
    mocks.existsSync.mockImplementation((path: string) => path === '/app/preload/index.cjs')
    expect(preloadPath()).toBe('/app/preload/index.cjs')
    expect(mocks.existsSync).toHaveBeenCalledTimes(2)
  })
})
