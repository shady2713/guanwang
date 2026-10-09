import { chromium } from 'playwright'
import fs from 'node:fs'
import path from 'node:path'

const BASE = process.env.BASE ?? 'http://127.0.0.1:5178/'
const OUT = 'C:/Users/64576/Desktop/视界/runtime/e2e/shots'
const EXE = 'C:/Users/64576/AppData/Local/ms-playwright/chromium-1243/chrome-win64/chrome.exe'
fs.mkdirSync(OUT, { recursive: true })
const log = (...a) => console.log('[shot]', ...a)

const browser = await chromium.launch({ executablePath: EXE, args: ['--autoplay-policy=no-user-gesture-required'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

async function openTab(index) {
  await page.locator('.task-tab').nth(index).click()
  await page.waitForTimeout(900)
}
async function stageShot(name) {
  await page.locator('.stage').scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  await page.locator('.stage').screenshot({ path: path.join(OUT, `${name}.png`) })
}
async function state() {
  return page.evaluate(() => {
    const v = document.querySelector('.stage__video')
    return {
      time: v ? +v.currentTime.toFixed(2) : -1,
      src: v ? new URL(v.src).pathname : '',
      boxes: document.querySelectorAll('.ov-box-hit').length / 2,
      regions: document.querySelectorAll('.ov-region').length / 2,
      chainNodes: document.querySelectorAll('.chain__node').length,
      activeNodes: document.querySelectorAll('.chain__node--active').length,
      result: (document.querySelector('.result-bar__title')?.textContent ?? '').trim(),
      empty: (document.querySelector('.result-bar__empty')?.textContent ?? '').trim(),
      summary: (document.querySelector('.stage-summary')?.textContent ?? '').trim(),
      status: (document.querySelector('.stage__status')?.textContent ?? '').trim(),
      toasts: [...document.querySelectorAll('.stage-toast')].map((t) => t.textContent.trim()),
    }
  })
}
async function playTo(sec, label) {
  await page.evaluate((s) => {
    const v = document.querySelector('.stage__video')
    v.pause()
  }, sec)
  await page.evaluate((s) => {
    const v = document.querySelector('.stage__video')
    v.currentTime = s
  }, sec)
  await page.waitForTimeout(450)
  const st = await state()
  log(`${label} t=${st.time} boxes=${st.boxes} regions=${st.regions} active=${st.activeNodes} result="${st.result}" toast=${JSON.stringify(st.toasts)} status="${st.status}"`)
  return st
}

await page.goto(BASE, { waitUntil: 'load' })
await page.waitForTimeout(1200)

log('--- industry / region-entry ---')
for (const t of [0.5, 1.5, 2.5, 3.0, 3.5, 4.5]) {
  const st = await playTo(t, `industry t=${t}`)
  if ([2.5, 3.0, 3.5, 4.5].includes(t)) await stageShot(`industry-region-t${t}`)
}

log('--- industry / vehicle-detection ---')
await page.getByRole('button', { name: '车辆检测', exact: true }).click()
await page.waitForTimeout(900)
log(JSON.stringify(await state()))
for (const t of [1.5, 3.5]) {
  await playTo(t, `industry-det t=${t}`)
  await stageShot(`industry-detection-t${t}`)
}

log('--- language ---')
await openTab(1)
for (const t of [6.6, 7.5, 8.5, 9.5]) {
  const st = await playTo(t, `language t=${t}`)
  await stageShot(`language-t${t}`)
}

log('--- image search ---')
await openTab(2)
for (const t of [6.2, 7.5, 9.4]) {
  const st = await playTo(t, `image t=${t}`)
  await stageShot(`image-t${t}`)
}

log('errors:', JSON.stringify(errors.slice(0, 10)))
await browser.close()
