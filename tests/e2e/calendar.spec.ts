import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const executablePath = join(root, 'node_modules/electron/dist/electron')

async function launchApp() {
  const userDataDir = mkdtempSync(join(tmpdir(), 'app-e2e-'))
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', `--user-data-dir=${userDataDir}`, root],
    env: { ...process.env, NODE_ENV: 'test' }
  })
  return {
    app,
    async close(): Promise<void> {
      await app.close()
      rmSync(userDataDir, { recursive: true, force: true })
    }
  }
}

test('manage calendar shows created automations and dragging a card moves it to another slot', async () => {
  const instance = await launchApp()
  try {
    const app = instance.app
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await shell.getByRole('button', { name: 'Manage' }).click()
    await shell.getByRole('tab', { name: 'Calendar' }).click()

    const created = await shell.evaluate(async () => window.app.routineCreate('Backup photos daily at 7:30am'))
    expect(created.ok).toBe(true)
    await shell.evaluate(async () => window.app.routineCreate('Review weekly metrics every Friday at 4:00pm'))

    await expect.poll(() => shell.locator('.wc-card').count(), { timeout: 10_000 }).toBeGreaterThanOrEqual(2)
    await expect(shell.locator('.wc-card').filter({ hasText: 'Review weekly metrics' })).toHaveCount(1)

    const gridWidth = await shell.evaluate(() => document.querySelector('.wc-grid')!.getBoundingClientRect().width)
    const colW = (gridWidth - 64) / 7

    const beforeDay = await shell.evaluate(async ({ colW }: { colW: number }) => {
      const cards = Array.from(document.querySelectorAll<HTMLElement>('.wc-card'))
      const target = cards.find((c) => {
        const label = c.getAttribute('aria-label') || ''
        return /Backup photos/.test(label) && !/\bSaturday\b/.test(label)
      })
      if (!target) return null
      const match = target.getAttribute('aria-label')!.match(/\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/)
      if (!match) return null
      const rect = target.getBoundingClientRect()
      const sx = rect.left + rect.width / 2
      const sy = rect.top + rect.height / 2
      const pointer = (type: string, x: number, y: number) =>
        new PointerEvent(type, { bubbles: true, cancelable: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
      target.dispatchEvent(pointer('pointerdown', sx, sy))
      window.dispatchEvent(pointer('pointermove', sx + colW * 1.05, sy))
      window.dispatchEvent(pointer('pointerup', sx + colW * 1.05, sy))
      return match[1]
    }, { colW })

    expect(beforeDay).not.toBeNull()

    // Drag drops onto a new slot and the spring settles within a few frames.
    await expect.poll(async () => {
      const labels = await shell.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('.wc-card')).map((c) => c.getAttribute('aria-label') || '')
      )
      return labels.find((label) => /Backup photos/.test(label) && !label.includes(` ${beforeDay} `) && label.includes(' 7:00 AM'))
    }, { timeout: 5000 }).toBeTruthy()

    expect(await shell.locator('.wc-card').count()).toBe(2)

    await shell.screenshot({ path: '/tmp/opencode/calendar-qa/e2e-manage-calendar.png', fullPage: true })
  } finally {
    await instance.close()
  }
})

test('updates calendar branch renders without crashing', async () => {
  const instance = await launchApp()
  try {
    const app = instance.app
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await shell.getByRole('button', { name: 'Updates' }).click()
    await shell.getByRole('tab', { name: 'Calendar' }).click()

    await expect(shell.locator('.wc-grid')).toBeVisible()
    await shell.screenshot({ path: '/tmp/opencode/calendar-qa/e2e-updates-calendar.png', fullPage: true })
  } finally {
    await instance.close()
  }
})
