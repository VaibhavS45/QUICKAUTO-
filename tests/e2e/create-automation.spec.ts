import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const executablePath =
  process.platform === 'darwin'
    ? join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : join(root, 'node_modules/electron/dist/electron')

async function launch() {
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

async function createTask(shell: import('@playwright/test').Page, task: string, repeat?: string, weekday?: string): Promise<void> {
  await shell.getByRole('button', { name: /^Schedule/ }).first().click()
  await expect(shell.getByRole('dialog', { name: 'Create automation' })).toBeVisible({ timeout: 15_000 })
  if (repeat) {
    await shell.getByRole('button', { name: 'Repeat' }).click()
    await shell.getByRole('menuitem', { name: repeat }).click()
  }
  if (weekday) {
    await shell.getByRole('group', { name: 'Days of the week' }).getByRole('button', { name: weekday }).click()
  }
  await shell.getByPlaceholder(/Describe what Manus should do/).fill(task)
  await shell.getByRole('button', { name: 'Create', exact: true }).click()
}

test('a scheduled task created in the form stores the picks it shows', async () => {
  const instance = await launch()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await createTask(shell, 'weather in bangalore')
    await expect
      .poll(async () => {
        const res = await shell.evaluate(async () => window.app.automationsList())
        return res.ok ? res.automations?.length ?? 0 : -1
      }, { timeout: 20_000 })
      .toBe(1)

    const stored = await shell.evaluate(async () => window.app.automationsList())
    const automation = stored.automations?.[0]
    console.log('DAILY', JSON.stringify(automation?.schedule))
    expect(automation?.prompt).toBe('weather in bangalore')
    expect(automation?.schedule?.type).toBe('daily')
    expect(automation?.schedule?.time).toBe('09:00')
  } finally {
    await instance.close()
  }
})

test('a weekly task keeps the picked weekdays', async () => {
  const instance = await launch()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await createTask(shell, 'summarize the news', 'Weekly', 'Tue')
    await expect
      .poll(async () => {
        const res = await shell.evaluate(async () => window.app.automationsList())
        return res.ok ? res.automations?.length ?? 0 : -1
      }, { timeout: 20_000 })
      .toBe(1)

    const stored = await shell.evaluate(async () => window.app.automationsList())
    console.log('WEEKLY', JSON.stringify(stored.automations?.[0]?.schedule))
    expect(stored.automations?.[0]?.schedule?.type).toBe('weekly')
    expect(stored.automations?.[0]?.schedule?.weekdays).toEqual([2])
  } finally {
    await instance.close()
  }
})

test('the canvas shows the stored task and writes edits back', async () => {
  const instance = await launch()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await createTask(shell, 'weather in bangalore')
    await expect
      .poll(async () => {
        const res = await shell.evaluate(async () => window.app.automationsList())
        return res.ok ? res.automations?.length ?? 0 : -1
      }, { timeout: 20_000 })
      .toBe(1)

    await shell.getByRole('button', { name: 'Canvas' }).click()
    const node = shell.getByRole('button', { name: /Configure step 2/ })
    await expect(node).toBeVisible({ timeout: 15_000 })
    await expect(node).toContainText('weather in bangalore')

    await node.click()
    const field = shell.getByPlaceholder('What should this step do?')
    await field.fill('weather in bengaluru today')
    await shell.getByRole('button', { name: 'Apply' }).click()

    await expect
      .poll(async () => {
        const res = await shell.evaluate(async () => window.app.automationsList())
        return res.ok ? res.automations?.[0]?.prompt ?? '' : ''
      }, { timeout: 20_000 })
      .toBe('weather in bengaluru today')
  } finally {
    await instance.close()
  }
})

test('a triggered task folds the app event into the prompt and the connectors', async () => {
  const instance = await launch()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await shell.getByRole('button', { name: /^Triggered task/ }).first().click()
    await expect(shell.getByRole('dialog', { name: 'Create automation' })).toBeVisible({ timeout: 15_000 })
    await shell.getByRole('button', { name: '+ Add Trigger' }).click()
    await shell.getByRole('menuitem', { name: 'New conversation' }).click()
    await shell.getByPlaceholder(/Describe what Manus should do/).fill('summarize new mail')
    await shell.getByRole('button', { name: 'Create', exact: true }).click()

    await expect
      .poll(async () => {
        const res = await shell.evaluate(async () => window.app.automationsList())
        return res.ok ? res.automations?.length ?? 0 : -1
      }, { timeout: 20_000 })
      .toBe(1)

    const stored = await shell.evaluate(async () => window.app.automationsList())
    const automation = stored.automations?.[0]
    console.log('TRIGGERED', JSON.stringify(automation))
    expect(automation?.prompt).toContain('check @gmail')
    expect(automation?.connectors).toContain('gmail')
    expect(automation?.schedule?.type).toBe('daily')
  } finally {
    await instance.close()
  }
})
