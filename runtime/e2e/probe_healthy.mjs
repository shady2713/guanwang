import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:5178'
const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage()
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 8000 })
for (const t of [1000, 2000, 3500]) {
  await page.waitForTimeout(t === 1000 ? 1000 : 1500)
  const s = await page.evaluate(() => {
    const v = document.querySelector('.stage__video')
    const st = document.querySelector('.stage__status')
    return { readyState: v.readyState, networkState: v.networkState, preload: v.preload, t: +v.currentTime.toFixed(2),
      status: st?.textContent?.replace(/\s+/g,' ').trim(), state: st?.dataset.state, busy: document.querySelector('.stage')?.className,
      coverHidden: document.querySelector('.stage__cover')?.hidden, coverText: document.querySelector('.stage__cover-text')?.textContent }
  })
  console.log(t, JSON.stringify(s))
}
console.log('--- click play, then sample ---')
await page.click('[data-control="play"]')
for (let i = 0; i < 4; i++) {
  await page.waitForTimeout(900)
  const s = await page.evaluate(() => {
    const v = document.querySelector('.stage__video'); const st = document.querySelector('.stage__status')
    return { rs: v.readyState, paused: v.paused, t: +v.currentTime.toFixed(2), status: st?.textContent?.replace(/\s+/g,' ').trim(), state: st?.dataset.state }
  })
  console.log(' ', JSON.stringify(s))
}
await page.locator('.stage').screenshot({ path: 'C:/Users/64576/Desktop/视界/runtime/e2e/shots/probe-healthy-play.png' })
await browser.close()