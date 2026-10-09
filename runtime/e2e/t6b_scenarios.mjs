// T6b: drive each scenario through the real scrubber control (values are MILLISECONDS
// relative to the window start; window start is not always 0).
import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:4180/aimaster'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage()
const bad = []; page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`) })
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 10000 })
await page.waitForTimeout(2000)
const tabs = await page.locator('.task-tabs [role="tab"]').all()
for (let i = 0; i < tabs.length; i++) {
  const label = (await tabs[i].textContent()).trim()
  await tabs[i].click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => document.querySelector('.stage__video')?.pause())
  const r = page.locator('.stage-controls input[type=range]')
  const min = Number(await r.inputValue())
  const max = Number(await r.getAttribute('max'))
  for (const frac of [0.5, 0.85]) {
    await r.fill(String(Math.round(min + (max - min) * frac)))
    await page.waitForTimeout(500)
    const s = await page.evaluate(() => {
      const v = document.querySelector('.stage__video')
      return { t: +v.currentTime.toFixed(2), paused: v.paused, boxes: document.querySelectorAll('.ov-box').length,
        regions: document.querySelectorAll('.ov-region').length, trails: document.querySelectorAll('.ov-trail-line').length,
        time: document.querySelector('.stage-controls__time')?.textContent?.trim(),
        toast: document.querySelector('.stage-toast')?.textContent?.replace(/\s+/g,' ').trim().slice(0,60) ?? '',
        status: document.querySelector('.stage__status')?.textContent?.replace(/\s+/g,' ').trim() ?? '' }
    })
    console.log(`tab${i} ${label.slice(0,4)} scrub=${frac} window=${min}..${max}ms -> t=${s.t} paused=${s.paused} clock=${s.time} boxes=${s.boxes} rois=${s.regions} trails=${s.trails} status=${JSON.stringify(s.status)} toast=${JSON.stringify(s.toast)}`)
  }
  await page.locator('.stage').screenshot({ path: `${OUT}/t6b-subdir-tab${i}.png` })
}
// vehicle-detection preset switch inside the industry scenario
await tabs[0].click(); await page.waitForTimeout(1200)
const segs = page.locator('.stage-toolbar .segmented button')
console.log('preset buttons:', await segs.count(), JSON.stringify(await segs.allTextContents()))
if (await segs.count() > 1) {
  await segs.nth(1).click(); await page.waitForTimeout(2000)
  console.log('vehicle-detection:', JSON.stringify(await page.evaluate(() => {
    const v = document.querySelector('.stage__video')
    return { t: +v.currentTime.toFixed(2), readyState: v.readyState, result: document.querySelector('.result-bar')?.textContent?.replace(/\s+/g,' ').trim().slice(0,60) } })))
  await page.locator('.stage').screenshot({ path: `${OUT}/t6b-subdir-vehicle.png` })
}
console.log('4xx:', bad.length ? bad : 'NONE')
await browser.close()