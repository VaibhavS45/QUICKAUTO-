# Repository and UI backend inventory

Initial inventory audited against `origin/main` at `110d3b4` (2026-10-10);
S0 PR #15 is merged. Shell-frame and launch changes since that baseline are
noted below.

## Part A: S0 verification

| Requested item | Status | Current location / note |
|---|---|---|
| `src/shared/contracts/schedule.ts` | Present | Schedule and run schemas plus `ScheduleSource` interface. |
| `src/shared/contracts/notifications.ts` | Present | Notification schemas and inferred types. |
| `src/shared/contracts/automation-templates.ts` | Present | Template, trigger, and defaults schemas. |
| `src/renderer/contracts/feature.ts` | Present | `FeatureModule` and `ShellApi` types. |
| `src/renderer/shell/registry.ts` | Present | Uses `import.meta.glob('../features/*/feature.ts', { eager: true })`; supplies an Automations placeholder if none is found. |
| `src/renderer/shell/ShellApp.tsx` | Present | App frame, sidebar, in-memory navigation, local profile footer, and placeholder Home/Plugins views. |
| `#app` route in `src/renderer/main.tsx` | Present | Routes to `ShellApp`. |
| `src/main/shell/app-window.ts` | **Missing at requested path** | App window implementation is `src/main/agent/shell-app-window.ts`. |
| `src/main/shell/schedule-registry.ts` | **Missing at requested path** | Registry is `src/main/agent/schedule-registry.ts`. |
| `src/main/shell/notifications.ts` | **Missing at requested path** | In-memory stub is `src/main/agent/notifications.ts`. |
| `src/main/ipc/shell.ts` | **Missing at requested path** | Empty registration functions are together in `src/main/agent/shell-ipc.ts`. |
| `src/main/ipc/automations.ts` | **Missing at requested path** | `registerAutomationsIpc()` is in `src/main/agent/shell-ipc.ts`. |
| `src/preload/shell.ts` | Present | Exposes the allowlisted `calendar:open` action for shell features. |
| `src/preload/automations.ts` | Present | Exports an empty `automationsApi`. |
| `EXTRA_TABS` / `EXTRA_NAV` settings hook | Present | Declared as empty extension collections in `src/renderer/settings/extra-tabs.ts`; consumed by `nav.ts` and `SettingsDialog.tsx`. |
| `openSettings(tab?)` | Present | `src/main/agent/settings-window.ts`; the current built-in settings tabs do not include an account tab. |
| `docs/ownership.md` | Present | Describes the earlier shell/automation ownership split. |
| `CODEOWNERS` | Present | Uses placeholder usernames `@shell-owner` and `@automations-owner`. |
| Updated `AGENTS.md` | Present, but **needs reconciliation** | Contains S0-era ownership rules and the frozen calendar constraint. It does not yet contain all newer rules in the UI update prompt, including the no-palette rule and revised ownership paths. |

The requested `src/main/shell/**` and `src/main/ipc/{shell,automations}.ts`
files are not present. Main-process shell code currently lives under
`src/main/agent/`, as required by the repository's existing instructions.
The S0 registration functions are no-op placeholders, not implemented IPC
services. The notification store is process-memory only; it is not persisted
or connected to a renderer.

## Part B: Existing implementation

### 1. Connectors

The connector contract is `ConnectorProvider` in
`src/main/connectors/provider.ts`: providers expose `getTools`, `status`, and
`connect`. They register at startup in `src/main/index.ts` with
`registerConnectorProvider` from `src/main/agent/registry.ts`.
Canonical mention ids are `calendar`, `websearch`, `notion`, `gmail`,
`sheets`, `opencode`, `github`, and `files` (`@email` aliases Gmail and
`@sheet` aliases Sheets). These ids are not all implemented connectors:
`@calendar` opens the calendar with a draft, `@opencode` has no standalone
provider, and the file integration currently consists of the approval-gated
built-in `write_file` tool.

