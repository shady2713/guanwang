import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 1360, height: 800 } })
const page = await ctx.newPage()
const logs = []
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') logs.push(`console error: ${m.text()}`.slice(0, 160))
})
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1200)
const stage = page.locator('.stage')

async function seek(t) {
  await page.evaluate(async (time) => {
    const v = document.querySelector('.stage__video')
    v.pause()
    v.currentTime = time
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
  }, t)
  await page.waitForTimeout(320)
}
const modeButtons = page.locator('.stage-controls .segmented button')
console.log('modes:', (await modeButtons.allTextContents()).join(' / '))

await seek(2.4)
for (let i = 0; i < 3; i++) {
  await modeButtons.nth(i).click()
  await page.waitForTimeout(400)
  const info = await page.evaluate(() => ({
    divider: document.querySelector('.stage__divider')?.hidden ?? null,
    now: getComputedStyle(document.querySelector('.stage__svg--clipped')).display,
    visibleSvg: [...document.querySelectorAll('.stage__svg')].map((s) => s.className),
  }))
  console.log(`mode ${i}:`, JSON.stringify(info))
  await stage.screenshot({ path: path.join(OUT, `mode-${i}.png`) })
}

// drag the compare divider
const box = await stage.boundingBox()
await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5)
await page.mouse.down()
await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5, { steps: 8 })
await page.mouse.up()
await page.waitForTimeout(250)
const after = await page.evaluate(() => document.querySelector('.stage__divider')?.getAttribute('aria-valuenow'))
console.log('divider after drag:', after)
await stage.screenshot({ path: path.join(OUT, 'mode-compare-drag.png') })

// back to analysis, click the event toast
await modeButtons.nth(0).click()
await page.waitForTimeout(300)
await page.locator('.stage-toast').click().catch(() => console.log('no toast'))
await page.waitForTimeout(400)
const detail = await page.evaluate(() => document.querySelector('.result-bar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 200))
console.log('detail after toast click:', detail)
console.log('video paused after toast click:', await page.evaluate(() => document.querySelector('.stage__video').paused))

// switch industry preset to 车辆检测
const seg = page.locator('.stage-toolbar .segmented button')
await seg.nth(1).click()
await page.waitForTimeout(1200)
const det = await page.evaluate(() => ({
  chain: [...document.querySelectorAll('.chain__node')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
  result: document.querySelector('.result-bar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 120),
  rois: document.querySelectorAll('.ov-region').length,
  boxes: document.querySelectorAll('.ov-box').length,
}))
console.log('vehicle-detection preset:', JSON.stringify(det, null, 1))
await seek(3.0)
await stage.screenshot({ path: path.join(OUT, 'industry-detection.png') })

// replay from a mid position
await page.locator('[data-control="replay"]').click()
await page.waitForTimeout(600)
console.log('after replay t=', await page.evaluate(() => document.querySelector('.stage__video').currentTime))
console.log('logs:', logs.length ? logs : 'none')
await browser.close()
