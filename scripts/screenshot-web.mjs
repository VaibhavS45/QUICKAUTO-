import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const outDir = '/tmp/opencode/shots'
mkdirSync(outDir, { recursive: true })
const base = process.env.BASE_URL ?? 'http://localhost:5173'

const browser = await chromium.launch()

async function shot(name) {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${outDir}/${name}.png` })
  console.log('saved', name)
}

const page = await browser.newPage({ viewport: { width: 1366, height: 768 } })

await page.goto(base, { waitUntil: 'networkidle' })
await shot('web-01-automate')

const labels = await page.locator('button').all()
if (process.env.DEBUG_BTNS) {
  for (const b of labels) console.log('BTN:', (await b.getAttribute('aria-label')) || (await b.textContent()))
}

async function clickNav(label) {
  await page.getByRole('button', { name: label, exact: true }).first().click()
  await page.waitForTimeout(900)
}

await clickNav('Updates')
await shot('web-02-updates')

await clickNav('Manage')
await shot('web-03-manage')

// Manage detail: click the first manage row if present
const firstRow = page.locator('.manage-row, .automations-day-item, .st-card, .st-row').first()
if (await firstRow.count()) {
  await firstRow.click()
  await page.waitForTimeout(900)
}
await shot('web-04-manage-detail')

await page.locator('body').press('Control+z').catch(() => {})
await clickNav('Canvas')
await shot('web-05-canvas')

// Settings on the web builds open in-page via openSettings stub -> check both
// the hash route and the in-app dialog.
await page.goto(`${base}/#settings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1200)
await shot('web-06-settings')

// Appearance tab
const appearance = page.getByRole('button', { name: 'Appearance', exact: true })
if (await appearance.count()) {
  await appearance.first().click()
  await page.waitForTimeout(700)
  await shot('web-07-settings-appearance')
  // Toggle the animated background off/on
  const toggle = page.locator('.set-switch, [role="switch"]').first()
  if (await toggle.count()) {
    await toggle.click()
    await page.waitForTimeout(700)
    await shot('web-08-appearance-shader-off')
    await toggle.click()
    await page.waitForTimeout(400)
  }
  // Day mode
  const day = page.locator('[role="radio"]').first()
  if (await day.count()) {
    await day.click()
    await page.waitForTimeout(1500)
    await shot('web-09-day-settings')
    await page.goto(base, { waitUntil: 'networkidle' })
    await page.waitForTimeout(900)
    await shot('web-09-day-automate')
  }
}

await browser.close()
