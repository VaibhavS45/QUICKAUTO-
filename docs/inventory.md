# Repository and UI backend inventory

Updated after U5 added shell settings for plugins, MCP, API metadata, and
agents.

## Part A: S0 verification

| Requested item | Status | Current location / note |
|---|---|---|
| `src/shared/contracts/schedule.ts` | Present | Schedule and run schemas plus `ScheduleSource`. |
| `src/shared/contracts/notifications.ts` | Present | Notification schemas and inferred types. |
| `src/shared/contracts/automation-templates.ts` | Present | Template, trigger, and defaults schemas. |
| `src/renderer/contracts/feature.ts` | Present | `FeatureModule` and `ShellApi`; `openCalendarWindow()` remains deprecated and is a no-op. |
| `src/renderer/shell/registry.ts` | Present | `import.meta.glob('../features/*/feature.ts', { eager: true })` with an Automations placeholder fallback. |
| `src/renderer/shell/ShellApp.tsx` | Present | App frame, chat history, today's schedule, recent tasks, notifications, local profile footer, and feature navigation. |
| `#app` route in `src/renderer/main.tsx` | Present | Default route renders `ShellApp`; `#settings` renders Settings. |
| `src/main/shell/app-window.ts` | Missing at requested path | Window implementation is `src/main/agent/shell-app-window.ts`. |
| `src/main/shell/schedule-registry.ts` | Missing at requested path | Registry is `src/main/agent/schedule-registry.ts`. |
| `src/main/shell/notifications.ts` | Present | Electron-store-backed notification service with a 200-item cap. |
| `src/main/ipc/shell.ts` | Missing at requested path | IPC registration is currently in `src/main/agent/shell-ipc.ts`. |
| `src/main/ipc/automations.ts` | Missing at requested path | Placeholder registration is also in `src/main/agent/shell-ipc.ts`. |
| `src/preload/shell.ts` | Present | Schedule/notification, plugin, MCP, and agent APIs are exposed through `window.app`. |
| `src/preload/automations.ts` | Present | Empty extension object. |
| `EXTRA_TABS` / `EXTRA_NAV` | Present | Settings extension points register Account, Plugins, MCP, API, and Agents tabs. |
| `openSettings(tab?)` | Present | Settings window supports an optional tab. |
| `docs/ownership.md` | Present | Documents shell/Automations ownership. |
| `CODEOWNERS` | Present | Contains repository ownership entries. |
| `AGENTS.md` | Present | Reflects current ownership and removed-window constraints. |

The app window and schedule registry remain under `src/main/agent/`; chat,
schedule, and notification services are under `src/main/shell/`. Namespaced
shell IPC handlers are registered by the main process; notifications persist
in electron-store.

## Part B: Existing implementation

### 1. Connectors

`ConnectorProvider` in `src/main/connectors/provider.ts` defines `getTools`,
`status`, and `connect`. Providers register during startup in
`src/main/index.ts` through `src/main/agent/registry.ts`.

| Service | Existing behavior / invocation |
|---|---|
| Gmail / Composio | `ComposioConnectorProvider` in `src/main/connectors/composio.ts` supplies Gmail read/write tools. `connections:status` and `connections:connect` provide connection status and OAuth setup. Gmail calls guard themselves; the general wrapper skips them to prevent double metering. |
| Notion and Sheets | `ComposioProvider` in `src/main/connectors/composio-tools.ts`; current operations are stubs. Status is included in `connector:get`. |
| Web search | `src/main/connectors/websearch.ts` supports DuckDuckGo fallback and optional Brave/SerpAPI providers configured through environment variables. |
| GitHub read tools | `GitHubCliProvider` uses local `gh`/`git` with the repository allowlist configured in Provider settings. `github:status` reports status; auth is provided by `gh auth login`, not stored by the app. |
| GitHub conflict resolution | `GitHubResolveProvider` works on configured local clones with OpenCode. Diff display, commit, and push have approval protections; commit and push are separate actions. |
| Built-in file tool | `write_file` in `src/main/agent/tools.ts` restricts writes to the home directory, current workspace, or `/tmp`, and requires approval. There is no general file-read connector. |

