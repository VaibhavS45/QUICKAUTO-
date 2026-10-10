import Store from 'electron-store'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { IpcMain } from 'electron'
import { AgentStore, type AgentStoreStorage } from '../agent/agent-store.js'
import { McpRegistry, type McpRegistryStorage } from './mcp-registry.js'
import { McpSdkConnector } from './mcp-client.js'
import { McpConnectorProvider } from './mcp-provider.js'
import { SafeStorageMcpVault, type AsyncSafeStorage, type EncryptedSecretStore } from './mcp-vault.js'
import { PluginRegistry, type PluginStore } from './plugin-registry.js'
import { registerSettingsShellIpc } from './settings-ipc.js'

class ElectronKeyValueStore implements PluginStore, AgentStoreStorage, McpRegistryStorage, EncryptedSecretStore {
  constructor(private readonly store: Store<Record<string, unknown>>) {}

  get(key: string): unknown {
    return (this.store as unknown as { get: (k: string) => unknown }).get(key)
  }

  set(key: string, value: unknown): void {
    ;(this.store as unknown as { set: (k: string, v: unknown) => void }).set(key, value)
  }
}

export interface SettingsShellRuntime {
  readonly plugins: PluginRegistry
  readonly mcp: McpRegistry
  readonly agents: AgentStore
  readonly mcpProvider: McpConnectorProvider
  loadPlugins(userDataPath: string): Promise<void>
  registerIpc(ipc: IpcMain): void
  stopAll(): Promise<void>
}

export function createSettingsShellRuntime(safeStorage: AsyncSafeStorage): SettingsShellRuntime {
  const plugins = new PluginRegistry(new ElectronKeyValueStore(
    new Store<Record<string, unknown>>({ name: 'palette-plugins', defaults: {} })
  ))
  const agents = new AgentStore(new ElectronKeyValueStore(
    new Store<Record<string, unknown>>({ name: 'palette-agents', defaults: {} })
  ))
  const mcp = new McpRegistry(
    new ElectronKeyValueStore(new Store<Record<string, unknown>>({ name: 'palette-mcp', defaults: {} })),
    new SafeStorageMcpVault(
      new ElectronKeyValueStore(new Store<Record<string, unknown>>({ name: 'palette-mcp-secrets', defaults: {} })),
      safeStorage
    ),
    new McpSdkConnector()
  )

  return {
    plugins,
    mcp,
    agents,
    mcpProvider: new McpConnectorProvider(mcp),
    async loadPlugins(userDataPath) {
      const pluginsPath = join(userDataPath, 'plugins')
      let entries
      try {
        entries = await readdir(pluginsPath, { withFileTypes: true })
      } catch (error) {
        if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
          plugins.load([])
          return
        }
        console.error('Could not scan installed plugins.', error)
        plugins.load([])
        return
      }
      const manifests: unknown[] = []
      for (const entry of entries) {
        if (!entry.isDirectory()) continue
        try {
          manifests.push(JSON.parse(await readFile(join(pluginsPath, entry.name, 'plugin.json'), 'utf8')) as unknown)
        } catch (error) {
          if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
            console.warn(`Could not read plugin manifest in "${entry.name}".`, error)
            manifests.push(null)
          }
        }
      }
      const result = plugins.load(manifests)
      if (result.rejected > 0) console.warn(`Rejected ${result.rejected} invalid or duplicate plugin manifest(s).`)
    },
    registerIpc: (ipc) => registerSettingsShellIpc(ipc, plugins, mcp, agents),
    stopAll: async () => {
      await Promise.all(mcp.list().map((server) => mcp.stop(server.id)))
    }
  }
}
