import { _electron as electron } from '@playwright/test'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const executablePath =
  process.platform === 'darwin'
    ? join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
    : join(root, 'node_modules/electron/dist/electron')

const outDir = join('/tmp/opencode/shots')
mkdirSync(outDir, { recursive: true })

const userDataDir = mkdtempSync(join(tmpdir(), 'shots-e2e-'))
const app = await electron.launch({
  executablePath,
  args: ['--no-sandbox', `--user-data-dir=${userDataDir}`, root],
  env: { ...process.env, NODE_ENV: 'test' }
})

const win = await (async () => {
  await app.firstWindow()
  return app.windows()[0]
})()

await win.waitForTimeout(4000)
await win.setViewportSize?.({ width: 1180, height: 820 })
await win.waitForTimeout(500)

async function shot(name) {
  await win.waitForTimeout(600)
  await win.screenshot({ path: join(outDir, name) })
  console.log('saved', join(outDir, name))
}

async function clickNav(label) {
  const btn = win.getByRole('button', { name: label })
  await btn.first().click()
  await win.waitForTimeout(900)
}

await shot('01-automate.png')

await clickNav('Updates tab').catch(() => clickNav('Updates'))
await shot('02-updates.png')

await clickNav('Manage tab').catch(() => clickNav('Manage'))
await shot('03-manage.png')

// Settings -> Appearance
await win.locator('body').press('Control+,')
await win.waitForTimeout(900)
const appearance = win.getByRole('button', { name: 'Appearance' })
await appearance.first().click()
await win.waitForTimeout(700)
await shot('04-settings-appearance.png')

// Day theme from the Appearance panel (radiogroup)
const day = win.getByRole('radio', { name: 'Day' })
if (await day.count()) {
  await day.click()
  await win.waitForTimeout(900)
  await win.screenshot({ path: join(outDir, '05-settings-appearance-day.png') })
  console.log('saved day shot')
}

await app.close()
rmSync(userDataDir, { recursive: true, force: true })
