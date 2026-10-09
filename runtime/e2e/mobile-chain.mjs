import { chromium } from 'playwright'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1200)
await page.locator('.chain__toggle').scrollIntoViewIfNeeded()
await page.locator('.chain__toggle').click()
await page.waitForTimeout(400)
const list = page.locator('.chain__list')
await list.scrollIntoViewIfNeeded()
await page.waitForTimeout(200)
await page.screenshot({ path: path.join(OUT, 'mobile-chain-expanded.png') })
// click the region-entry rule node to show its detail
const nodes = page.locator('.chain__node')
const n = await nodes.count()
for (let i = 0; i < n; i++) {
  const t = (await nodes.nth(i).innerText()).replace(/\s+/g, ' ')
  console.log(i, t)
}
await nodes.nth(3).click()
await page.waitForTimeout(300)
await list.scrollIntoViewIfNeeded()
await page.screenshot({ path: path.join(OUT, 'mobile-chain-node.png') })
await browser.close()
