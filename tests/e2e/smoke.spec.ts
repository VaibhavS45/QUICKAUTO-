import { test, expect, _electron as electron } from '@playwright/test'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const executablePath =
  process.platform === 'darwin'
    ? join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : join(root, 'node_modules/electron/dist/electron')
const mainEntry = join(root, 'out/main/index.js')

/** Fire-and-forget: the second instance signals the first via the lock, then exits. */
function secondInstanceToggle(userDataDir: string): void {
  const child = spawn(executablePath, ['--no-sandbox', `--user-data-dir=${userDataDir}`, mainEntry, '--toggle'], {
    stdio: 'ignore',
    detached: true
  })
  child.unref()
}

async function launchPalette(extraArgs: string[] = []) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'palette-e2e-'))
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', `--user-data-dir=${userDataDir}`, mainEntry, ...extraArgs],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  return {
    app,
    userDataDir,
    async close(): Promise<void> {
      await app.close()
      rmSync(userDataDir, { recursive: true, force: true })
    }
  }
}

test('CalTen smoke: calendar first, palette toggle, @calendar draft', async () => {
  const instance = await launchPalette()
  const { app } = instance
  try {
    const visibleWindows = (): Promise<number> =>
      app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter((w) => w.isVisible()).length)

    // The shell app and calendar open on launch; the palette stays hidden.
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(3)
    await expect.poll(visibleWindows, { timeout: 30_000 }).toBe(2)
    await expect.poll(() => app.windows().some((page) => page.url().includes('#calendar')), { timeout: 30_000 }).toBe(true)

    const pages = app.windows()
    const calendar = pages.find((p) => p.url().includes('#calendar')) ?? pages[0]!
    const palette = pages.find((p) => p.url().includes('#palette')) ?? pages[0]!
    const shell = pages.find((p) => p.url().includes('#app'))
    expect(shell).toBeDefined()
    await expect(shell!.getByText('Shell')).toBeVisible()
    await calendar.waitForLoadState('domcontentloaded')
    await expect(calendar.getByText('CalTen').first()).toBeVisible()
    await expect(calendar.getByRole('button', { name: 'Today', exact: true })).toBeVisible()

    // --toggle shows the hidden palette (covers the Wayland fallback path too).
    secondInstanceToggle(instance.userDataDir)
    await expect.poll(visibleWindows, { timeout: 30_000 }).toBe(3)

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

    // Nothing clipped: the last autocomplete option must end inside the
    // palette content bounds (Bug A regression: fixed 120px window).
    const lastOption = palette.getByRole('button', { name: '@sheet' }).first()
    await expect(lastOption).toBeVisible()
    const optionBox = await lastOption.boundingBox()
    const contentHeight = await paletteHeight()
    expect(optionBox).not.toBeNull()
    expect(optionBox!.y + optionBox!.height).toBeLessThanOrEqual(contentHeight + 1)

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
    await instance.close()
  }
})

test('CalTen cold start: @calendar draft lands 20 times in a row', async () => {
  test.setTimeout(300_000)
  const instance = await launchPalette()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(3)
    const palette = app.windows().find((p) => p.url().includes('#palette')) ?? app.windows()[0]!
    secondInstanceToggle(instance.userDataDir)
    const input = palette.getByPlaceholder(/Type @ for tools/)
    await input.click()

    const calendarCount = (): Promise<number> =>
      Promise.resolve(app.windows().filter((p) => p.url().includes('#calendar')).length)

    for (let i = 0; i < 20; i++) {
      const text = `cold draft ${i}`
      // Cold start: no calendar window at all when the draft is submitted.
      for (const p of app.windows().filter((w) => w.url().includes('#calendar'))) {
        await p.close()
      }
      await expect.poll(calendarCount, { timeout: 15_000 }).toBe(0)

      await input.fill(`@calendar ${text}`)
      await input.press('Enter')

      // Window recreated; the draft must appear even though the
      // ready-to-show push fired before the renderer mounted (take-draft pull).
      await expect.poll(calendarCount, { timeout: 15_000 }).toBe(1)
      const calendar = app.windows().find((w) => w.url().includes('#calendar'))!
      await expect(calendar.getByText(text)).toBeVisible({ timeout: 15_000 })

      // Single-consumption invariant: whichever path won (push or pull),
      // a second take must come back empty — the draft is never duplicated.
      const secondTake = await calendar.evaluate(() => window.palette.takeCalendarDraft())
      expect(secondTake).toEqual({ draft: null })
    }
  } finally {
    await instance.close()
  }
})

test('settings can open to a requested registered tab', async () => {
  const instance = await launchPalette()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().some((page) => page.url().includes('#app')), { timeout: 30_000 }).toBe(true)
    const shell = app.windows().find((page) => page.url().includes('#app'))!
    await shell.evaluate(() => window.palette.openSettingsWindow('general'))
    await expect.poll(() => app.windows().some((page) => page.url().includes('#settings?tab=general'))).toBe(true)
  } finally {
    await instance.close()
  }
})

test('tray-only --toggle launch does not open the app or calendar', async () => {
  const instance = await launchPalette(['--toggle'])
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    expect(app.windows().some((page) => page.url().includes('#app'))).toBe(false)
    expect(app.windows().some((page) => page.url().includes('#calendar'))).toBe(false)
  } finally {
    await instance.close()
  }
})
