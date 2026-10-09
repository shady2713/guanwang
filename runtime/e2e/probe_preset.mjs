import { chromium } from 'playwright'
const BASE = process.env.BASE ?? 'http://127.0.0.1:4180/aimaster'
const browser = await chromium.launch({ executablePath: 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe' })
const page = await (await browser.newContext({ viewport: { width: 1360, height: 800 } })).newPage()
await page.goto(`${BASE}/`, { waitUntil: 'load' })
await page.waitForSelector('.stage__video', { timeout: 10000 })
await page.waitForTimeout(1800)
const dump = async (tag) => {
  const s = await page.evaluate(() => ({
    toolbarText: document.querySelector('.stage-toolbar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120) ?? null,
    segCount: document.querySelectorAll('.stage-toolbar .segmented button').length,
    segTexts: [...document.querySelectorAll('.stage-toolbar .segmented button')].map((b) => ({ t: b.textContent.trim(), on: b.className, aria: b.getAttribute('aria-checked') ?? b.getAttribute('aria-pressed') })),
    allToolbarEls: [...(document.querySelector('.stage-toolbar')?.children ?? [])].map((e) => e.tagName + '.' + e.className),
    activeTab: document.querySelector('.task-tabs [aria-selected="true"]')?.textContent?.replace(/\s+/g,' ').trim().slice(0,10),
    stage: (() => { const v = document.querySelector('.stage__video'); return { src: v?.currentSrc?.split('/').pop(), t: +(v?.currentTime ?? -1).toFixed(2), err: v?.error?.code ?? null, rs: v?.readyState } })(),
    status: document.querySelector('.stage__status')?.textContent?.replace(/\s+/g,' ').trim(),
    result: document.querySelector('.result-bar')?.textContent?.replace(/\s+/g,' ').trim().slice(0,50),
    boxes: document.querySelectorAll('.ov-box').length,
  }))
  console.log(tag, JSON.stringify(s))
}
await dump('visit1 industry:')
await page.locator('.task-tabs [role="tab"]').nth(1).click(); await page.waitForTimeout(1500)
await dump('visit2 language:')
await page.locator('.task-tabs [role="tab"]').nth(0).click(); await page.waitForTimeout(1800)
await dump('visit3 industry again:')
const segs = page.locator('.stage-toolbar .segmented button')
if (await segs.count() > 1) {
  await segs.nth(1).click(); await page.waitForTimeout(1800)
  await dump('after switching to 车辆检测:')
  console.log('  video src now:', await page.evaluate(() => document.querySelector('.stage__video')?.currentSrc))
}
await browser.close()