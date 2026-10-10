# Code ownership

| Area | Owner | Paths |
|---|---|---|
| Shell | Shell owner | `src/renderer/shell/**`, `src/main/agent/**`, `src/renderer/settings/tabs/**`, `src/preload/shell.ts` |
| Automations | Automations owner | `src/renderer/features/automations/**`, `src/main/automations/**`, `src/main/agent/scheduler.ts`, `src/preload/automations.ts` |
| Calendar view | Frozen | `src/renderer/calendar/**`, `src/main/calendar-window.ts` |
| Shared contracts | Both; additive only | `src/shared/contracts/**`, `src/renderer/contracts/**` |
| Shared entry points | One-line integration hooks only | `src/renderer/main.tsx`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/renderer/settings/SettingsDialog.tsx`, `src/renderer/settings/nav.ts`, `AGENTS.md` |

Each feature owns its namespaced IPC registration and preload API. Shared
entry points only connect those modules; avoid feature-specific logic there.
The shell consumes automation data through shared contracts rather than
depending on the automation implementation.

## Integration order

The shell contracts and skeleton merge first. The automations owner rebases
after that merge, then works only in the automations-owned paths. Contract
changes remain additive and require coordination before introducing a new
field.
