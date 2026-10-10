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
async function launchApp(extraArgs: string[] = []) {
  const userDataDir = mkdtempSync(join(tmpdir(), 'app-e2e-'))
  const app = await electron.launch({
    executablePath,
    args: ['--no-sandbox', `--user-data-dir=${userDataDir}`, root, ...extraArgs],
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

test('the app opens directly into the shell', async () => {
  const instance = await launchApp()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!
    await expect(shell).toHaveURL(/#app$/)
    await expect(shell.getByRole('heading', { name: 'What can I help with?' })).toBeVisible()
    await expect(shell.getByRole('button', { name: 'New chat' })).toBeVisible()
  } finally {
    await instance.close()
  }
})

test('shell navigation, shortcuts, and local account menu work', async () => {
  const instance = await launchApp()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!

    await shell.locator('body').press('Control+b')
    await expect(shell.locator('main.shell-frame')).toHaveClass(/is-collapsed/)
    await shell.locator('body').press('Control+b')
    await expect(shell.locator('main.shell-frame')).not.toHaveClass(/is-collapsed/)

    await shell.getByRole('button', { name: 'Automations' }).click()
    await expect(shell.getByText('Automations are coming soon.')).toBeVisible()
    await shell.locator('body').press('Control+n')
    await expect(shell.getByRole('heading', { name: 'What can I help with?' })).toBeVisible()

    await shell.locator('body').press('Control+,')
    await expect.poll(() => app.windows().length).toBe(2)
    await expect(app.windows().find((page) => page.url().includes('#settings'))!).toHaveURL(/#settings$/)
    await app.windows().find((page) => page.url().includes('#settings'))?.close()

    await shell.getByRole('button', { name: /Account menu for Local profile/ }).click()
    const accountMenu = shell.getByRole('menu')
    await expect(accountMenu.getByRole('menuitem', { name: 'Account settings' })).toBeVisible()
    await expect(accountMenu.getByText('Sign out')).toHaveCount(0)
  } finally {
    await instance.close()
  }
})

test('chat messages persist and reopen from recent chats', async () => {
  const instance = await launchApp()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!
    const composer = shell.getByRole('textbox', { name: 'Message your assistant' })
    await composer.press('Enter')
    await expect(shell.getByRole('button', { name: 'Show all chats' })).toHaveCount(0)

    await composer.fill('A persisted chat prompt')
    await composer.press('Enter')
    const thread = shell.getByRole('button', { name: 'A persisted chat prompt', exact: true })
    await expect(thread).toBeVisible({ timeout: 15_000 })
    await expect(shell.locator('.chat-message.is-user')).toContainText('A persisted chat prompt')
    await expect(shell.getByRole('alert')).toContainText('No model API key set', { timeout: 15_000 })
    await expect(shell.getByRole('button', { name: /A persisted chat prompt — failed/ })).toBeVisible()

    await shell.reload()
    await expect(shell.getByRole('button', { name: 'A persisted chat prompt', exact: true })).toBeVisible()
    await shell.getByRole('button', { name: 'A persisted chat prompt', exact: true }).click()
    await expect(shell.locator('.chat-message.is-user')).toContainText('A persisted chat prompt')
  } finally {
    await instance.close()
  }
})

test('today empty state navigates to automations and notifications persist', async () => {
  const instance = await launchApp()
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(1)
    const shell = app.windows()[0]!
    await expect(shell.getByText('Nothing scheduled today.')).toBeVisible()
    await shell.getByRole('button', { name: 'Create automation' }).click()
    await expect(shell.getByText('Automations are coming soon.')).toBeVisible()

    const created = await shell.evaluate(async () => window.app.notificationCreate({
      kind: 'info',
      title: 'Persisted notice',
      body: 'Saved in the app store.'
    }))
    expect(created.ok).toBe(true)
    await shell.getByRole('button', { name: /Notifications/ }).click()
    await expect(shell.getByRole('region', { name: 'Notifications' }).getByText('Persisted notice')).toBeVisible()
    await shell.reload()
    await shell.getByRole('button', { name: /Notifications/ }).click()
    await expect(shell.getByRole('region', { name: 'Notifications' }).getByText('Persisted notice')).toBeVisible()
  } finally {
    await instance.close()
  }
})

test('tray-only --background launch does not open the shell window', async () => {
  const instance = await launchApp(['--background'])
  const { app } = instance
  try {
    await expect.poll(() => app.windows().length, { timeout: 30_000 }).toBe(0)
  } finally {
    await instance.close()
  }
})
