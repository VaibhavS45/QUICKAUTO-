import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

// Settings-window matrix: 7 tabs x (night, day) x (880x620, full shell size).
// NOTE: one fresh page per shot — a same-page goto that only changes the hash
// is a same-document navigation, so the tab state would stay on the first tab.
const outDir = '/tmp/opencode/shots'
mkdirSync(outDir, { recursive: true })
const base = process.env.BASE_URL ?? 'http://localhost:5173'

const TABS = ['general', 'appearance', 'account', 'agents', 'connectors', 'usage', 'mcp']
const THEMES = ['dark', 'light']
const SIZES = [
  { tag: 'sm', width: 880, height: 620 },
  { tag: 'lg', width: 1366, height: 768 }
]

const browser = await chromium.launch()

for (const theme of THEMES) {
  for (const size of SIZES) {
    for (const tab of TABS) {
      const page = await browser.newPage({ viewport: { width: size.width, height: size.height } })
      await page.goto(`${base}/?theme=${theme}#settings?tab=${tab}`, { waitUntil: 'networkidle' })
      await page.waitForTimeout(750)
      const name = `settings-${theme}-${size.tag}-${tab}`
      await page.screenshot({ path: `${outDir}/${name}.png` })
      console.log('saved', name)
      await page.close()
    }
  }
}

await browser.close()
