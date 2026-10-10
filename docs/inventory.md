# Repository and UI backend inventory

Updated after the shell launch work and removal of the palette and calendar
windows.

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
| `src/preload/shell.ts` | Present | Empty extension object; shell-specific methods are exposed through `window.app`. |
| `src/preload/automations.ts` | Present | Empty extension object. |
| `EXTRA_TABS` / `EXTRA_NAV` | Present | Empty extension collections consumed by Settings navigation. |
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

No MCP client/server, server configuration, registration lifecycle, status
API, or MCP-to-agent tool bridge exists. OpenCode is an SDK wrapper around a
separately spawned local OpenCode server, not MCP.

### 3. Plugins

No plugin loader, manifest format, install flow, persistence, or enable/disable
API exists. The Plugins screen is currently a placeholder.

### 4. API and network endpoints

- No app-owned local HTTP API or inbound webhook endpoint/port exists.
- Outbound integrations include AI SDK provider wrappers, Composio, web
  search, and local `gh` invocations.
- OpenCode is spawned on an available loopback port with a random
  per-process password passed through `OPENCODE_SERVER_PASSWORD`; it is
  stopped when the app quits. This is internal to OpenCode, not a Palette API.
- Gmail browser auth is initiated through Composio; GitHub auth is owned by
  the local GitHub CLI. There is no Palette account auth backend.

### 5. Agent runner

- `src/main/agent/registry.ts` combines built-in tools and registered
  connectors. Active selectable tool IDs are defined in `src/shared/types.ts`.
- `src/main/agent/runner.ts` uses AI SDK v7 `ToolLoopAgent`, streams events,
  and stops after 20 steps. Agent events are sent to the shell app window.
- `agent:run` accepts a prompt, tools, source, optional conversation history,
  and an optional system prompt. `RunSource` retains
  `'palette'` for compatibility and adds `'chat'` alongside `'scheduled'`.
- Chat history is persisted through `shell:chat-*`; main retrieves it for agent
  runs and supplies the last 20 messages to the runner.
- Writes require an approve/deny decision on interactive runs. Scheduled
  runs deny writes; OpenCode permission requests use the nested approval path.
- Recent agent runs persist in the `palette-shell` electron-store.

### 6. Settings tabs

The current Settings navigation has six tabs:

| Tab | Existing functionality |
|---|---|
| General | Local profile fields and whether closing the app window leaves the app running in the background. |
| Appearance | Shader background setting. |
| Provider | Model provider/model, encrypted API key status/set/clear, reset day, GitHub repository allowlist, and auto-approve configuration. |
| Connectors | Composio key/status, Gmail OAuth connection, and GitHub CLI/repository configuration. Notion/Sheets operations are stubs. |
| Routines | Lists and manages persisted scheduler routines. |
| Usage | BudgetGuard counts and a link to the Composio usage dashboard. |

Settings IPC includes `settings:get-model`, `settings:set-model`,
`settings:set-api-key`, `settings:clear-api-key`, profile/app-behavior
channels, and `settings:show` / `settings:hide`. The extension maps
`EXTRA_TABS` and `EXTRA_NAV` are present but empty. There is no Shortcuts tab.

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
| Connectors screen | **PARTIAL** | Settings already has connector status/key and Gmail/GitHub connection workflows; Notion and Sheets are stubs. |
| Plugins list and enable/disable | **MISSING** | No plugin runtime, manifest, persistence, or management API. |
| MCP servers screen (add/remove/status) | **MISSING** | No MCP server or configuration layer. |
| API keys screen | **READY** | Provider and Composio key set/clear/status already use encrypted storage and expose renderer-safe state. |
| Agents CRUD | **MISSING** | No agent model/store or CRUD IPC. |
| Chat history store | **READY** | Persistent chat threads/history and validated `shell:chat-*` IPC power Home chat and the sidebar. |
| Notifications | **READY** | `src/main/shell/notifications.ts` persists validated notifications in the `palette-notifications` electron-store, with namespaced IPC and a shell notification center. |
| Today's schedule source | **READY** | `src/main/shell/schedule-service.ts` adapts persisted routines and recent agent runs to the schedule contracts; the shell shows today's schedule and recent tasks. |
