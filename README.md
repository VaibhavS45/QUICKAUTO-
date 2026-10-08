# Palette

Raycast-style pop-up command palette (global hotkey) + calendar app for scheduling
AI agent tasks. All data stays local except what your chosen model provider, web
search provider, and Composio receive. No telemetry.

> **Milestone 1 done.** Frameless palette window with `@` autocomplete, tray,
> configurable hotkey (with Wayland fallback), calendar shell, typed IPC + CSP.
> No agent loop yet — that lands in M2. See *Milestone status* below.

## Quick start

```bash
npm install
npm run build
npx electron ./out/main -- --no-sandbox   # --no-sandbox only needed as root / in containers
```

Dev mode: `npm run dev`. Typecheck: `npm run typecheck`.
Unit tests: `npm test`. E2E smoke: `npm run test:e2e` (build first).
Installers: `npm run dist` (electron-builder: AppImage + deb, dmg, nsis).

Press **Ctrl+Space** (macOS default: **Alt+Space**, configurable in palette
Settings) to toggle the palette. The calendar opens automatically on launch
(uncheck "Show palette on launch" in palette Settings to start calendar-only;
`--toggle` starts tray-only). Type `@` to see tools (`@calendar @websearch
@notion @gmail @sheets @opencode @github @files`, aliases `@email`, `@sheet`).
Enter runs, Esc hides, ↑ recalls history, ⌘/Ctrl+Enter copies the result.
`@calendar <text>` opens the calendar with a task draft (it never runs an agent).

## Web search and scheduled tasks

`@websearch` uses the platform's web-search tool registry. By default it falls back to the public DuckDuckGo API, and it prefers a configured provider if you set either `BRAVE_SEARCH_API_KEY` or `SERPAPI_API_KEY` (or `PALETTE_WEBSEARCH_PROVIDER`).

Examples:

```text
@websearch what is the highest grossing movie globally this year?
@websearch find today's biggest tech news and save a summary to /home/vaibhav/doc/tech-news.txt
@websearch sources
```

The search tool keeps source metadata for the latest result. If a message asks for sources or says “where did you get this information,” Palette can cite the most recent web-search sources without inventing URLs.

You can also schedule `@websearch` through the calendar task system, e.g. `@calendar @websearch at 7:00am check the price of Bitcoin and append it to /home/vaibhav/doc/bitcoin.txt`.

## GitHub pull-request conflict resolution

GitHub PR tools require the GitHub CLI to be installed and authenticated
(`gh auth login`). In Settings → Connections, add the local clone path and its
`owner/name`; optionally set a test command for the resolver to run. Ask the
palette to resolve conflicts on a conflicting PR with `@github`. The resolver
creates a separate `palette/resolve-pr-*` branch in that clone, asks OpenCode
to resolve the merge conflicts, and shows the resulting diff for approval.
Committing the resolution and pushing its branch are separate actions, each
with its own approval. It never force-pushes or writes directly to the default
branch. OpenCode must be installed and available as `opencode` on `PATH`.

## Linux / Wayland hotkey

`globalShortcut` is unreliable on Wayland (Electron docs; the portal-based
global-shortcuts path depends on compositor support). If registration fails, the
app shows the exact fallback in Settings and as a notification: bind a system
shortcut to:

```
<path-to-palette> --toggle
```

GNOME: Settings → Keyboard → Custom Shortcut.
KDE: System Settings → Shortcuts. The `--toggle` flag is routed through the
single-instance lock, so it works whether the app is running or not (second
instance just signals the first and exits). Verified on this machine, which
itself runs a Wayland session.

## Verified library versions (Oct 2026, per current docs)

| Package | Pinned | Finding |
|---|---|---|
| Electron | `^44.5.0` (installed 44.6.0) | Wayland native since 38.2, but `globalShortcut` still restricted → CLI fallback stands. Latest 3 majors supported. |
| Vercel AI SDK `ai` | **v7** (`^7`, needs Node 22+) | `ToolLoopAgent` exists; per-call `needsApproval` on `tool()` is **deprecated** → use `toolApproval` on the agent/generate call. Spec updated accordingly (M2). |
| `@composio/core` / `@composio/vercel` | `^0.13` / `^0.11` (M3) | `@composio/vercel@0.11+` supports `ai@^6 \|\| ^7`. REST API is v3.1; manual `execute()` now requires a toolkit version (agentic flows set the skip flag internally). |
| `@opencode-ai/sdk` | `^1.18.35` (M5) | `createOpencodeClient({ baseUrl, fetch })` attaches to the local server; session, event subscription, and permission APIs power conflict resolution. |
| electron-vite | `^5.0.0` | Single renderer entry + hash routing (`#palette` / `#calendar`) — multi-page `rollupOptions.input` objects are dropped by its config merge, so we don't use them. |
| electron-builder | `^26` | AppImage + deb, dmg, nsis targets (M6). |

## Composio free-plan counting (source of truth, verified Oct 2026)

Current docs (pricing + updated-pricing pages) say:

- Hobby plan is **hard-capped, no overage billing**: usage pauses at the cap.
- **100K tool calls/mo** with your own OAuth app/API key; **Composio-managed
  (shared) apps cap at 20K/mo** of that allowance.
- **Each tool execution counts once. Meta tools such as tool search are free.**
- **Failed calls don't count.**

The spec asked to count every request including meta-tools until confirmed.
Confirmed now: meta-tools are free and failures are free — but the app still
counts **every attempted Composio call locally** (conservative meter) and keeps
the 15K soft budget / scheduled-vs-interactive split, so small counting
differences can never push anyone over 20K. Full BudgetGuard lands in M3;
Settings will link the Composio dashboard usage page as the source of truth.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` renderers.
- Preload exposes a small `window.palette` API only; every IPC payload is
  validated with zod in main. Strict CSP (dev allows localhost HMR).
- Secrets (model keys, Composio keys) will live in the OS keychain
  (keytar / safeStorage) in M2–M3 — never in the renderer, localStorage, or
  plain files. Nothing secret exists yet in M1.

## Repo notes / deviations from the spec

- **Preload is CJS** (`scripts/build-preload.mjs` via esbuild → 
  `out/preload/index.cjs`). electron-vite emits ESM (`.mjs`) for
  `"type": "module"` projects, which Electron's **sandboxed** preload loader
  rejects (`Cannot use import statement outside a module`). Chained into
  `build`/`dev` scripts; `preloadPath()` resolves it in both modes.
- electron 44.6.0 installed (caret range above the 44.5.0 pin) — same major, fine.
- `needsApproval` → `toolApproval` (AI SDK v7), per deprecation notice.
- Tray icon uses an empty `nativeImage` placeholder until M6 artwork lands.

## Milestone status

- [x] **M1** — scaffold, tray, hotkey (+Wayland `--toggle`), frameless palette
  with `@` autocomplete + aliases, calendar shell with draft handoff, unit +
  Playwright smoke tests. **Stop for review here.**
- [ ] M2 — agent loop (`ai` v7 `ToolLoopAgent` + `toolApproval`), one provider,
  `@websearch` + `@files` tools, streaming + approval cards.
- [ ] M3 — `ConnectorProvider` + Composio (Gmail/Sheets/Notion), Connections
  page, full BudgetGuard (meter, caps, cache, dedupe, pre-flight) with tests.
- [ ] M4 — SQLite, croner scheduler, FullCalendar UI, run history,
  notifications, missed-run recovery.
- [ ] M5 — `@opencode`/`@github` via `opencode serve` + SDK, two seeded tasks.
- [ ] M6 — packaging, autostart polish, full test suite, setup docs.
