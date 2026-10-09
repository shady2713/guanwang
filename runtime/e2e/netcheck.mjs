import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
const browser = await chromium.launch({ executablePath: EXE })
const page = await browser.newPage({ viewport: { width: 1360, height: 800 } })
const bad = []
page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`) })
page.on('requestfailed', (r) => bad.push(`FAILED ${r.url()} ${r.failure()?.errorText}`))
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1500)
for (const i of [1, 2]) {
  await page.locator('.task-tabs [role=tab]').nth(i).click()
  await page.waitForTimeout(1200)
}
await page.goto(BASE + 'demo/', { waitUntil: 'load' })
await page.waitForTimeout(800)
console.log(bad.length ? bad.join('\n') : 'no failing requests')
await browser.close()
