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
  await shell.getByPlaceholder(/Describe what Palette should do/).fill(task)
  await shell.getByRole('button', { name: 'Create', exact: true }).click()
}

async function createCanvasTask(shell: import('@playwright/test').Page, task: string): Promise<void> {
  await shell.getByRole('button', { name: 'Canvas' }).click()
  await shell.getByRole('button', { name: 'Create', exact: true }).click()
  await shell.getByRole('button', { name: 'Add first step' }).click()
  await shell.getByRole('dialog', { name: 'Add first step' }).getByRole('button', { name: /^Schedule/ }).click()
  await shell.getByRole('button', { name: 'Add step at the end' }).click()
  await shell.getByRole('dialog', { name: 'Add step at the end' }).getByRole('button', { name: /^Gmail/ }).click()
  await shell.getByRole('button', { name: /^Configure step 2/ }).click()
  await shell.getByPlaceholder('What should this step do?').fill(task)
  await shell.getByRole('button', { name: 'Apply' }).click()
  await shell.getByRole('button', { name: 'Create', exact: true }).click()
  await expect
    .poll(async () => {
      const res = await shell.evaluate(async () => window.app.automationsList())
      return res.ok ? res.automations?.length ?? 0 : -1
    }, { timeout: 20_000 })
    .toBe(1)
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

test('the canvas edits a stored canvas automation and writes edits back', async () => {
  const instance = await launch()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await createCanvasTask(shell, 'weather in bangalore')

    await shell.getByRole('button', { name: 'All canvases' }).click()
    await shell.getByRole('button', { name: 'Edit weather in bangalore' }).click()
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

    // Editing writes back to the same automation instead of making another.
    const stored = await shell.evaluate(async () => window.app.automationsList())
    expect(stored.automations).toHaveLength(1)

    await shell.getByRole('button', { name: 'Manage' }).click()
    await expect(shell.getByRole('button', { name: 'Open weather in bangalore' })).toBeVisible({ timeout: 15_000 })
    await expect(shell.locator('.st-grid')).toHaveCount(1)
  } finally {
    await instance.close()
  }
})

test('the canvas saves the open automation instead of creating another', async () => {
  const instance = await launch()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await createCanvasTask(shell, 'weather in bangalore')

    // An automation is open: the header saves it, it no longer offers Create.
    await expect(shell.getByRole('button', { name: 'Save' })).toBeVisible({ timeout: 15_000 })
    await expect(shell.getByRole('button', { name: 'Create', exact: true })).toHaveCount(0)
    await shell.getByRole('button', { name: 'Save' }).click()

    const stored = await shell.evaluate(async () => window.app.automationsList())
    expect(stored.automations).toHaveLength(1)

    // Clicking the Canvas nav drops the open id: show the chooser with the
    // saved automation, never a phantom blank graph.
    await shell.getByRole('button', { name: 'Canvas', exact: true }).click()
    await expect(shell.getByRole('button', { name: 'Edit weather in bangalore' })).toBeVisible({ timeout: 15_000 })
    await expect(shell.getByText('New automation')).toHaveCount(0)

    await shell.getByRole('button', { name: 'Manage' }).click()
    await expect(shell.getByRole('button', { name: 'Open weather in bangalore' })).toBeVisible({ timeout: 15_000 })
  } finally {
    await instance.close()
  }
})

test('the canvas creates an automation that shows in Manage and reopens on the canvas', async () => {
  const instance = await launch()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await createCanvasTask(shell, 'Summarize my unread mail')

    const stored = await shell.evaluate(async () => window.app.automationsList())
    const automation = stored.automations?.[0]
    expect(automation?.kind).toBe('advanced')
    expect(automation?.title).toBe('Summarize my unread mail')
    expect(automation?.prompt).toContain('Summarize my unread mail')
    expect(automation?.connectors).toContain('gmail')
    expect(automation?.schedule?.type).toBe('daily')

    await shell.getByRole('button', { name: 'Manage' }).click()
    await shell.getByRole('button', { name: 'Open Summarize my unread mail' }).click()
    await expect(shell.getByRole('button', { name: 'Configure step 2 Action' })).toContainText('Summarize my unread mail')
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
    await shell.getByRole('menuitem', { name: 'Gmail' }).click()
    await shell.getByRole('menuitem', { name: 'New conversation' }).click()
    await shell.getByPlaceholder(/Describe what Palette should do/).fill('summarize new mail')
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
