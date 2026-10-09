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
const failed = []
const errors = []
page.on('response', (r) => {
  if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`)
})
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${m.text()}`.slice(0, 200))
})
await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1200)

const stage = page.locator('.stage')
async function seekTo(t) {
  await page.evaluate(async (time) => {
    const v = document.querySelector('.stage__video')
    v.pause()
    v.currentTime = time
    await new Promise((r) => v.addEventListener('seeked', r, { once: true }))
  }, t)
  await page.waitForTimeout(350)
}

const tabs = await page.locator('.task-tabs [role="tab"]').all()
console.log('tabs:', tabs.length)
for (let i = 0; i < tabs.length; i++) {
  const label = (await tabs[i].textContent()).trim()
  await tabs[i].click()
  await page.waitForTimeout(900)
  // industry needs a preset switch back to region-entry for the second visit
  if (label.includes('行业')) {
    const seg = page.locator('.stage-toolbar .segmented button')
    const n = await seg.count()
    if (n > 1 && i > 0) {
      await seg.nth(0).click()
      await page.waitForTimeout(700)
    }
  }
  const window = await page.evaluate(() => document.querySelector('.stage-controls input[type=range]')?.max)
  const start = await page.evaluate(() => Number(document.querySelector('.stage-controls input[type=range]').min))
  const mid = (Number(start) + (Number(window) - Number(start)) * 0.45) / 1000
  await seekTo(mid)
  await stage.screenshot({ path: path.join(OUT, `scn${i}-mid.png`) })
  const info = await page.evaluate(() => ({
    boxes: document.querySelectorAll('.ov-box').length,
    rois: document.querySelectorAll('.ov-region').length,
    trails: document.querySelectorAll('.ov-trail-line').length,
    toast: document.querySelector('.stage-toast')?.textContent?.trim() ?? '',
    result: document.querySelector('.result-bar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 160) ?? '',
    chain: [...document.querySelectorAll('.chain__node')].map((n) => n.textContent.replace(/\s+/g, ' ').trim()),
    toolbar: document.querySelector('.stage-toolbar')?.textContent?.replace(/\s+/g, ' ').trim().slice(0, 150) ?? '',
  }))
  console.log(`\n=== tab ${i} ${label} window=${start}..${window}`)
  console.log('  boxes', info.boxes, 'rois', info.rois, 'trails', info.trails)
  console.log('  toast:', info.toast)
  console.log('  result:', info.result)
  console.log('  chain:', info.chain.join(' | '))
  console.log('  toolbar:', info.toolbar)
}

console.log('\nfailed requests:', failed.length ? failed : 'none')
console.log('console:', errors.length ? errors : 'none')
await browser.close()
