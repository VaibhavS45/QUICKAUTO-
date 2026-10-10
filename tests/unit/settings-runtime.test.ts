import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

vi.mock('electron-store', () => ({
  default: class {
    private readonly values = new Map<string, unknown>()
    constructor(options?: { defaults?: Record<string, unknown> }) {
      for (const [key, value] of Object.entries(options?.defaults ?? {})) this.values.set(key, value)
    }
    get(key: string): unknown {
      return this.values.get(key)
    }
    set(key: string, value: unknown): void {
      this.values.set(key, value)
    }
  }
}))

import { createSettingsShellRuntime } from '../../src/main/shell/settings-runtime.js'

describe('settings shell runtime', () => {
  let directory = ''

  afterEach(async () => {
    if (directory) {
      await rm(directory, { recursive: true, force: true })
      directory = ''
    }
  })

  it('scans plugin.json manifests in userData/plugins and only publishes supported fields', async () => {
    directory = await mkdtemp(join(tmpdir(), 'palette-settings-runtime-'))
    const pluginDirectory = join(directory, 'plugins', 'sample')
    await mkdir(pluginDirectory, { recursive: true })
    await writeFile(join(pluginDirectory, 'plugin.json'), JSON.stringify({
      id: 'sample',
      name: 'Sample Plugin',
      version: '1.0.0',
      privateToken: 'must-not-reach-renderer'
    }))

    const runtime = createSettingsShellRuntime({
      encryptStringAsync: async (value) => Buffer.from(`encrypted:${value}`),
      decryptStringAsync: async (value) => Buffer.from(value).toString().replace(/^encrypted:/, '')
    })
    await runtime.loadPlugins(directory)

    expect(runtime.plugins.list()).toEqual([{
      id: 'sample',
      name: 'Sample Plugin',
      version: '1.0.0',
      enabled: false
    }])
    expect(JSON.stringify(runtime.plugins.list())).not.toContain('must-not-reach-renderer')
    await runtime.stopAll()
  })
})