Composio's project key is validated and stored encrypted as
`composio-project-key-encrypted` in the `palette-connectors` electron-store.
Provider API keys use Electron `safeStorage` in
`src/main/settings/model-settings.ts`. Renderer IPC returns key-presence
status, never secret values. `BudgetGuard` in
`src/main/connectors/budget-guard.ts` meters Composio executions; its state
uses the existing `palette-budget` store. The existing store names
`palette-budget`, `palette-connectors`, and `palette-routines` must not change.

`calendar` is no longer an agent tool or an entry in `TOOL_IDS`/`TOOL_META`.
The scheduler's legacy `@calendar` routine syntax remains in
`src/main/agent/scheduler.ts`; that file is Automations-owned.

### 2. MCP

`src/main/shell/mcp-registry.ts` validates and persists stdio and streamable
HTTP server configurations, tracks stopped/running/error status, starts and
stops servers, and provides tools from running connections. The MCP screen uses
`shell:mcp-list`, `shell:mcp-upsert`, `shell:mcp-start`, `shell:mcp-stop`, and
`shell:mcp-remove`; each request is validated in
`src/main/shell/settings-ipc.ts`. The adapter in `mcp-client.ts` uses the
official `@modelcontextprotocol/client` TypeScript SDK v2 package with
`StdioClientTransport` or `StreamableHTTPClientTransport`. Plain HTTP is
limited to localhost; other HTTP servers must use HTTPS.

Credentials are encrypted by `SafeStorageMcpVault` using Electron's async
safeStorage APIs and stored as ciphertext in `palette-mcp-secrets`. Server
configuration is in `palette-mcp`. Secret values are never included in IPC
responses. Running server tools are exposed through the `@mcp` tool ID by
`McpConnectorProvider`; every MCP tool requires the runner's approve/deny card.
MCP tool executions are not Composio calls and are not charged to BudgetGuard.
No MCP server feature is provided by the OpenCode SDK wrapper.

### 3. Plugins

`src/main/shell/settings-runtime.ts` scans
`<userData>/plugins/*/plugin.json` at startup and passes parsed manifests to
`PluginRegistry.load()`. The registry validates public manifest fields and
persists enabled IDs in the `palette-plugins` electron-store. The Plugins
sidebar view and Settings tab support listing and enable/disable through
`shell:plugins-list` and `shell:plugin-enable`.

There is no plugin installer or plugin-code execution runtime yet; enablement
currently records the user's preference only.

### 4. API and network endpoints

- No app-owned local HTTP API or inbound webhook endpoint/port exists.
- Outbound integrations include AI SDK provider wrappers, Composio, web
  search, and local `gh` invocations.
- The API tab displays only model/Composio key-presence state and the model
  base URL. It does not provide an app-owned HTTP API.
- OpenCode is spawned on an available loopback port with a random
  per-process password passed through `OPENCODE_SERVER_PASSWORD`; it is
  stopped when the app quits. This is internal to OpenCode, not a Palette API.
- Gmail browser auth is initiated through Composio; GitHub auth is owned by
  the local GitHub CLI. There is no Palette account auth backend.

### 5. Agent runner

- `src/main/agent/registry.ts` combines built-in tools and registered
  connectors, including the new `@mcp` provider. Active selectable tool IDs
  are defined in `src/shared/types.ts`.
- `src/main/agent/runner.ts` uses AI SDK v7 `ToolLoopAgent`, streams events,
  and stops after 20 steps. Agent events are sent to the shell app window.
- `agent:run` accepts a prompt, tools, source, optional conversation history,
  and an optional system prompt. `RunSource` retains
  `'palette'` for compatibility and adds `'chat'` alongside `'scheduled'`.
- Chat history is persisted through `shell:chat-*`; main retrieves it for agent
  runs and supplies the last 20 messages to the runner.
