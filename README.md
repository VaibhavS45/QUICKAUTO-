# Palette

Desktop assistant with an in-app shell and automation routines. All data stays
local except what your chosen model provider, web-search provider, and Composio
receive. No telemetry.

## Quick start

```bash
npm install
npm run build
npx electron ./out/main -- --no-sandbox   # --no-sandbox only needed as root / in containers
```

Dev mode: `npm run dev`. Typecheck: `npm run typecheck`.
Unit tests: `npm test`. E2E smoke: `npm run test:e2e` (build first).
Installers: `npm run dist` (electron-builder: AppImage + deb, dmg, nsis).

The app opens into the shell. Start with `--background` for tray-only startup.
Use the shell navigation or the Settings screen to access the app's features.
Tool mentions include `@websearch @notion @gmail @sheets @opencode @github
@files`, with aliases `@email` and `@sheet`.

## Web search and scheduled tasks

`@websearch` uses the platform's web-search tool registry. By default it falls
back to the public DuckDuckGo API, and it prefers a configured provider if you
set either `BRAVE_SEARCH_API_KEY` or `SERPAPI_API_KEY` (or
`PALETTE_WEBSEARCH_PROVIDER`).

Examples:

```text
@websearch what is the highest grossing movie globally this year?
@websearch find today's biggest tech news and save a summary to /home/vaibhav/doc/tech-news.txt
@websearch sources
```

The search tool keeps source metadata for the latest result. If a message asks
for sources or says “where did you get this information,” Palette can cite the
most recent web-search sources without inventing URLs.

Scheduled routines are managed by the scheduler and can be reviewed in
Settings → Routines.

## GitHub pull-request conflict resolution

GitHub tools require the GitHub CLI to be installed and authenticated
(`gh auth login`). In Settings → Connections, add the local clone path and its
`owner/name`; optionally set a test command for the resolver. The resolver
creates a separate `palette/resolve-pr-*` branch in that clone, asks OpenCode
to resolve the merge conflicts, and shows the resulting diff for approval.
Committing the resolution and pushing its branch are separate actions, each
with its own approval. It never force-pushes or writes directly to the default
branch. OpenCode must be installed and available as `opencode` on `PATH`.

## Verified library versions (Oct 2026, per current docs)

| Package | Pinned | Finding |
|---|---|---|
| Electron | `^44.5.0` (installed 44.6.0) | Latest 3 majors supported. |
| Vercel AI SDK `ai` | **v7** (`^7`, needs Node 22+) | `ToolLoopAgent` exists; per-call `needsApproval` on `tool()` is **deprecated** → use `toolApproval` on the agent/generate call. |
| `@composio/core` / `@composio/vercel` | `^0.13` / `^0.11` | `@composio/vercel@0.11+` supports `ai@^6 \|\| ^7`. REST API is v3.1; manual `execute()` now requires a toolkit version (agentic flows set the skip flag internally). |
| `@opencode-ai/sdk` | `^1.18.35` | `createOpencodeClient({ baseUrl, fetch })` attaches to the local server; session, event subscription, and permission APIs power conflict resolution. |
| electron-vite | `^5.0.0` | Single renderer entry with hash routing (`#app` / `#settings`). |
| electron-builder | `^26` | AppImage + deb, dmg, nsis targets. |

## Composio free-plan counting (source of truth, verified Oct 2026)

Current docs (pricing + updated-pricing pages) say:

- Hobby plan is **hard-capped, no overage billing**: usage pauses at the cap.
- **100K tool calls/mo** with your own OAuth app/API key; **Composio-managed
  (shared) apps cap at 20K/mo** of that allowance.
- **Each tool execution counts once. Meta tools such as tool search are free.**
- **Failed calls don't count.**

The app counts **every attempted Composio call locally** (conservative meter)
and keeps the 15K soft budget / scheduled-vs-interactive split, so small
counting differences can never push anyone over 20K. The Composio dashboard
usage page is the source of truth.

## Security model

- `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` renderers.
- Preload exposes a small `window.app` API only; every IPC payload is
  validated with zod in main. Strict CSP (dev allows localhost HMR).
- Secrets (model keys, Composio keys) must never live in the renderer,
  localStorage, or plain files.

## Repo notes / deviations from the spec

- **Preload is CJS** (`scripts/build-preload.mjs` via esbuild →
  `out/preload/index.cjs`). electron-vite emits ESM (`.mjs`) for
  `"type": "module"` projects, which Electron's **sandboxed** preload loader
  rejects (`Cannot use import statement outside a module`). Chained into
  `build`/`dev` scripts; `preloadPath()` resolves it in both modes.
- electron 44.6.0 installed (caret range above the 44.5.0 pin) — same major, fine.
- `needsApproval` → `toolApproval` (AI SDK v7), per deprecation notice.
- Tray icon uses an empty `nativeImage` placeholder.
