import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178'
const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 } })
const page = await ctx.newPage()
const mp4 = []
page.on('request', (r) => { if (r.url().includes('.web.mp4')) mp4.push(Date.now() + ' ' + r.url().split('/').pop()) })
await page.route('**/media/*.web.mp4', (r) => r.abort('failed'))
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 8000 })
await page.waitForTimeout(2000)
console.log('error state:', await page.evaluate(() => JSON.stringify({ err: document.querySelector('.stage__video').error?.code, rs: document.querySelector('.stage__video').readyState })))
await page.unroute('**/media/*.web.mp4')
console.log('mp4 requests while failing:', mp4.length)

// click the (now) 重试 loading cover button
await page.locator('.stage__cover').click()
for (let i = 0; i < 5; i++) {
  await page.waitForTimeout(1000)
  console.log(' t+%ds', i + 1, await page.evaluate(() => JSON.stringify({ err: document.querySelector('.stage__video').error?.code ?? null, rs: document.querySelector('.stage__video').readyState, net: document.querySelector('.stage__video').networkState, status: document.querySelector('.stage__status')?.textContent?.trim(), state: document.querySelector('.stage__status')?.dataset.state })), 'mp4reqs=', mp4.length)
}
console.log('mp4 requests after retry click:', mp4.length)
await page.locator('.stage').screenshot({ path: 'C:/Users/64576/Desktop/视界/runtime/e2e/shots/probe-retry-recovery.png' })

// manual recovery experiments on the same element
for (const expr of [
  "v.load()",
  "v.src = v.src; v.load()",
  "v.setAttribute('preload','auto'); v.load()",
]) {
  await page.evaluate((e) => { const v = document.querySelector('.stage__video'); eval(e) }, expr)
  await page.waitForTimeout(1800)
  console.log(' expr[%s] ->', expr, await page.evaluate(() => JSON.stringify({ err: document.querySelector('.stage__video').error?.code ?? null, rs: document.querySelector('.stage__video').readyState })))
}
console.log('mp4 requests total:', mp4.length, JSON.stringify(mp4.slice(-5)))
await browser.close()