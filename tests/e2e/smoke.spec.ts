import { test, expect, _electron as electron } from '@playwright/test'
import { spawn, execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const executablePath = join(root, 'node_modules/electron/dist/electron')
const mainEntry = join(root, 'out/main/index.js')

/** Orphaned helpers from an interrupted run hold the single-instance lock. */
function killStaleTestInstances(): void {
  // 'out/mai[n]' matches absolute, relative, and launcher command lines
  // (pkill -f uses regex: 'mai[n]' matches 'main' but not the bracketed self).
  for (const pattern of ['out/mai[n]', 'quickauto --togg[l]e']) {
    try {
      execSync(`pkill -f "${pattern}"`)
    } catch {
      /* no stale processes — pkill exits 1 */
    }
  }
}

/** Fire-and-forget: the second instance signals the first via the lock, then exits. */
function secondInstanceToggle(): void {
  const child = spawn(executablePath, [mainEntry, '--no-sandbox', '--toggle'], {
    stdio: 'ignore',
    detached: true
  })
  child.unref()
}

test('M1 smoke: toggle via CLI, @ autocomplete, submit, @calendar draft', async () => {
  killStaleTestInstances()
  const app = await electron.launch({
    executablePath,
    args: [mainEntry, '--no-sandbox'],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  try {
    const palette = await app.firstWindow()

    // Palette starts hidden; second-instance --toggle shows it (also covers the
    // Wayland fallback path, where the global hotkey may not exist).
    const visibleWindows = (): Promise<number> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length)
    await expect.poll(visibleWindows).toBe(0)
    secondInstanceToggle()
    await expect.poll(visibleWindows, { timeout: 30_000 }).toBeGreaterThan(0)

    const input = palette.getByPlaceholder(/Type @ for tools/)
    await input.click()
    await input.fill('@')
    await expect(palette.getByRole('button', { name: /@gmail/ }).first()).toBeVisible()
    // Alias @email resolves to @gmail.
    await input.fill('@ema')
    await expect(palette.getByRole('button', { name: /@email/ }).first()).toBeVisible()

    // Chained tools + natural language submit (M1: placeholder result, no agent yet).
    await input.fill('@websearch hello @gmail world')
    await expect(palette.getByText('@websearch', { exact: true }).first()).toBeVisible()
    await input.press('Enter')
    await expect(palette.getByText(/would have used: @websearch, @gmail/)).toBeVisible()

    // Up arrow recalls history.
    await input.fill('')
    await input.press('ArrowUp')
    await expect(input).toHaveValue('@websearch hello @gmail world')

    // @calendar opens the calendar window with the trailing text as a draft.
    const calendarOpened = app.waitForEvent('window')
    await input.fill('@calendar buy milk Friday 9am')
    await input.press('Enter')
    const calendar = await calendarOpened
    await calendar.waitForLoadState('domcontentloaded')
    await expect(calendar.getByText('buy milk Friday 9am')).toBeVisible()
  } finally {
    await app.close()
  }
})