| Service / implementation | Current behavior and invocation |
|---|---|
| Gmail / Composio | `ComposioConnectorProvider` in `src/main/connectors/composio.ts` registers Gmail read tools (`gmail_search`, `gmail_get`, `gmail_labels`) and write tools (`gmail_draft`, `gmail_send`, `gmail_reply`, `gmail_modify_labels`). Status/connect use `connections:status` and `connections:connect`; connect creates a Composio-managed Gmail OAuth link and main opens it with `shell.openExternal`. The renderer helper `src/renderer/hooks/useGmailConnect.ts` checks status every 3 seconds for up to 2 minutes after connect. |
| Notion | `ComposioProvider` in `src/main/connectors/composio-tools.ts`; `notion_search` and `notion_create` currently return stub results rather than calling Composio. Status is reported through `connector:get`. |
| Sheets | Same provider; `sheets_read` is currently a stub. Status is reported through `connector:get`. |
| Web search | `src/main/connectors/websearch.ts` supports DuckDuckGo public fallback and optional Brave or SerpAPI providers. Provider/key selection uses `PALETTE_WEBSEARCH_PROVIDER` / `WEBSEARCH_PROVIDER`, `BRAVE_SEARCH_API_KEY` / `BRAVE_API_KEY`, and `SERPAPI_API_KEY` / `SERP_API_KEY` environment variables. There is no dedicated secret-settings IPC for these environment keys. |
| GitHub read tools | `GitHubCliProvider` in `src/main/connectors/github-cli.ts` calls local `gh`/`git` using argument arrays, limited to configured repositories. Status is available through `github:status` and the Settings connection panel. Auth is external via `gh auth login`; the app does not read or store the token. Calls are marked zero-Composio-cost. |
| GitHub conflict resolution | `GitHubResolveProvider` in `src/main/connectors/github-resolve.ts` works on configured local clones and uses the OpenCode manager. Commit and push require separate approval flows. |
| Built-in file tool | `write_file` in `src/main/agent/tools.ts` writes only under the home directory, current working directory, or `/tmp`, and requires approval. No general `@files` read connector is registered. |

The existing settings IPC/preload surface includes:

- `connector:get`, `connector:set-key`, `connector:clear-key`
- `connections:status`, `connections:connect`
- `github:status`

Composio's project key is validated as an `ak_` key and stored encrypted as
`composio-project-key-encrypted` in the existing `palette-connectors`
electron-store file. Model-provider keys use async Electron `safeStorage`
through `src/main/settings/model-settings.ts`. Renderer responses expose only
whether keys are configured, never the keys.

Budgeting: `BudgetGuard` in `src/main/connectors/budget-guard.ts` wraps
provider tool execution in `src/main/index.ts`; Gmail tools self-wrap with the
guard in `composio.ts` and are skipped by the generic wrapper to avoid double
metering. The current budget is persisted in the `palette-budget` store.
Configured GitHub CLI calls are excluded from Composio counting. The store
names `palette-budget`, `palette-connectors`, and `palette-routines` are
existing user data and must not be renamed.

### 2. MCP

No MCP client, MCP server, server configuration schema, registration path,
status API, or MCP-to-agent tool bridge was found. OpenCode is not MCP: it is
an SDK wrapper around a separately spawned local OpenCode server.

### 3. Plugins

No plugin loader, plugin manifest format, install flow, or enable/disable
store was found. `TOOL_META` and the provider registry are static code
registrations, not an installable plugin system.

### 4. API and network endpoints

- No app-owned local HTTP server, inbound webhook receiver, or app API port was
  found.
- Outbound integrations exist: AI SDK provider wrappers for Anthropic/OpenAI
  in `src/main/agent/runner.ts`; Composio SDK calls in
  `src/main/connectors/composio.ts`; web-search HTTP calls in
  `src/main/connectors/websearch.ts`; and local `gh` CLI invocations for
  GitHub.
- OpenCode is spawned by `src/main/agent/opencode-server.ts` as
  `opencode serve --hostname 127.0.0.1 --port <ephemeral-port>`. The manager
  chooses an available loopback port, creates a random per-process password,
  passes it via `OPENCODE_SERVER_PASSWORD`, and uses HTTP Basic auth from the
  SDK wrapper. It is stopped on app quit. This is an internal OpenCode server,
  not a Palette API.
- OAuth/browser auth is initiated for Gmail through Composio. GitHub
  authentication is owned by the local `gh` CLI. There is no Palette account
  authentication backend.

### 5. Agent runner

- `src/main/agent/registry.ts` composes built-in tools and registered
  `ConnectorProvider`s, selected by the `ToolId[]` from
  `src/shared/types.ts`.
- `src/main/agent/runner.ts` uses the Vercel AI SDK v7 `ToolLoopAgent`,
  streams agent events, and limits the run to 20 steps. Main sends run events
  using `agent:event`; the current event target is the palette window.
- `src/shared/agent.ts` defines `RunSource` as `'palette' | 'scheduled'`.
  `agent:run` accepts `{ prompt, tools, source }`. The request schema has no
  `history` or `systemPrompt` fields; each run currently starts with one user
  message and uses `buildInstructions()` from the tool registry.
- Approvals use `toolApproval` via `src/main/agent/tools.ts`. File writes,
  email writes, Notion create, and GitHub resolve/commit/push require approval
  on interactive/palette runs. Scheduled runs deny write approvals. Nested
  OpenCode permission prompts use `src/main/agent/nested-approval.ts` and the
  same approval event path.
