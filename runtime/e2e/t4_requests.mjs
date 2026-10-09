// T4 (H19): only ONE .web.mp4 is fetched on a fresh load; tab switch fetches the next one
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178'
const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 } })
const page = await ctx.newPage()
const reqs = []
page.on('request', (r) => reqs.push(`${r.method()} ${r.resourceType()} ${r.url()}`))
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 8000 })
await page.waitForTimeout(2500)
const fresh = reqs.slice()
const mp4 = fresh.filter((u) => u.includes('.web.mp4'))
console.log(`### T4 [${BASE}]`)
console.log('FRESH LOAD total requests:', fresh.length)
console.log('FRESH LOAD mp4 requests:', mp4.length)
mp4.forEach((u) => console.log('   ', u))
console.log('full fresh request list:')
fresh.forEach((u) => console.log('   ', u))
const tabs = await page.locator('.task-tabs [role="tab"]').all()
for (let i = 0; i < tabs.length; i++) {
  reqs.length = 0
  const label = (await tabs[i].textContent()).trim()
  if (i === 0) { console.log('\n(already on tab 0; switching to 行业场景 for a second visit)'); }
  await tabs[i].click()
  await page.waitForTimeout(2000)
  const m = reqs.filter((u) => u.includes('.web.mp4'))
  console.log(`click tab ${i} ${label} -> mp4 requests: ${m.length}`)
  m.forEach((u) => console.log('   ', u))
}
await browser.close()