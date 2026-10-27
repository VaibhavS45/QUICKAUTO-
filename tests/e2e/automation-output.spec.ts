import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

/**
 * Live check that an automation run returns OpenCode's answer text into the run
 * log (the Run output card). Needs the real `opencode` CLI with a working
 * provider, so it is opt-in: RUN_LIVE_ACP=1 npx playwright test automation-output
 */
const live = process.env['RUN_LIVE_ACP'] === '1'
test.skip(!live, 'set RUN_LIVE_ACP=1 to run against the real opencode CLI')

test('an automation test-run records OpenCode text in its run log', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'app-e2e-out-'))
  const app = await electron.launch({
    executablePath: join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'),
    args: ['--no-sandbox', `--user-data-dir=${userDataDir}`, root],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!
    // Give the first-run auto-pick a moment to record the opencode engine.
    const created = await shell.evaluate(async () => {
      const api = (window as unknown as { app: Record<string, (...a: unknown[]) => Promise<unknown>> }).app
      return api.automationsCreate!({
        kind: 'schedule',
        title: 'Output check',
        prompt: 'Tell me the weather in Bengaluru in one sentence.',
        schedule: { type: 'daily', time: '09:00' }
      })
    })
    const id = (created as { automation?: { id?: string } }).automation?.id ?? ''
    expect(id.length).toBeGreaterThan(0)
    const started = await shell.evaluate(async (aid) => {
      const api = (window as unknown as { app: Record<string, (...a: unknown[]) => Promise<unknown>> }).app
      return api.automationsTestRun!(aid)
    }, id)
    console.log('START', JSON.stringify(started))

    let summary = ''
    await expect
      .poll(
        async () => {
          const runs = (await shell.evaluate(async (aid) => {
            const api = (window as unknown as { app: Record<string, (...a: unknown[]) => Promise<unknown>> }).app
            return api.automationsRuns!(aid)
          }, id)) as { runs?: Array<{ status: string; summary?: string }> }
          const finished = (runs.runs ?? []).find((r) => r.status !== 'running')
          summary = finished?.summary ?? ''
          return finished ? `${finished.status}:${summary.slice(0, 80)}` : 'pending'
        },
        { timeout: 120_000, intervals: [1000] }
      )
      .not.toBe('pending')
    console.log('RESULT', summary)
    expect(summary.length).toBeGreaterThan(0)
  } finally {
    await app.close()
    rmSync(userDataDir, { recursive: true, force: true })
  }
})
