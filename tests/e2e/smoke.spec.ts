import { test, expect, _electron as electron } from '@playwright/test'
import { spawn, execSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const executablePath =
  process.platform === 'darwin'
    ? join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : join(root, 'node_modules/electron/dist/electron')
const mainEntry = join(root, 'out/main/index.js')

/** Orphaned helpers from an interrupted run hold the single-instance lock. */
function killStaleTestInstances(): void {
  try {
    execSync(`pkill -f "${mainEntry}"`)
  } catch {
    /* no stale processes — pkill exits 1 */
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

test('CalTen smoke: calendar first, palette toggle, @calendar draft', async () => {
  killStaleTestInstances()
  const app = await electron.launch({
    executablePath,
    args: [mainEntry, '--no-sandbox'],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  try {
    const visibleWindows = (): Promise<number> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length)

    // Calendar-first: CalTen opens visible, palette stays hidden.
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(2)
    await expect.poll(visibleWindows, { timeout: 30_000 }).toBe(1)
    await expect.poll(() => app.windows().some((page) => page.url().includes('#calendar')), { timeout: 30_000 }).toBe(true)

    const pages = app.windows()
    const calendar = pages.find((p) => p.url().includes('#calendar')) ?? pages[0]!
    const palette = pages.find((p) => p !== calendar) ?? pages[0]!
    await calendar.waitForLoadState('domcontentloaded')
    await expect(calendar.getByText('CalTen').first()).toBeVisible()
    await expect(calendar.getByRole('button', { name: 'Today', exact: true })).toBeVisible()

    // --toggle shows the hidden palette (covers the Wayland fallback path too).
    secondInstanceToggle()
    await expect.poll(visibleWindows, { timeout: 30_000 }).toBe(2)

    const input = palette.getByPlaceholder(/Type @ for tools/)
    await input.click()
    await input.fill('@')
    await expect(palette.getByRole('button', { name: /@gmail/ }).first()).toBeVisible()

    // Prompt 0: the palette window auto-resizes to fit content (was fixed 120px).
    const paletteHeight = (): Promise<number> =>
      app.evaluate(({ BrowserWindow }) => {
        const wins = BrowserWindow.getAllWindows()
        const pal = wins.find((w) => w.webContents.getURL().includes('#palette'))
        return pal ? pal.getContentBounds().height : -1
      })
    await expect.poll(paletteHeight, { timeout: 10_000 }).toBeGreaterThan(120)

    // Alias @email resolves to @gmail.
    await input.fill('@ema')
    await expect(palette.getByRole('button', { name: /@email/ }).first()).toBeVisible()

    // Chained tools + natural language submit starts an agent run. With no API
    // key configured in the test env, the run fails with a clear message
    // (never silently, never crashing the window).
    await input.fill('@websearch hello @gmail world')
    await expect(palette.getByText('@websearch', { exact: true }).first()).toBeVisible()
    await input.press('Enter')
    await expect(palette.getByText(/No model API key set/)).toBeVisible({ timeout: 30_000 })

    // @calendar sends the trailing text as a draft to the open calendar window.
    await input.fill('@calendar buy milk Friday 9am')
    await input.press('Enter')
    await expect(calendar.getByText('buy milk Friday 9am')).toBeVisible()
  } finally {
    await app.close()
  }
})