- No persistent chat/thread history store was found.

### 6. Settings tabs

Built-in navigation in `src/renderer/settings/nav.ts` currently has seven tabs:

| Tab | Existing functionality |
|---|---|
| General | Local profile fields (name, email, about, language) and whether to keep the app running in the background after closing the calendar. Profile is stored under `general-profile`; behavior uses `keepBackground`. |
| Appearance | Animated shader background toggle, stored as `shader`. |
| Provider | Anthropic/OpenAI/OpenAI-compatible provider and model, encrypted API key status/set/clear, reset day, configured GitHub repository allowlist, and the built-in `echo` auto-approve toggle. |
| Connectors | Composio key, status badges, Gmail OAuth connect/status, GitHub CLI auth/repository configuration. Notion/Sheets are still stub tool implementations. |
| Routines | Lists, enables/disables, and removes persisted scheduler routines. Routine creation is also available through the palette flow. |
| Shortcuts | Reads and changes the global palette hotkey; shows Wayland fallback guidance. |
| Usage | Shows BudgetGuard counts and links to the Composio usage dashboard. |

Settings IPC uses `settings:get-model`, `settings:set-model`,
`settings:set-api-key`, `settings:clear-api-key`, `settings:get-profile`,
`settings:set-profile`, `app:get-behavior`, `app:set-behavior`,
`settings:show`, and `settings:hide`. Extension maps `EXTRA_TABS` and
`EXTRA_NAV` exist but are empty.

### 7. Palette and global-hotkey dependencies still present

The palette has **not** been removed yet:

- `src/main/index.ts` always creates the palette window, registers
  `globalShortcut`, and handles second-instance `--toggle`.
- `src/main/agent/background-mode.ts` recognizes `--toggle` for second-instance
  routing. Normal startup opens the app shell; `--background` starts tray-only.
- The calendar is opened explicitly and no longer auto-opens at startup.
- `src/main/ipc.ts` and `src/preload/index.ts` retain `palette:submit`,
  `palette:hide`, `palette:resize`, `agent:event` and settings/hotkey APIs.
- Agent events are currently emitted to `getPaletteWindow()` only.
- General settings text still describes the command bar and palette
  background behavior; Shortcuts remains a global-hotkey settings screen.
- The tray menu has Open app, Open calendar, Settings, and Quit. README still
  documents the global hotkey and `--toggle`.

Removing the palette/hotkey still requires coordinated UI and main-process
work; it is intentionally outside this shell-frame task.

## Part C: UI needs vs backend

| UI item | Status | Backend evidence / gap |
|---|---|---|
| Connectors screen | **PARTIAL** | Provider registry, Composio key/status, Gmail OAuth, GitHub CLI status/auth and repo allowlist exist. Notion and Sheets operations remain stubs; current Settings already contains a basic Connections panel. |
| Plugins list and enable/disable | **MISSING** | No plugin runtime, manifest, persistence, or enable/disable API. |
| MCP servers screen (add/remove/status) | **MISSING** | No MCP client/server or server configuration layer found. |
| API keys screen | **READY** | Existing provider API key and Composio key storage/set/clear/status IPC uses `safeStorage` encryption and renderer-safe status. UI already exposes the controls across Provider and Connectors tabs. Web-search environment keys are not managed by this screen. |
| Agents CRUD | **MISSING** | No agent model/store or CRUD IPC. The runner only has global provider/model configuration plus `echo` auto-approve. |
| Chat history store | **MISSING** | No thread/message persistence module or history IPC found. |
| Notifications | **PARTIAL** | S0 has notification schemas and an in-memory `notify()`/list stub, but no persistence, IPC, OS notifications, renderer center, or production call sites. |
| Today's schedule source | **PARTIAL** | `Scheduler` persists routines and exposes routine list/toggle/remove IPC, and S0 defines/registers a `ScheduleSource` interface. No adapter or call to `registerScheduleSource()` is wired, and there is no today-schedule IPC or sidebar UI. |

## Reconciliation items for the updated prompt pack

The merged S0 implements the contracts and minimal app-window skeleton, but
several paths differ from the updated pack's proposed layout. Main-process
shell code is in `src/main/agent/`, and shell/automation IPC hooks are in one
`src/main/agent/shell-ipc.ts`, rather than separate `src/main/shell/` and
`src/main/ipc/` files. The merged `AGENTS.md` and `docs/ownership.md` still
describe earlier ownership assumptions. The current tree also retains the
palette, global hotkey, and `--toggle` behavior that the new prompt says to
remove; this audit does not change any of those files.
