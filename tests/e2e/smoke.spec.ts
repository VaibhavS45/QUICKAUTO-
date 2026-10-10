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
    await expect(shell.getByRole('dialog', { name: 'Settings' })).toBeVisible()
    await expect(shell.getByRole('button', { name: 'General' })).toBeVisible()
    await shell.keyboard.press('Escape')
    await expect(shell.getByRole('dialog', { name: 'Settings' })).toHaveCount(0)
    await expect.poll(() => app.windows().length).toBe(1)

    await shell.getByRole('button', { name: /Account menu for Local profile/ }).click()
    const accountMenu = shell.getByRole('menu')
    await expect(accountMenu.getByRole('menuitem', { name: 'Account settings' })).toBeVisible()
    await expect(accountMenu.getByText('Sign out')).toHaveCount(0)
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
