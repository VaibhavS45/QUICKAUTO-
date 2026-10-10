# Code ownership

| Area | Owner | Paths |
|---|---|---|
| Shell and non-automation UI | Shell owner | `src/renderer/shell/**`, `src/main/agent/**` except `scheduler.ts`, `src/renderer/settings/**`, `src/preload/shell.ts` |
| Automations | Automations owner | `src/renderer/features/automations/**`, `src/main/automations/**`, `src/main/agent/scheduler.ts`, `src/preload/automations.ts` |
| Shared contracts | Both; additive only | `src/shared/contracts/**`, `src/renderer/contracts/**` |
| Shared entry points | Small integration hooks only, except explicitly scoped work | `src/renderer/main.tsx`, `src/preload/index.ts`, `src/main/ipc.ts`, `src/main/index.ts`, `src/renderer/settings/SettingsDialog.tsx`, `src/renderer/settings/nav.ts`, `AGENTS.md` |

The palette and calendar windows have been removed. Do not add them back.
There is no global hotkey or `--toggle` behavior. The app starts in the shell;
the scheduler's legacy `@calendar` text syntax is owned with the Automations
code and must not be changed outside that scope.

Each feature owns its namespaced IPC registration and preload API. Shared
entry points connect those modules; avoid feature-specific logic there. Shell
and automation features communicate through shared contracts.

## Integration order

The shell contracts and skeleton merge first. The Automations owner rebases
after that merge, then works only in Automations-owned paths. Contract changes
remain additive and require coordination before introducing a new field.
