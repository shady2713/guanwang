import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const OUT = process.env.OUT ?? 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })

const log = (...a) => console.log('[e2e]', ...a)
const results = []
function check(id, ok, note) {
  results.push({ id, ok, note })
  log(`${ok ? 'PASS' : 'FAIL'} ${id} ${note ?? ''}`)
}

const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
const page = await context.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error' || m.type() === 'warning') consoleErrors.push(`${m.type()}: ${m.text()}`)
})
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`))
const mediaRequests = []
page.on('request', (r) => {
  if (r.url().endsWith('.mp4')) mediaRequests.push(r.url())
})

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1200)

// --- H01 hero / nav ---------------------------------------------------------
const h1 = (await page.textContent('h1')) ?? ''
check('H01.hero', h1.replace(/\s+/g, '').includes('不止于识别，更在于理解'), `h1="${h1.trim()}"`)
const brand = (await page.textContent('.brand')) ?? ''
check('H01.brand', brand.includes('视界 AIMaster'), `brand="${brand.trim()}"`)
const stageNotice = await page.getAttribute('#capabilities', 'data-status').catch(() => null)

// --- stage present ----------------------------------------------------------
const video = page.locator('.stage__video')
check('H02.video-present', (await video.count()) === 1, 'single video element')
const src0 = await video.getAttribute('src')
check('H19.single-media-first-load', mediaRequests.length <= 1, `mp4 requests so far: ${JSON.stringify(mediaRequests)}`)

// --- play and let the analysis run -----------------------------------------
await page.waitForTimeout(500)
const playBtn = page.locator('[data-control="play"]')
await playBtn.click()
await page.waitForTimeout(1500)
const t1 = await page.evaluate(() => {
  const v = document.querySelector('.stage__video')
  return v ? v.currentTime : -1
})
check('H05.plays', t1 > 0, `currentTime=${t1.toFixed(2)}`)
await page.screenshot({ path: path.join(OUT, 'desktop-industry-playing.png'), fullPage: false })

// pause -> overlay time must freeze
await playBtn.click()
const tPaused = await page.evaluate(() => document.querySelector('.stage__video').currentTime)
await page.waitForTimeout(700)
const tStill = await page.evaluate(() => document.querySelector('.stage__video').currentTime)
check('H05.pause-freezes', Math.abs(tPaused - tStill) < 0.02, `${tPaused.toFixed(2)} -> ${tStill.toFixed(2)}`)

fs.writeFileSync(path.join(OUT, 'result.json'), JSON.stringify({ results, consoleErrors, mediaRequests }, null, 2))
log('console:', JSON.stringify(consoleErrors.slice(0, 12), null, 1))
await browser.close()