- Writes require an approve/deny decision on interactive runs. Scheduled
  runs deny writes; OpenCode permission requests use the nested approval path.
  MCP tool calls also require approval (including read calls).
- Recent agent runs persist in the `palette-shell` electron-store.
- Custom agent profiles are stored in `palette-agents`, capped at 20 including
  the undeletable built-in Chat profile. Their CRUD is exposed in Settings via
  shell IPC. Custom profiles are stored but are not yet selectable by Chat.

### 6. Settings tabs

Settings navigation has six built-in tabs plus five shell tabs:

| Tab | Existing functionality |
|---|---|
| General | Local profile fields and whether closing the app window leaves the app running in the background. |
| Appearance | Shader background setting. |
| Provider | Model provider/model, encrypted API key status/set/clear, reset day, GitHub repository allowlist, and auto-approve configuration. |
| Connectors | Composio key/status, Gmail OAuth connection, and GitHub CLI/repository configuration. Notion/Sheets operations are stubs. |
| Routines | Lists and manages persisted scheduler routines. |
| Usage | BudgetGuard counts and a link to the Composio usage dashboard. |
| Account | Reuses the local profile settings surface from General. |
| Plugins | Lists scanned plugin manifests and persists enable/disable state. Does not execute plugin code. |
| MCP | Add, edit, start, stop, and remove stdio or streamable HTTP servers. Credentials are safeStorage-encrypted. |
| API | Shows API key presence and base URLs only; states that there is no local API server. |
| Agents | CRUD for local profiles; Chat is built in and undeletable. |

Settings IPC includes `settings:get-model`, `settings:set-model`,
`settings:set-api-key`, `settings:clear-api-key`, profile/app-behavior
channels, and `settings:show` / `settings:hide`. `EXTRA_TABS` and `EXTRA_NAV`
provide the five shell settings surfaces. There is no Shortcuts tab.

### 7. Removed-window and startup dependencies

- No palette or calendar `BrowserWindow`, global shortcut, `--toggle` path, or
  palette/calendar IPC channel remains.
- `src/main/shell/launch-policy.ts` opens the app by default and leaves it
  tray-only for `--background`.
- Second-instance activation and the macOS Dock `activate` handler open the
  shell app window. The tray contains Open app, Settings, Start on login, and
  Quit.
- `RunSource: 'palette'` and the three existing `palette-*` store names remain
  compatibility/product-data identifiers, not window dependencies.
- `ShellApi.openCalendarWindow()` remains only as a deprecated no-op contract
  method. The scheduler's `@calendar` directive is separate legacy routine
  syntax and remains Automations-owned.

## Part C: UI needs vs backend

| UI item | Status | Backend evidence / gap |
|---|---|---|
| Connectors screen | **READY** | Existing connector status/key and Gmail/GitHub flows remain; Notion and Sheets operations are still stubs. |
| Plugins list and enable/disable | **READY** | Manifest scan, validation, electron-store preferences, and namespaced IPC are wired; plugin code is not executed. |
| MCP servers screen (add/remove/status) | **READY** | Registry, official SDK adapter, lifecycle controls, safeStorage credentials, IPC, and approved `@mcp` tools are wired. |
| API keys screen | **READY** | New API tab shows key-presence/base URL metadata only; encrypted set/clear flows remain in Provider and Connectors. |
| Agents CRUD | **READY** | Zod-validated electron-store profiles, 20-item cap, protected built-in Chat, and Settings CRUD are wired; custom agents are not yet used by Chat. |
| Chat history store | **READY** | Persistent chat threads/history and validated `shell:chat-*` IPC power Home chat and the sidebar. |
| Notifications | **READY** | `src/main/shell/notifications.ts` persists validated notifications in the `palette-notifications` electron-store, with namespaced IPC and a shell notification center. |
| Today's schedule source | **READY** | `src/main/shell/schedule-service.ts` adapts persisted routines and recent agent runs to the schedule contracts; the shell shows today's schedule and recent tasks. |
